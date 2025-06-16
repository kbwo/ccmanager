import {execSync} from 'child_process';
import {existsSync} from 'fs';
import path from 'path';
import {Worktree} from '../types/index.js';

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
			const gitCommonDir = execSync('git rev-parse --git-common-dir', {
				cwd: this.rootPath,
				encoding: 'utf8',
			}).trim();

			// The parent of .git is the actual repository root
			return path.dirname(gitCommonDir);
		} catch {
			// Fallback to current directory if command fails
			return this.rootPath;
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

	createWorktree(
		worktreePath: string,
		branch: string,
		baseBranch?: string,
	): {success: boolean; error?: string} {
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
			} else if (baseBranch) {
				// Create new branch from specified base branch
				command = `git worktree add -b "${branch}" "${resolvedPath}" "${baseBranch}"`;
			} else {
				// Create new branch from current HEAD
				command = `git worktree add -b "${branch}" "${resolvedPath}"`;
			}

			execSync(command, {
				cwd: this.gitRootPath, // Execute from git root to ensure proper resolution
				encoding: 'utf8',
			});

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
			execSync(`git worktree remove "${worktreePath}" --force`, {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			// Delete the branch if it exists
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
