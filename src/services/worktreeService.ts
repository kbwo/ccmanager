import {execSync} from 'child_process';
import {existsSync, statSync, cpSync} from 'fs';
import path from 'path';
import {Effect, Either} from 'effect';
import {
	Worktree,
	AmbiguousBranchError,
	RemoteBranchMatch,
	MergeConfig,
} from '../types/index.js';
import {GitError, FileSystemError, ProcessError} from '../types/errors.js';
import {setWorktreeParentBranch} from '../utils/worktreeConfig.js';
import {
	getClaudeProjectsDir,
	pathToClaudeProjectName,
} from '../utils/claudeDir.js';
import {
	executeWorktreePostCreationHook,
	executeWorktreePreCreationHook,
} from '../utils/hookExecutor.js';
import {configReader} from './config/configReader.js';

const CLAUDE_DIR = '.claude';

// Module-level state for worktree last opened tracking (runtime state, not persisted)
const worktreeLastOpened: Map<string, number> = new Map();

/**
 * Get all worktree last opened timestamps
 */
export function getWorktreeLastOpened(): Record<string, number> {
	return Object.fromEntries(worktreeLastOpened);
}

/**
 * Set the last opened timestamp for a worktree
 */
export function setWorktreeLastOpened(
	worktreePath: string,
	timestamp: number,
): void {
	worktreeLastOpened.set(worktreePath, timestamp);
}

/**
 * Get the last opened timestamp for a specific worktree
 */
export function getWorktreeLastOpenedTime(
	worktreePath: string,
): number | undefined {
	return worktreeLastOpened.get(worktreePath);
}

