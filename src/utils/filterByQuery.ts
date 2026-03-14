import {Worktree} from '../types/index.js';

/**
 * Filter worktrees by matching search query against branch name and path.
 */
export function filterWorktreesByQuery(
	worktrees: Worktree[],
	query: string,
): Worktree[] {
	if (!query) return worktrees;
	const searchLower = query.toLowerCase();
	return worktrees.filter(worktree => {
		const branchName = worktree.branch || '';
		return (
			branchName.toLowerCase().includes(searchLower) ||
			worktree.path.toLowerCase().includes(searchLower)
		);
	});
}
