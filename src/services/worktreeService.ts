import {execSync} from 'child_process';
import {existsSync, statSync, cpSync} from 'fs';
import path from 'path';
import {
	Worktree,
	AmbiguousBranchError,
	RemoteBranchMatch,
} from '../types/index.js';
import {setWorktreeParentBranch} from '../utils/worktreeConfig.js';
import {
	getClaudeProjectsDir,
	pathToClaudeProjectName,
} from '../utils/claudeDir.js';
import {executeWorktreePostCreationHook} from '../utils/hookExecutor.js';
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
				setWorktreeParentBranch(resolvedPath, baseBranch);
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
}
