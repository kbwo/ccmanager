import {execSync} from 'child_process';
import {existsSync} from 'fs';
import path from 'path';
import {Worktree} from '../types/index.js';

export class WorktreeService {
	private rootPath: string;

	constructor(rootPath?: string) {
		this.rootPath = rootPath || process.cwd();
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

	createWorktree(
		worktreePath: string,
		branch: string,
	): {success: boolean; error?: string; absolutePath?: string} {
		try {
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
			const command = branchExists
				? `git worktree add "${worktreePath}" "${branch}"`
				: `git worktree add -b "${branch}" "${worktreePath}"`;

			execSync(command, {
				cwd: this.rootPath,
				encoding: 'utf8',
			});

			// Get the absolute path of the created worktree
			const worktrees = this.getWorktrees();

			const newWorktree = worktrees.find(
				wt => wt.branch.replace('refs/heads/', '') === branch,
			);

			return {
				success: true,
				absolutePath: newWorktree?.path,
			};
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
