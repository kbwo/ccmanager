import {execSync} from 'child_process';
import {existsSync, statSync, cpSync} from 'fs';
import path from 'path';
import {Effect} from 'effect';
import {
	Worktree,
	AmbiguousBranchError,
	RemoteBranchMatch,
} from '../types/index.js';
import {GitError, FileSystemError} from '../types/errors.js';
import {setWorktreeParentBranchLegacy} from '../utils/worktreeConfig.js';
import {
	getClaudeProjectsDirLegacy as getClaudeProjectsDir,
	pathToClaudeProjectName,
} from '../utils/claudeDir.js';
import {executeWorktreePostCreationHookLegacy as executeWorktreePostCreationHook} from '../utils/hookExecutor.js';
import {configurationManager} from './configurationManager.js';

const CLAUDE_DIR = '.claude';

export class WorktreeService {
	private rootPath: string;
	private gitRootPath: string;

	constructor(rootPath?: string) {
		this.rootPath = path.resolve(rootPath || process.cwd());
		// Get the actual git repository root for worktree operations
		this.gitRootPath = this.getGitRepositoryRoot();
	}

	private getGitRepositoryRoot(): string {
		try {
			// Get the common git directory
			const gitCommonDir = execSync('git rev-parse --git-common-dir', {
				cwd: this.rootPath,
				encoding: 'utf8',
			}).trim();

			// Make sure we have an absolute path
			const absoluteGitCommonDir = path.isAbsolute(gitCommonDir)
				? gitCommonDir
				: path.resolve(this.rootPath, gitCommonDir);

			// Handle worktree paths: if path contains .git/worktrees, we need to find the real .git parent
			if (absoluteGitCommonDir.includes('.git/worktrees')) {
				// Extract the path up to and including .git
				const gitIndex = absoluteGitCommonDir.indexOf('.git');
				const gitPath = absoluteGitCommonDir.substring(0, gitIndex + 4);
				// The parent of .git is the actual repository root
				return path.dirname(gitPath);
			}

			// For regular .git directories, the parent is the repository root
			return path.dirname(absoluteGitCommonDir);
		} catch {
			// Fallback to current directory if command fails - ensure it's absolute
			return path.resolve(this.rootPath);
		}
	}