/**
 * WorktreeService - Git worktree management with Effect-based error handling
 *
 * All public methods return Effect types for type-safe, composable error handling.
 * See CLAUDE.md for complete examples and patterns.
 *
 * ## Effect-ts Resources
 * - Effect Type: https://effect.website/docs/effect/effect-type
 * - Error Management: https://effect.website/docs/error-management/error-handling
 * - Effect Execution: https://effect.website/docs/guides/running-effects
 * - Tagged Errors: https://effect.website/docs/error-management/expected-errors#tagged-errors
 *
 * ## Key Concepts
 * - All operations return `Effect.Effect<T, E, never>` where T is success type, E is error type
 * - Execute Effects with `Effect.runPromise()` or `Effect.match()` for type-safe handling
 * - Use error discrimination via `error._tag` property for TypeScript type narrowing
 * - Compose Effects with `Effect.flatMap()`, `Effect.all()`, `Effect.catchTag()`, etc.
 *
 * @example
 * ```typescript
 * // See individual method JSDoc for specific usage examples
 * const service = new WorktreeService();
 * ```
 */
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

			// Handle submodule paths: if path contains .git/modules, use --show-toplevel
			// to get the submodule's actual working directory
			if (absoluteGitCommonDir.includes('.git/modules')) {
				const toplevel = execSync('git rev-parse --show-toplevel', {
					cwd: this.rootPath,
					encoding: 'utf8',
				}).trim();
				return toplevel;
			}

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
	isGitRepository(): boolean {
		return existsSync(path.join(this.rootPath, '.git'));
	}

	getGitRootPath(): string {
		return this.gitRootPath;
	}

	/**
	 * SYNCHRONOUS HELPER: Resolves a branch name to its proper git reference.
	 *
	 * This method remains synchronous as it's called within Effect.gen contexts
	 * but doesn't need to be wrapped in Effect itself. It's used by createWorktreeEffect()
	 * to resolve branch references before creating worktrees.
	 *
	 * Handles multiple remotes and throws AmbiguousBranchError when disambiguation is needed.
	 *
	 * Priority order:
	 * 1. Local branch exists -> return as-is
	 * 2. Single remote branch -> return remote/branch
	 * 3. Multiple remote branches -> throw AmbiguousBranchError
	 * 4. No branches found -> return original (let git handle error)
	 *
	 * @private
	 * @param {string} branchName - Branch name to resolve
	 * @returns {string} Resolved branch reference
	 * @throws {AmbiguousBranchError} When branch exists in multiple remotes
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
	 * SYNCHRONOUS HELPER: Gets all git remotes for this repository.
	 *
	 * This method remains synchronous as it's a simple utility used by resolveBranchReference().
	 * No need for Effect version since it's a pure read operation with no complex error handling.
	 *
	 * @private
	 * @returns {string[]} Array of remote names, empty array on error
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

	/**
	 * SYNCHRONOUS HELPER: Copies Claude Code session data between worktrees.
	 *
	 * This method remains synchronous and is wrapped in Effect.try when called from
	 * createWorktreeEffect() (line ~676). This provides proper error handling while
	 * keeping the implementation simple.
	 *
	 * @private
	 * @param {string} sourceWorktreePath - Source worktree path
	 * @param {string} targetWorktreePath - Target worktree path
	 * @throws {Error} When copy operation fails
	 */
	private copyClaudeSessionData(
		sourceWorktreePath: string,
		targetWorktreePath: string,
	): void {
		try {
			const projectsDirEither = getClaudeProjectsDir();
			if (Either.isLeft(projectsDirEither)) {
				throw new Error(
					`Could not determine Claude projects directory: ${projectsDirEither.left.field} ${projectsDirEither.left.constraint}`,
				);
			}
			const projectsDir = projectsDirEither.right;
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

	/**
	 * Effect-based hasClaudeDirectoryInBranch operation
	 * Checks if a .claude directory exists in the worktree for the specified branch
	 *
	 * @param {string} branchName - Name of the branch to check
	 * @returns {Effect.Effect<boolean, GitError, never>} Effect containing true if .claude directory exists, false otherwise
	 *
	 * @example
	 * ```typescript
	 * // Check if branch has .claude directory
	 * const hasClaudeDir = await Effect.runPromise(
	 *   effect
	 * );
	 *
	 * // Or use Effect.match for error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(effect, {
	 *     onFailure: (error: GitError) => ({
	 *       type: 'error' as const,
	 *       message: error.stderr
	 *     }),
	 *     onSuccess: (hasDir: boolean) => ({
	 *       type: 'success' as const,
	 *       data: hasDir
	 *     })
	 *   })
	 * );
	 * ```
	 *
	 * @throws {GitError} When git operations fail
	 */
	hasClaudeDirectoryInBranchEffect(
		branchName: string,
	): Effect.Effect<boolean, GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;

		return Effect.gen(function* () {
			// Get all worktrees
			const worktrees = yield* self.getWorktreesEffect();

			// Try to find worktree for the branch
			let targetWorktree = worktrees.find(
				wt => wt.branch && wt.branch.replace('refs/heads/', '') === branchName,
			);

			// If branch worktree not found, try the default branch
			if (!targetWorktree) {
				const defaultBranch = yield* self.getDefaultBranchEffect();
				if (branchName === defaultBranch) {
					targetWorktree = worktrees.find(
						wt =>
							wt.branch &&
							wt.branch.replace('refs/heads/', '') === defaultBranch,
					);
				}
			}

			// If still not found and it's the default branch, try the main worktree
			if (!targetWorktree) {
				const defaultBranch = yield* self.getDefaultBranchEffect();
				if (branchName === defaultBranch) {
					targetWorktree = worktrees.find(wt => wt.isMainWorktree);
				}
			}

			if (!targetWorktree) {
				return false;
			}

			// Check if .claude directory exists in the worktree
			const claudePath = path.join(targetWorktree.path, CLAUDE_DIR);
			return existsSync(claudePath) && statSync(claudePath).isDirectory();
		});
	}

	/**
	 * Effect-based copyClaudeDirectoryFromBaseBranch operation
	 * Copies .claude directory from base branch worktree to target worktree
	 *
	 * @param {string} worktreePath - Path of the target worktree
	 * @param {string} baseBranch - Name of the base branch to copy from
	 * @returns {Effect.Effect<void, GitError | FileSystemError, never>} Effect that completes successfully or fails with error
	 *
	 * @example
	 * ```typescript
	 * // Copy .claude directory from main branch
	 * await Effect.runPromise(
	 *   effect
	 * );
	 *
	 * // With error handling
	 * const result = await Effect.runPromise(
	 *   Effect.catchAll(
	 *     effect,
	 *     (error) => {
	 *       console.warn('Could not copy .claude directory:', error);
	 *       return Effect.succeed(undefined); // Continue despite error
	 *     }
	 *   )
	 * );
	 * ```
	 *
	 * @throws {GitError} When base worktree cannot be found
	 * @throws {FileSystemError} When copying the directory fails
	 */
	private copyClaudeDirectoryFromBaseBranchEffect(
		worktreePath: string,
		baseBranch: string,
	): Effect.Effect<void, GitError | FileSystemError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;

		return Effect.gen(function* () {
			// Find the worktree directory for the base branch
			const worktrees = yield* self.getWorktreesEffect();
			let baseWorktree = worktrees.find(
				wt => wt.branch && wt.branch.replace('refs/heads/', '') === baseBranch,
			);

			// If base branch worktree not found, try the default branch
			if (!baseWorktree) {
				const defaultBranch = yield* self.getDefaultBranchEffect();
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
				return yield* Effect.fail(
					new GitError({
						command: 'find base worktree',
						exitCode: 1,
						stderr: 'Could not find base worktree to copy settings from',
					}),
				);
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
			yield* Effect.try({
				try: () => cpSync(sourceClaudeDir, targetClaudeDir, {recursive: true}),
				catch: (error: unknown) =>
					new FileSystemError({
						operation: 'write',
						path: targetClaudeDir,
						cause: String(error),
					}),
			});
		});
	}

	/**
	 * Effect-based getDefaultBranch operation
	 * Returns Effect that may fail with GitError
	 *
	 * @returns {Effect.Effect<string, GitError, never>} Effect containing default branch name or GitError
	 *
	 * @example
	 * ```typescript
	 * // Use Effect.match for type-safe error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(effect, {
	 *     onFailure: (error: GitError) => ({
	 *       type: 'error' as const,
	 *       message: `Failed to get default branch: ${error.stderr}`
	 *     }),
	 *     onSuccess: (branch: string) => ({
	 *       type: 'success' as const,
	 *       data: branch
	 *     })
	 *   })
	 * );
	 *
	 * if (result.type === 'success') {
	 *   console.log(`Default branch is: ${result.data}`);
	 * }
	 * ```
	 *
	 * @throws {GitError} When git symbolic-ref command fails and fallback detection also fails
	 */
	getDefaultBranchEffect(): Effect.Effect<string, GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		return Effect.catchAll(
			Effect.try({
				try: () => {
					// Try to get the default branch from origin
					const defaultBranch = execSync(
						"git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'",
						{
							cwd: self.rootPath,
							encoding: 'utf8',
							shell: '/bin/bash',
						},
					).trim();
					if (!defaultBranch) {
						throw new Error('No default branch from symbolic-ref');
					}
					return defaultBranch;
				},
				catch: (error: unknown) => error,
			}),
			(_error: unknown) => {
				// Fallback to checking for main/master branches
				return Effect.catchAll(
					Effect.try({
						try: () => {
							execSync('git rev-parse --verify main', {
								cwd: self.rootPath,
								encoding: 'utf8',
							});
							return 'main';
						},
						catch: (error: unknown) => error,
					}),
					(_mainError: unknown) => {
						return Effect.catchAll(
							Effect.try({
								try: () => {
									execSync('git rev-parse --verify master', {
										cwd: self.rootPath,
										encoding: 'utf8',
									});
									return 'master';
								},
								catch: (error: unknown) => error,
							}),
							(_masterError: unknown) => {
								// All attempts failed, return 'main' as default
								// This is acceptable behavior for new repositories
								return Effect.succeed('main');
							},
						);
					},
				);
			},
		);
	}

	/**
	 * Effect-based getAllBranches operation
	 * Returns Effect that succeeds with array of branches (empty on failure for non-critical operation)
	 *
	 * @returns {Effect.Effect<string[], GitError, never>} Effect containing array of branch names
	 *
	 * @example
	 * ```typescript
	 * // Execute in async context - this operation returns empty array on failure
	 * const branches = await Effect.runPromise(
	 *   effect
	 * );
	 * console.log(`Found ${branches.length} branches`);
	 *
	 * // Or use Effect.match for explicit error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(effect, {
	 *     onFailure: (error: GitError) => ({
	 *       type: 'error' as const,
	 *       message: error.stderr
	 *     }),
	 *     onSuccess: (branches: string[]) => ({
	 *       type: 'success' as const,
	 *       data: branches
	 *     })
	 *   })
	 * );
	 * ```
	 *
	 * @throws {GitError} When git branch command fails (but falls back to empty array)
	 */
	getAllBranchesEffect(): Effect.Effect<string[], GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		return Effect.catchAll(
			Effect.try({
				try: () => {
					const output = execSync(
						"git branch -a --format='%(refname:short)' | grep -v HEAD | sort -u",
						{
							cwd: self.rootPath,
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
				},
				catch: (error: unknown) => error,
			}),
			(_error: unknown) => {
				// Return empty array on failure (non-critical operation)
				return Effect.succeed([]);
			},
		);
	}

	/**
	 * Effect-based getCurrentBranch operation
	 * Returns Effect that may fail with GitError
	 *
	 * @returns {Effect.Effect<string, GitError, never>} Effect containing current branch name or GitError
	 *
	 * @example
	 * ```typescript
	 * // Use Effect.match for type-safe error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(effect, {
	 *     onFailure: (error: GitError) => ({
	 *       type: 'error' as const,
	 *       message: `Failed to get current branch: ${error.stderr}`
	 *     }),
	 *     onSuccess: (branch: string) => ({
	 *       type: 'success' as const,
	 *       data: branch
	 *     })
	 *   })
	 * );
	 *
	 * if (result.type === 'success') {
	 *   console.log(`Current branch: ${result.data}`);
	 * }
	 * ```
	 *
	 * @throws {GitError} When git rev-parse command fails
	 */
	getCurrentBranchEffect(): Effect.Effect<string, GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		return Effect.catchAll(
			Effect.try({
				try: () => {
					const branch = execSync('git rev-parse --abbrev-ref HEAD', {
						cwd: self.rootPath,
						encoding: 'utf8',
					}).trim();
					if (!branch) {
						throw new Error('No current branch returned');
					}
					return branch;
				},
				catch: (error: unknown) => error,
			}),
			(_error: unknown) => {
				// Return 'unknown' as fallback for compatibility
				return Effect.succeed('unknown');
			},
		);
	}

	/**
	 * Effect-based getWorktrees operation
	 * Returns Effect that may fail with GitError
	 *
	 * @returns {Effect.Effect<Worktree[], GitError, never>} Effect containing array of worktrees or GitError
	 *
	 * @example
	 * ```typescript
	 * // Execute in async context
	 * const worktrees = await Effect.runPromise(
	 *   effect
	 * );
	 *
	 * // Or use Effect.match for type-safe error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(effect, {
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
	getWorktreesEffect(options?: {
		sortByLastSession?: boolean;
	}): Effect.Effect<Worktree[], GitError, never> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		const sortByLastSession = options?.sortByLastSession ?? false;

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

					// Handle submodule paths: if the main worktree path contains .git/modules,
					// replace it with the actual working directory (self.gitRootPath)
					const mainWorktree = worktrees.find(w => w.isMainWorktree);
					if (mainWorktree && mainWorktree.path.includes('.git/modules')) {
						mainWorktree.path = self.gitRootPath;
					}

					// Sort worktrees by last session if requested
					if (sortByLastSession) {
						worktrees.sort((a, b) => {
							// Get last opened timestamps for both worktrees
							const timeA = getWorktreeLastOpenedTime(a.path);
							const timeB = getWorktreeLastOpenedTime(b.path);

							// If both timestamps are undefined, preserve original order
							if (timeA === undefined && timeB === undefined) {
								return 0;
							}

							// If only one is undefined, treat it as older (0)
							const compareTimeA = timeA || 0;
							const compareTimeB = timeB || 0;

							// Sort in descending order (most recent first)
							return compareTimeB - compareTimeA;
						});
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
					// Use Effect-based getCurrentBranchEffect() instead of synchronous getCurrentBranch()
					return Effect.map(self.getCurrentBranchEffect(), branch => [
						{
							path: self.rootPath,
							branch,
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
	 * // Create new worktree with Effect.match for error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(
	 *     effect,
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
	): Effect.Effect<Worktree, GitError | FileSystemError | ProcessError, never> {
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

			// Execute pre-creation hook if configured (BEFORE git worktree add)
			const worktreeHooksConfig = configReader.getWorktreeHooks();
			if (
				worktreeHooksConfig.pre_creation?.enabled &&
				worktreeHooksConfig.pre_creation?.command
			) {
				yield* executeWorktreePreCreationHook(
					worktreeHooksConfig.pre_creation.command,
					resolvedPath,
					branch,
					absoluteGitRoot,
					baseBranch,
				);
			}

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
				setWorktreeParentBranch(resolvedPath, baseBranch),
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
					self.copyClaudeDirectoryFromBaseBranchEffect(
						resolvedPath,
						baseBranch,
					),
					(error: unknown) => {
						console.error('Warning: Failed to copy .claude directory:', error);
						return Effect.succeed(undefined);
					},
				);
			}

			// Execute post-creation hook if configured
			const worktreeHooks = configReader.getWorktreeHooks();
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

				yield* executeWorktreePostCreationHook(
					worktreeHooks.post_creation.command,
					newWorktree,
					absoluteGitRoot,
					baseBranch,
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
	 * // Delete worktree with Effect.catchTag for specific error handling
	 * await Effect.runPromise(
	 *   Effect.catchTag(
	 *     effect,
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
	 * @param {'merge' | 'rebase'} operation - The merge operation to perform (default: 'merge')
	 * @param {MergeConfig} mergeConfig - Optional configuration for merge/rebase arguments
	 * @returns {Effect.Effect<void, GitError, never>} Effect that completes successfully or fails with GitError
	 *
	 * @throws {GitError} When git merge/rebase command fails or worktrees not found
	 */
	mergeWorktreeEffect(
		sourceBranch: string,
		targetBranch: string,
		operation: 'merge' | 'rebase' = 'merge',
		mergeConfig?: MergeConfig,
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
						command: operation === 'rebase' ? 'git rebase' : 'git merge',
						exitCode: 1,
						stderr: 'Target branch worktree not found',
					}),
				);
			}

			if (operation === 'rebase') {
				const rebaseArgs = mergeConfig?.rebaseArgs ?? [];
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
				const rebaseCmd = `git rebase ${rebaseArgs.join(' ')} "${targetBranch}"`
					.replace(/\s+/g, ' ')
					.trim();
				yield* Effect.try({
					try: () => {
						execSync(rebaseCmd, {
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
							command: rebaseCmd,
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
				const mergeArgs = mergeConfig?.mergeArgs ?? ['--no-ff'];
				const mergeCmd = `git merge ${mergeArgs.join(' ')} "${sourceBranch}"`;
				yield* Effect.try({
					try: () => {
						execSync(mergeCmd, {
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
							command: mergeCmd,
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
