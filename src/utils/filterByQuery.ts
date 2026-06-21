import {Worktree} from '../types/index.js';
import {SessionItem} from './worktreeUtils.js';

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

/**
 * Filter session items by matching the search query against the name shown in
 * the menu (branch name, " (main)" indicator, and session name) and the
 * worktree path. Status icons and git status columns are not matched.
 *
 * Filtering happens per session item (not per worktree) so that a query can
 * match an individual session name within a worktree that has multiple
 * sessions.
 */
export function filterSessionItemsByQuery(
	items: SessionItem[],
	query: string,
): SessionItem[] {
	if (!query) return items;
	const searchLower = query.toLowerCase();
	return items.filter(
		item =>
			item.searchableName.toLowerCase().includes(searchLower) ||
			item.worktree.path.toLowerCase().includes(searchLower),
	);
}