	getWorktrees(): Worktree[] {
		try {
			const output = execSync('git worktree list --porcelain', {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			const worktrees: Worktree[] = [];
			const lines = output.trim().split('\n');

			const parseWorktree = (
				lines: string[],
				startIndex: number,
			): [Worktree | null, number] => {
				const worktreeLine = lines[startIndex];
				if (!worktreeLine?.startsWith('worktree ')) {
					return [null, startIndex];
				}

				const worktree: Worktree = {
					path: worktreeLine.substring(9),
					isMainWorktree: false,
					hasSession: false,
				};

				let i = startIndex + 1;
				while (
					i < lines.length &&
					lines[i] &&
					!lines[i]!.startsWith('worktree ')
				) {
					const line = lines[i];
					if (line && line.startsWith('branch ')) {
						const branch = line.substring(7);
						worktree.branch = branch.startsWith('refs/heads/')
							? branch.substring(11)
							: branch;
					} else if (line === 'bare') {
						worktree.isMainWorktree = true;
					}
					i++;
				}

				return [worktree, i];
			};

			let index = 0;
			while (index < lines.length) {
				const [worktree, nextIndex] = parseWorktree(lines, index);
				if (worktree) {
					worktrees.push(worktree);
				}
				index = nextIndex > index ? nextIndex : index + 1;
			}

			// Mark the first worktree as main if none are marked
			if (worktrees.length > 0 && !worktrees.some(w => w.isMainWorktree)) {
				worktrees[0]!.isMainWorktree = true;
			}

			return worktrees;
		} catch (_error) {
			// If git worktree command fails, assume we're in a regular git repo
			return [
				{
					path: this.rootPath,
					branch: this.getCurrentBranch(),
					isMainWorktree: true,
					hasSession: false,
				},
			];
		}
	}

	private getCurrentBranch(): string {
		try {
			const branch = execSync('git rev-parse --abbrev-ref HEAD', {
				cwd: this.rootPath,
				encoding: 'utf8',
			}).trim();
			return branch;
		} catch {
			return 'unknown';
		}
	}

	isGitRepository(): boolean {
		return existsSync(path.join(this.rootPath, '.git'));
	}

	getGitRootPath(): string {
		return this.gitRootPath;
	}

	getDefaultBranch(): string {
		try {
			// Try to get the default branch from origin
			const defaultBranch = execSync(
				"git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'",
				{
					cwd: this.rootPath,
					encoding: 'utf8',
					shell: '/bin/bash',
				},
			).trim();
			return defaultBranch || 'main';
		} catch {
			// Fallback to common default branch names
			try {
				execSync('git rev-parse --verify main', {
					cwd: this.rootPath,
					encoding: 'utf8',
				});
				return 'main';
			} catch {
				try {
					execSync('git rev-parse --verify master', {
						cwd: this.rootPath,
						encoding: 'utf8',
					});
					return 'master';
				} catch {
					return 'main';
				}
			}
		}
	}

	getAllBranches(): string[] {
		try {
			const output = execSync(
				"git branch -a --format='%(refname:short)' | grep -v HEAD | sort -u",
				{
					cwd: this.rootPath,
					encoding: 'utf8',
					shell: '/bin/bash',
				},
			);

			const branches = output
				.trim()
				.split('\n')
				.filter(branch => branch && !branch.startsWith('origin/'))
				.map(branch => branch.trim());

			// Also include remote branches without origin/ prefix
			const remoteBranches = output
				.trim()
				.split('\n')
				.filter(branch => branch.startsWith('origin/'))
				.map(branch => branch.replace('origin/', ''));

			// Merge and deduplicate
			const allBranches = [...new Set([...branches, ...remoteBranches])];

			return allBranches.filter(branch => branch);
		} catch {
			return [];
		}
	}

	/**
	 * Resolves a branch name to its proper git reference.
	 * Handles multiple remotes and throws AmbiguousBranchError when disambiguation is needed.
	 *
	 * Priority order:
	 * 1. Local branch exists -> return as-is
	 * 2. Single remote branch -> return remote/branch
	 * 3. Multiple remote branches -> throw AmbiguousBranchError
	 * 4. No branches found -> return original (let git handle error)
	 */
	private resolveBranchReference(branchName: string): string {
		try {
			// First check if local branch exists (highest priority)
			try {
				execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
					cwd: this.rootPath,
					encoding: 'utf8',
				});
				// Local branch exists, use it as-is
				return branchName;
			} catch {
				// Local branch doesn't exist, check remotes
			}

			// Get all remotes
			const remotes = this.getAllRemotes();
			const remoteBranchMatches: RemoteBranchMatch[] = [];

			// Check each remote for the branch
			for (const remote of remotes) {
				try {
					execSync(
						`git show-ref --verify --quiet refs/remotes/${remote}/${branchName}`,
						{
							cwd: this.rootPath,
							encoding: 'utf8',
						},
					);
					// Remote branch exists
					remoteBranchMatches.push({
						remote,
						branch: branchName,
						fullRef: `${remote}/${branchName}`,
					});
				} catch {
					// This remote doesn't have the branch, continue
				}
			}

			// Handle results based on number of matches
			if (remoteBranchMatches.length === 0) {
				// No remote branches found, return original (let git handle the error)
				return branchName;
			} else if (remoteBranchMatches.length === 1) {
				// Single remote branch found, use it
				return remoteBranchMatches[0]!.fullRef;
			} else {
				// Multiple remote branches found, throw ambiguous error
				throw new AmbiguousBranchError(branchName, remoteBranchMatches);
			}
		} catch (error) {
			// Re-throw AmbiguousBranchError as-is
			if (error instanceof AmbiguousBranchError) {
				throw error;
			}
			// For any other error, return original branch name
			return branchName;
		}
	}

