import {execFileSync} from 'child_process';
import {existsSync} from 'fs';
import path from 'path';
import {Worktree} from '../types/index.js';
import {isValidBranchName, isValidWorktreePath} from '../utils/validation.js';

export class WorktreeService {
	private rootPath: string;
	private gitRootPath: string;

	constructor(rootPath?: string) {
		this.rootPath = rootPath || process.cwd();
		// Get the actual git repository root for worktree operations
		this.gitRootPath = this.getGitRepositoryRoot();
	}

	private getGitRepositoryRoot(): string {
		try {
			// Get the common git directory
			const gitCommonDir = execFileSync(
				'git',
				['rev-parse', '--git-common-dir'],
				{
					cwd: this.rootPath,
					encoding: 'utf8',
				},
			).trim();

			// The parent of .git is the actual repository root
			return path.dirname(gitCommonDir);
		} catch {
			// Fallback to current directory if command fails
			return this.rootPath;
		}
	}

	getWorktrees(): Worktree[] {
		try {
			const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			const worktrees: Worktree[] = [];
			const lines = output.trim().split('\n');

			let currentWorktree: Partial<Worktree> = {};

			for (const line of lines) {
				if (line.startsWith('worktree ')) {
					if (currentWorktree.path) {
						worktrees.push(currentWorktree as Worktree);
					}
					currentWorktree = {
						path: line.substring(9),
						isMainWorktree: false,
						hasSession: false,
					};
				} else if (line.startsWith('branch ')) {
					let branch = line.substring(7);
					// Remove refs/heads/ prefix if present
					if (branch.startsWith('refs/heads/')) {
						branch = branch.substring(11);
					}
					currentWorktree.branch = branch;
				} else if (line === 'bare') {
					currentWorktree.isMainWorktree = true;
				}
			}

			if (currentWorktree.path) {
				worktrees.push(currentWorktree as Worktree);
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
			const branch = execFileSync(
				'git',
				['rev-parse', '--abbrev-ref', 'HEAD'],
				{
					cwd: this.rootPath,
					encoding: 'utf8',
				},
			).trim();
			return branch;
		} catch {
			return 'unknown';
		}
	}

	isGitRepository(): boolean {
		return existsSync(path.join(this.rootPath, '.git'));
	}

	getDefaultBranch(): string {
		try {
			// Try to get the default branch from origin
			const fullRef = execFileSync(
				'git',
				['symbolic-ref', 'refs/remotes/origin/HEAD'],
				{
					cwd: this.rootPath,
					encoding: 'utf8',
				},
			).trim();
			// Extract branch name from refs/remotes/origin/branch
			const defaultBranch = fullRef.replace(/^refs\/remotes\/origin\//, '');
			return defaultBranch || 'main';
		} catch {
			// Fallback to common default branch names
			try {
				execFileSync('git', ['rev-parse', '--verify', 'main'], {
					cwd: this.rootPath,
					encoding: 'utf8',
				});
				return 'main';
			} catch {
				try {
					execFileSync('git', ['rev-parse', '--verify', 'master'], {
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
			const output = execFileSync(
				'git',
				['branch', '-a', '--format=%(refname:short)'],
				{
					cwd: this.rootPath,
					encoding: 'utf8',
				},
			);

			const allBranches = output
				.trim()
				.split('\n')
				.filter(branch => branch && branch !== 'HEAD')
				.map(branch => {
					// Remove origin/ prefix from remote branches
					if (branch.startsWith('origin/')) {
						return branch.replace('origin/', '');
					}
					return branch.trim();
				});

			// Deduplicate and sort
			const uniqueBranches = [...new Set(allBranches)].sort();

			return uniqueBranches.filter(branch => branch);
		} catch {
			return [];
		}
	}

	createWorktree(
		worktreePath: string,
		branch: string,
		baseBranch: string,
	): {success: boolean; error?: string} {
		try {
			// Validate branch names
			if (!isValidBranchName(branch)) {
				return {
					success: false,
					error:
						'Invalid branch name. Branch names cannot contain special characters or control characters.',
				};
			}

			if (!isValidBranchName(baseBranch)) {
				return {
					success: false,
					error:
						'Invalid base branch name. Branch names cannot contain special characters or control characters.',
				};
			}

			// Validate worktree path
			if (!isValidWorktreePath(worktreePath)) {
				return {
					success: false,
					error:
						'Invalid worktree path. Paths cannot contain ".." or shell special characters.',
				};
			}

			// Resolve the worktree path relative to the git repository root
			const resolvedPath = path.isAbsolute(worktreePath)
				? worktreePath
				: path.join(this.gitRootPath, worktreePath);

			// Ensure the resolved path is still within or relative to the git root
			// This prevents absolute paths from escaping
			const normalizedResolvedPath = path.normalize(resolvedPath);
			const normalizedGitRoot = path.normalize(this.gitRootPath);

			if (
				path.isAbsolute(worktreePath) &&
				!normalizedResolvedPath.startsWith(normalizedGitRoot)
			) {
				return {
					success: false,
					error: 'Worktree path must be within the git repository',
				};
			}

			// Check if branch exists
			let branchExists = false;
			try {
				execFileSync('git', ['rev-parse', '--verify', branch], {
					cwd: this.rootPath,
					encoding: 'utf8',
				});
				branchExists = true;
			} catch {
				// Branch doesn't exist
			}

			// Create the worktree
			if (branchExists) {
				execFileSync('git', ['worktree', 'add', resolvedPath, branch], {
					cwd: this.gitRootPath, // Execute from git root to ensure proper resolution
					encoding: 'utf8',
				});
			} else {
				// Create new branch from specified base branch
				execFileSync(
					'git',
					['worktree', 'add', '-b', branch, resolvedPath, baseBranch],
					{
						cwd: this.gitRootPath,
						encoding: 'utf8',
					},
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

	deleteWorktree(worktreePath: string): {success: boolean; error?: string} {
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
			execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			// Delete the branch if it exists
			const branchName = worktree.branch.replace('refs/heads/', '');
			try {
				execFileSync('git', ['branch', '-D', branchName], {
					cwd: this.rootPath,
					encoding: 'utf8',
				});
			} catch {
				// Branch might not exist or might be checked out elsewhere
				// This is not a fatal error
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
			// Validate branch names
			if (!isValidBranchName(sourceBranch)) {
				return {
					success: false,
					error: 'Invalid source branch name',
				};
			}

			if (!isValidBranchName(targetBranch)) {
				return {
					success: false,
					error: 'Invalid target branch name',
				};
			}
			// Get worktrees to find the target worktree path
			const worktrees = this.getWorktrees();
			const targetWorktree = worktrees.find(
				wt => wt.branch.replace('refs/heads/', '') === targetBranch,
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
					wt => wt.branch.replace('refs/heads/', '') === sourceBranch,
				);

				if (!sourceWorktree) {
					return {
						success: false,
						error: 'Source branch worktree not found',
					};
				}

				// Rebase source branch onto target branch
				execFileSync('git', ['rebase', targetBranch], {
					cwd: sourceWorktree.path,
					encoding: 'utf8',
				});

				// After rebase, merge the rebased source branch into target branch
				execFileSync('git', ['merge', '--ff-only', sourceBranch], {
					cwd: targetWorktree.path,
					encoding: 'utf8',
				});
			} else {
				// Regular merge
				execFileSync('git', ['merge', '--no-ff', sourceBranch], {
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
				wt => wt.branch.replace('refs/heads/', '') === branch,
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
}