	/**
	 * Gets all git remotes for this repository.
	 */
	private getAllRemotes(): string[] {
		try {
			const output = execSync('git remote', {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			return output
				.trim()
				.split('\n')
				.filter(remote => remote.length > 0);
		} catch {
			// If git remote fails, return empty array
			return [];
		}
	}

	async createWorktree(
		worktreePath: string,
		branch: string,
		baseBranch: string,
		copySessionData = false,
		copyClaudeDirectory: boolean = false,
	): Promise<{success: boolean; error?: string}> {
		try {
			// Resolve the worktree path relative to the git repository root
			const resolvedPath = path.isAbsolute(worktreePath)
				? worktreePath
				: path.join(this.gitRootPath, worktreePath);

			// Check if branch exists
			let branchExists = false;
			try {
				execSync(`git rev-parse --verify ${branch}`, {
					cwd: this.rootPath,
					encoding: 'utf8',
				});
				branchExists = true;
			} catch {
				// Branch doesn't exist
			}

			// Create the worktree
			let command: string;
			if (branchExists) {
				command = `git worktree add "${resolvedPath}" "${branch}"`;
			} else {
				// Resolve the base branch to its proper git reference
				try {
					const resolvedBaseBranch = this.resolveBranchReference(baseBranch);
					// Create new branch from specified base branch
					command = `git worktree add -b "${branch}" "${resolvedPath}" "${resolvedBaseBranch}"`;
				} catch (error) {
					if (error instanceof AmbiguousBranchError) {
						// TODO: Future enhancement - show disambiguation modal in UI
						// The UI should present the available remote options to the user:
						// - origin/foo/bar-xyz
						// - upstream/foo/bar-xyz
						// For now, return error message to be displayed to user
						return {
							success: false,
							error: error.message,
						};
					}
					// Re-throw any other errors
					throw error;
				}
			}

			execSync(command, {
				cwd: this.gitRootPath, // Execute from git root to ensure proper resolution
				encoding: 'utf8',
			});

			// Copy session data if requested
			if (copySessionData) {
				this.copyClaudeSessionData(this.rootPath, resolvedPath);
			}

			// Store the parent branch in worktree config
			try {
				setWorktreeParentBranchLegacy(resolvedPath, baseBranch);
			} catch (error) {
				console.error(
					'Warning: Failed to set parent branch in worktree config:',
					error,
				);
			}

			// Copy .claude directory if requested
			if (copyClaudeDirectory) {
				try {
					this.copyClaudeDirectoryFromBaseBranch(resolvedPath, baseBranch);
				} catch (error) {
					console.error('Warning: Failed to copy .claude directory:', error);
				}
			}

			// Execute post-creation hook if configured
			const worktreeHooks = configurationManager.getWorktreeHooks();
			if (
				worktreeHooks.post_creation?.enabled &&
				worktreeHooks.post_creation?.command
			) {
				// Create a worktree object for the hook
				const newWorktree: Worktree = {
					path: resolvedPath,
					branch: branch,
					isMainWorktree: false,
					hasSession: false,
				};

				// Execute the hook synchronously (blocking)
				// Wait for the hook to complete before returning
				await executeWorktreePostCreationHook(
					worktreeHooks.post_creation.command,
					newWorktree,
					this.gitRootPath,
					baseBranch,
				);
			}

			return {success: true};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'Failed to create worktree',
			};
		}
	}

	deleteWorktree(
		worktreePath: string,
		options?: {deleteBranch?: boolean},
	): {success: boolean; error?: string} {
		try {
			// Get the worktree info to find the branch
			const worktrees = this.getWorktrees();
			const worktree = worktrees.find(wt => wt.path === worktreePath);

			if (!worktree) {
				return {
					success: false,
					error: 'Worktree not found',
				};
			}

			if (worktree.isMainWorktree) {
				return {
					success: false,
					error: 'Cannot delete the main worktree',
				};
			}

			// Remove the worktree
			execSync(`git worktree remove "${worktreePath}" --force`, {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			// Delete the branch if requested (default to true for backward compatibility)
			const deleteBranch = options?.deleteBranch ?? true;
			if (deleteBranch && worktree.branch) {
				const branchName = worktree.branch.replace('refs/heads/', '');
				try {
					execSync(`git branch -D "${branchName}"`, {
						cwd: this.rootPath,
						encoding: 'utf8',
					});
				} catch {
					// Branch might not exist or might be checked out elsewhere
					// This is not a fatal error
				}
			}

			return {success: true};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'Failed to delete worktree',
			};
		}
	}

	mergeWorktree(
		sourceBranch: string,
		targetBranch: string,
		useRebase: boolean = false,
	): {success: boolean; error?: string} {
		try {
			// Get worktrees to find the target worktree path
			const worktrees = this.getWorktrees();
			const targetWorktree = worktrees.find(
				wt =>
					wt.branch && wt.branch.replace('refs/heads/', '') === targetBranch,
			);

			if (!targetWorktree) {
				return {
					success: false,
					error: 'Target branch worktree not found',
				};
			}

			// Perform the merge or rebase in the target worktree
			if (useRebase) {
				// For rebase, we need to checkout source branch and rebase it onto target
				const sourceWorktree = worktrees.find(
					wt =>
						wt.branch && wt.branch.replace('refs/heads/', '') === sourceBranch,
				);

				if (!sourceWorktree) {
					return {
						success: false,
						error: 'Source branch worktree not found',
					};
				}

				// Rebase source branch onto target branch
				execSync(`git rebase "${targetBranch}"`, {
					cwd: sourceWorktree.path,
					encoding: 'utf8',
				});

				// After rebase, merge the rebased source branch into target branch
				execSync(`git merge --ff-only "${sourceBranch}"`, {
					cwd: targetWorktree.path,
					encoding: 'utf8',
				});
			} else {
				// Regular merge
				execSync(`git merge --no-ff "${sourceBranch}"`, {
					cwd: targetWorktree.path,
					encoding: 'utf8',
				});
			}

			return {success: true};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: useRebase
							? 'Failed to rebase branches'
							: 'Failed to merge branches',
			};
		}
	}

	deleteWorktreeByBranch(branch: string): {success: boolean; error?: string} {
		try {
			// Get worktrees to find the worktree by branch
			const worktrees = this.getWorktrees();
			const worktree = worktrees.find(
				wt => wt.branch && wt.branch.replace('refs/heads/', '') === branch,
			);

			if (!worktree) {
				return {
					success: false,
					error: 'Worktree not found for branch',
				};
			}

			return this.deleteWorktree(worktree.path);
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Failed to delete worktree by branch',
			};
		}
	}

	private copyClaudeSessionData(
		sourceWorktreePath: string,
		targetWorktreePath: string,
	): void {
		try {
			const projectsDir = getClaudeProjectsDir();
			if (!existsSync(projectsDir)) {
				throw new Error(
					`Claude projects directory does not exist: ${projectsDir}`,
				);
			}

			// Convert paths to Claude's naming convention
			const sourceProjectName = pathToClaudeProjectName(sourceWorktreePath);
			const targetProjectName = pathToClaudeProjectName(targetWorktreePath);

			const sourceProjectDir = path.join(projectsDir, sourceProjectName);
			const targetProjectDir = path.join(projectsDir, targetProjectName);

			// Only copy if source project exists
			if (existsSync(sourceProjectDir)) {
				cpSync(sourceProjectDir, targetProjectDir, {
					recursive: true,
					force: true,
					errorOnExist: false,
					preserveTimestamps: true,
				});
			}
		} catch (error) {
			console.error(`Failed to copy Claude session data: ${error}`);
			throw new Error(`Failed to copy Claude session data: ${error}`);
		}
	}

	hasClaudeDirectoryInBranch(branchName: string): boolean {
		// Find the worktree directory for the branch
		const worktrees = this.getWorktrees();
		let targetWorktree = worktrees.find(
			wt => wt.branch && wt.branch.replace('refs/heads/', '') === branchName,
		);

		// If branch worktree not found, try the default branch
		if (!targetWorktree) {
			const defaultBranch = this.getDefaultBranch();
			if (branchName === defaultBranch) {
				targetWorktree = worktrees.find(
					wt =>
						wt.branch && wt.branch.replace('refs/heads/', '') === defaultBranch,
				);
			}
		}

		// If still not found and it's the default branch, try the main worktree
		if (!targetWorktree && branchName === this.getDefaultBranch()) {
			targetWorktree = worktrees.find(wt => wt.isMainWorktree);
		}

		if (!targetWorktree) {
			return false;
		}

		// Check if .claude directory exists in the worktree
		const claudePath = path.join(targetWorktree.path, CLAUDE_DIR);
		return existsSync(claudePath) && statSync(claudePath).isDirectory();
	}

	private copyClaudeDirectoryFromBaseBranch(
		worktreePath: string,
		baseBranch: string,
	): void {
		// Find the worktree directory for the base branch
		const worktrees = this.getWorktrees();
		let baseWorktree = worktrees.find(
			wt => wt.branch && wt.branch.replace('refs/heads/', '') === baseBranch,
		);

		// If base branch worktree not found, try the default branch
		if (!baseWorktree) {
			const defaultBranch = this.getDefaultBranch();
			baseWorktree = worktrees.find(
				wt =>
					wt.branch && wt.branch.replace('refs/heads/', '') === defaultBranch,
			);
		}

		// If still not found, try the main worktree
		if (!baseWorktree) {
			baseWorktree = worktrees.find(wt => wt.isMainWorktree);
		}

		if (!baseWorktree) {
			throw new Error('Could not find base worktree to copy settings from');
		}

		// Check if .claude directory exists in base worktree
		const sourceClaudeDir = path.join(baseWorktree.path, CLAUDE_DIR);

		if (
			!existsSync(sourceClaudeDir) ||
			!statSync(sourceClaudeDir).isDirectory()
		) {
			// No .claude directory to copy, this is fine
			return;
		}

		// Copy .claude directory to new worktree
		const targetClaudeDir = path.join(worktreePath, CLAUDE_DIR);
		cpSync(sourceClaudeDir, targetClaudeDir, {recursive: true});
	}

	/**
	 * Effect-based getWorktrees operation
	 * Returns Effect that may fail with GitError
	 *
	 * @returns {Effect.Effect<Worktree[], GitError, never>} Effect containing array of worktrees or GitError
	 *
	 * @example
	 * ```typescript
	 * import {Effect} from 'effect';
	 * import {WorktreeService} from './services/worktreeService.js';
	 *
	 * const service = new WorktreeService();
	 *
	 * // Execute in async context
	 * const worktrees = await Effect.runPromise(
	 *   service.getWorktreesEffect()
	 * );
	 *
	 * // Or use Effect.match for type-safe error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(service.getWorktreesEffect(), {
	 *     onFailure: (error: GitError) => ({
	 *       type: 'error' as const,
	 *       message: `Git error: ${error.stderr}`
	 *     }),
	 *     onSuccess: (worktrees: Worktree[]) => ({
	 *       type: 'success' as const,
	 *       data: worktrees
	 *     })
	 *   })
	 * );
	 *
	 * if (result.type === 'error') {
	 *   console.error(result.message);
	 * } else {
	 *   console.log(`Found ${result.data.length} worktrees`);
	 * }
	 * ```
	 *
	 * @throws {GitError} When git worktree list command fails
	 */
	getWorktreesEffect(): Effect.Effect<Worktree[], GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		return Effect.catchAll(
			Effect.try({
				try: () => {
					const output = execSync('git worktree list --porcelain', {
						cwd: self.rootPath,
						encoding: 'utf8',
					});

					const worktrees: Worktree[] = [];
					const lines = output.trim().split('\n');

					const parseWorktree = (
						lines: string[],
						startIndex: number,
					): [Worktree | null, number] => {
						const worktreeLine = lines[startIndex];
						if (!worktreeLine?.startsWith('worktree ')) {
							return [null, startIndex];
						}

						const worktree: Worktree = {
							path: worktreeLine.substring(9),
							isMainWorktree: false,
							hasSession: false,
						};

						let i = startIndex + 1;
						while (
							i < lines.length &&
							lines[i] &&
							!lines[i]!.startsWith('worktree ')
						) {
							const line = lines[i];
							if (line && line.startsWith('branch ')) {
								const branch = line.substring(7);
								worktree.branch = branch.startsWith('refs/heads/')
									? branch.substring(11)
									: branch;
							} else if (line === 'bare') {
								worktree.isMainWorktree = true;
							}
							i++;
						}

						return [worktree, i];
					};

					let index = 0;
					while (index < lines.length) {
						const [worktree, nextIndex] = parseWorktree(lines, index);
						if (worktree) {
							worktrees.push(worktree);
						}
						index = nextIndex > index ? nextIndex : index + 1;
					}

					// Mark the first worktree as main if none are marked
					if (worktrees.length > 0 && !worktrees.some(w => w.isMainWorktree)) {
						worktrees[0]!.isMainWorktree = true;
					}

					return worktrees;
				},
				catch: (error: unknown) => error,
			}),
			(error: unknown) => {
				// If git worktree command not supported, fallback to single worktree
				const execError = error as {
					status?: number;
					stderr?: string;
					stdout?: string;
				};
				if (
					execError.status === 1 ||
					execError.stderr?.includes('unknown command')
				) {
					return Effect.succeed([
						{
							path: self.rootPath,
							branch: self.getCurrentBranch(),
							isMainWorktree: true,
							hasSession: false,
						},
					]);
				}

				// For other errors, wrap in GitError
				return Effect.fail(
					new GitError({
						command: 'git worktree list --porcelain',
						exitCode: execError.status || 1,
						stderr: execError.stderr || String(error),
						stdout: execError.stdout,
					}),
				);
			},
		);
	}

	/**
	 * Effect-based createWorktree operation
	 * May fail with GitError or FileSystemError
	 *
	 * @param {string} worktreePath - Path where the new worktree will be created
	 * @param {string} branch - Name of the branch for the new worktree
	 * @param {string} baseBranch - Base branch to create the new branch from
	 * @param {boolean} copySessionData - Whether to copy Claude session data (default: false)
	 * @param {boolean} copyClaudeDirectory - Whether to copy .claude directory (default: false)
	 * @returns {Effect.Effect<Worktree, GitError | FileSystemError, never>} Effect containing created worktree or error
	 *
	 * @example
	 * ```typescript
	 * import {Effect} from 'effect';
	 * import {WorktreeService} from './services/worktreeService.js';
	 * import {GitError, FileSystemError} from './types/errors.js';
	 *
	 * const service = new WorktreeService();
	 *
	 * // Create new worktree with Effect.match for error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(
	 *     service.createWorktreeEffect(
	 *       './feature-branch',
	 *       'feature-xyz',
	 *       'main',
	 *       true, // copy session data
	 *       false
	 *     ),
	 *     {
	 *       onFailure: (error: GitError | FileSystemError) => {
	 *         switch (error._tag) {
	 *           case 'GitError':
	 *             return {type: 'error' as const, msg: `Git failed: ${error.stderr}`};
	 *           case 'FileSystemError':
	 *             return {type: 'error' as const, msg: `FS failed: ${error.cause}`};
	 *         }
	 *       },
	 *       onSuccess: (worktree: Worktree) => ({
	 *         type: 'success' as const,
	 *         data: worktree
	 *       })
	 *     }
	 *   )
	 * );
	 *
	 * if (result.type === 'error') {
	 *   console.error(result.msg);
	 * } else {
	 *   console.log(`Created worktree at ${result.data.path}`);
	 * }
	 * ```
	 *
	 * @throws {GitError} When git worktree add command fails
	 * @throws {FileSystemError} When session data copy fails
	 */
	createWorktreeEffect(
		worktreePath: string,
		branch: string,
		baseBranch: string,
		copySessionData = false,
		copyClaudeDirectory = false,
	): Effect.Effect<Worktree, GitError | FileSystemError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;

		return Effect.gen(function* () {
			// Resolve the worktree path relative to the git repository root
			const gitRootPath = yield* Effect.sync(() =>
				execSync('git rev-parse --git-common-dir', {
					cwd: self.rootPath,
					encoding: 'utf8',
				}).trim(),
			);

			const absoluteGitRoot = path.isAbsolute(gitRootPath)
				? path.dirname(gitRootPath)
				: path.resolve(self.rootPath, path.dirname(gitRootPath));

			const resolvedPath = path.isAbsolute(worktreePath)
				? worktreePath
				: path.join(absoluteGitRoot, worktreePath);

			// Check if branch exists
			const branchExists = yield* Effect.catchAll(
				Effect.try({
					try: () => {
						execSync(`git rev-parse --verify ${branch}`, {
							cwd: self.rootPath,
							encoding: 'utf8',
						});
						return true;
					},
					catch: (error: unknown) => error,
				}),
				() => Effect.succeed(false),
			);

			// Create the worktree command
			let command: string;
			if (branchExists) {
				command = `git worktree add "${resolvedPath}" "${branch}"`;
			} else {
				// Resolve the base branch to its proper git reference
				const resolvedBaseBranch = self.resolveBranchReference(baseBranch);
				command = `git worktree add -b "${branch}" "${resolvedPath}" "${resolvedBaseBranch}"`;
			}

			// Execute the worktree creation command
			yield* Effect.try({
				try: () => {
					execSync(command, {
						cwd: absoluteGitRoot,
						encoding: 'utf8',
					});
				},
				catch: (error: unknown) => {
					const execError = error as {
						status?: number;
						stderr?: string;
						stdout?: string;
					};
					return new GitError({
						command,
						exitCode: execError.status || 1,
						stderr: execError.stderr || String(error),
						stdout: execError.stdout,
					});
				},
			});

			// Copy session data if requested
			if (copySessionData) {
				yield* Effect.try({
					try: () => self.copyClaudeSessionData(self.rootPath, resolvedPath),
					catch: (error: unknown) =>
						new FileSystemError({
							operation: 'write',
							path: resolvedPath,
							cause: String(error),
						}),
				});
			}

			// Store the parent branch in worktree config
			yield* Effect.catchAll(
				Effect.try({
					try: () => setWorktreeParentBranchLegacy(resolvedPath, baseBranch),
					catch: (error: unknown) => error,
				}),
				(_error: unknown) => {
					// Log warning but don't fail
					console.error(
						'Warning: Failed to set parent branch in worktree config:',
						_error,
					);
					return Effect.succeed(undefined);
				},
			);

			// Copy .claude directory if requested
			if (copyClaudeDirectory) {
				yield* Effect.catchAll(
					Effect.try({
						try: () =>
							self.copyClaudeDirectoryFromBaseBranch(resolvedPath, baseBranch),
						catch: (error: unknown) => error,
					}),
					(error: unknown) => {
						console.error('Warning: Failed to copy .claude directory:', error);
						return Effect.succeed(undefined);
					},
				);
			}

			// Execute post-creation hook if configured
			const worktreeHooks = configurationManager.getWorktreeHooks();
			if (
				worktreeHooks.post_creation?.enabled &&
				worktreeHooks.post_creation?.command
			) {
				const newWorktree: Worktree = {
					path: resolvedPath,
					branch: branch,
					isMainWorktree: false,
					hasSession: false,
				};

				yield* Effect.promise(() =>
					executeWorktreePostCreationHook(
						worktreeHooks.post_creation!.command,
						newWorktree,
						absoluteGitRoot,
						baseBranch,
					),
				);
			}

			return {
				path: resolvedPath,
				branch,
				isMainWorktree: false,
				hasSession: false,
			};
		});
	}

	/**
	 * Effect-based deleteWorktree operation
	 * May fail with GitError
	 *
	 * @param {string} worktreePath - Path of the worktree to delete
	 * @param {{deleteBranch?: boolean}} options - Options for deletion (default: deleteBranch = true)
	 * @returns {Effect.Effect<void, GitError, never>} Effect that completes successfully or fails with GitError
	 *
	 * @example
	 * ```typescript
	 * import {Effect} from 'effect';
	 * import {WorktreeService} from './services/worktreeService.js';
	 *
	 * const service = new WorktreeService();
	 *
	 * // Delete worktree with Effect.catchTag for specific error handling
	 * await Effect.runPromise(
	 *   Effect.catchTag(
	 *     service.deleteWorktreeEffect('./feature-branch', {deleteBranch: true}),
	 *     'GitError',
	 *     (error) => {
	 *       console.error(`Failed to delete worktree: ${error.stderr}`);
	 *       return Effect.succeed(undefined); // Continue despite error
	 *     }
	 *   )
	 * );
	 * ```
	 *
	 * @throws {GitError} When git worktree remove command fails or worktree not found
	 */
	deleteWorktreeEffect(
		worktreePath: string,
		options?: {deleteBranch?: boolean},
	): Effect.Effect<void, GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;

		return Effect.gen(function* () {
			// Get the worktree info to find the branch
			const worktrees = yield* self.getWorktreesEffect();
			const worktree = worktrees.find(wt => wt.path === worktreePath);

			if (!worktree) {
				return yield* Effect.fail(
					new GitError({
						command: 'git worktree remove',
						exitCode: 1,
						stderr: 'Worktree not found',
					}),
				);
			}

			if (worktree.isMainWorktree) {
				return yield* Effect.fail(
					new GitError({
						command: 'git worktree remove',
						exitCode: 1,
						stderr: 'Cannot delete the main worktree',
					}),
				);
			}

			// Remove the worktree
			yield* Effect.try({
				try: () => {
					execSync(`git worktree remove "${worktreePath}" --force`, {
						cwd: self.rootPath,
						encoding: 'utf8',
					});
				},
				catch: (error: unknown) => {
					const execError = error as {
						status?: number;
						stderr?: string;
						stdout?: string;
					};
					return new GitError({
						command: `git worktree remove "${worktreePath}" --force`,
						exitCode: execError.status || 1,
						stderr: execError.stderr || String(error),
						stdout: execError.stdout,
					});
				},
			});

			// Delete the branch if requested (default to true for backward compatibility)
			const deleteBranch = options?.deleteBranch ?? true;
			if (deleteBranch && worktree.branch) {
				const branchName = worktree.branch.replace('refs/heads/', '');
				yield* Effect.catchAll(
					Effect.try({
						try: () => {
							execSync(`git branch -D "${branchName}"`, {
								cwd: self.rootPath,
								encoding: 'utf8',
							});
						},
						catch: (error: unknown) => error,
					}),
					(_error: unknown) => {
						// Branch might not exist or might be checked out elsewhere
						// This is not a fatal error
						return Effect.succeed(undefined);
					},
				);
			}
		});
	}

	/**
	 * Effect-based mergeWorktree operation
	 * May fail with GitError
	 *
	 * @param {string} sourceBranch - Branch to merge from
	 * @param {string} targetBranch - Branch to merge into
	 * @param {boolean} useRebase - Whether to use rebase instead of merge (default: false)
	 * @returns {Effect.Effect<void, GitError, never>} Effect that completes successfully or fails with GitError
	 *
	 * @example
	 * ```typescript
	 * import {Effect} from 'effect';
	 * import {WorktreeService} from './services/worktreeService.js';
	 *
	 * const service = new WorktreeService();
	 *
	 * // Merge with Effect.all for parallel operations
	 * await Effect.runPromise(
	 *   Effect.all([
	 *     service.mergeWorktreeEffect('feature-1', 'main', false),
	 *     service.mergeWorktreeEffect('feature-2', 'main', false)
	 *   ], {concurrency: 1}) // Sequential to avoid conflicts
	 * );
	 *
	 * // Or use Effect.catchAll for fallback behavior
	 * const result = await Effect.runPromise(
	 *   Effect.catchAll(
	 *     service.mergeWorktreeEffect('feature-xyz', 'main', true),
	 *     (error: GitError) => {
	 *       console.error(`Merge failed: ${error.stderr}`);
	 *       // Return alternative Effect or rethrow
	 *       return Effect.fail(error);
	 *     }
	 *   )
	 * );
	 * ```
	 *
	 * @throws {GitError} When git merge/rebase command fails or worktrees not found
	 */
	mergeWorktreeEffect(
		sourceBranch: string,
		targetBranch: string,
		useRebase = false,
	): Effect.Effect<void, GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;

		return Effect.gen(function* () {
			// Get worktrees to find the target worktree path
			const worktrees = yield* self.getWorktreesEffect();
			const targetWorktree = worktrees.find(
				wt =>
					wt.branch && wt.branch.replace('refs/heads/', '') === targetBranch,
			);

			if (!targetWorktree) {
				return yield* Effect.fail(
					new GitError({
						command: useRebase ? 'git rebase' : 'git merge',
						exitCode: 1,
						stderr: 'Target branch worktree not found',
					}),
				);
			}

			// Perform the merge or rebase in the target worktree
			if (useRebase) {
				// For rebase, we need to checkout source branch and rebase it onto target
				const sourceWorktree = worktrees.find(
					wt =>
						wt.branch && wt.branch.replace('refs/heads/', '') === sourceBranch,
				);

				if (!sourceWorktree) {
					return yield* Effect.fail(
						new GitError({
							command: 'git rebase',
							exitCode: 1,
							stderr: 'Source branch worktree not found',
						}),
					);
				}

				// Rebase source branch onto target branch
				yield* Effect.try({
					try: () => {
						execSync(`git rebase "${targetBranch}"`, {
							cwd: sourceWorktree.path,
							encoding: 'utf8',
						});
					},
					catch: (error: unknown) => {
						const execError = error as {
							status?: number;
							stderr?: string;
							stdout?: string;
						};
						return new GitError({
							command: `git rebase "${targetBranch}"`,
							exitCode: execError.status || 1,
							stderr: execError.stderr || String(error),
							stdout: execError.stdout,
						});
					},
				});

				// After rebase, merge the rebased source branch into target branch
				yield* Effect.try({
					try: () => {
						execSync(`git merge --ff-only "${sourceBranch}"`, {
							cwd: targetWorktree.path,
							encoding: 'utf8',
						});
					},
					catch: (error: unknown) => {
						const execError = error as {
							status?: number;
							stderr?: string;
							stdout?: string;
						};
						return new GitError({
							command: `git merge --ff-only "${sourceBranch}"`,
							exitCode: execError.status || 1,
							stderr: execError.stderr || String(error),
							stdout: execError.stdout,
						});
					},
				});
			} else {
				// Regular merge
				yield* Effect.try({
					try: () => {
						execSync(`git merge --no-ff "${sourceBranch}"`, {
							cwd: targetWorktree.path,
							encoding: 'utf8',
						});
					},
					catch: (error: unknown) => {
						const execError = error as {
							status?: number;
							stderr?: string;
							stdout?: string;
						};
						return new GitError({
							command: `git merge --no-ff "${sourceBranch}"`,
							exitCode: execError.status || 1,
							stderr: execError.stderr || String(error),
							stdout: execError.stdout,
						});
					},
				});
			}
		});
	}
}
