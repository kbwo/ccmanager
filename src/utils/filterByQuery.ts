import {SessionState, Worktree} from '../types/index.js';
import {STATUS_ICONS, STATUS_LABELS} from '../constants/statusIcons.js';
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

/**
 * The user-facing categories a session can be filtered by. `'all'` disables the
 * filter. The four internal {@link SessionState} values collapse into three
 * categories: `pending_auto_approval` is shown as `waiting` because it is a
 * form of "waiting for the user" (mirrors the status display in statusIcons.ts).
 */
export type SessionStateFilter = 'all' | 'busy' | 'waiting' | 'idle';

/**
 * Order in which the Tab / Shift+Tab keys cycle the state filter.
 * "Attention-first" so the states a user most often hunts for come up first.
 */
export const SESSION_STATE_FILTER_CYCLE: SessionStateFilter[] = [
	'all',
	'busy',
	'waiting',
	'idle',
];

/** Map an internal session state onto its user-facing filter category. */
function stateToFilterCategory(
	state: SessionState,
): Exclude<SessionStateFilter, 'all'> {
	switch (state) {
		case 'busy':
			return 'busy';
		case 'waiting_input':
		case 'pending_auto_approval':
			return 'waiting';
		case 'idle':
			return 'idle';
	}
}

/**
 * Filter session items by their current state. This is an independent dimension
 * from {@link filterSessionItemsByQuery}: callers compose the two so a text
 * query and a state filter can both be active at once.
 *
 * Rows without a session have no state, so they are excluded whenever a specific
 * state (not `'all'`) is selected.
 */
export function filterSessionItemsByState(
	items: SessionItem[],
	filter: SessionStateFilter,
): SessionItem[] {
	if (filter === 'all') return items;
	return items.filter(item => {
		const stateData = item.session?.stateMutex.getSnapshot();
		if (!stateData) return false;
		return stateToFilterCategory(stateData.state) === filter;
	});
}

/** Advance the state filter one step in the cycle (Tab) or back (Shift+Tab). */
export function cycleSessionStateFilter(
	current: SessionStateFilter,
	direction: 'next' | 'prev',
): SessionStateFilter {
	const cycle = SESSION_STATE_FILTER_CYCLE;
	const index = cycle.indexOf(current);
	const offset = direction === 'next' ? 1 : -1;
	const nextIndex = (index + offset + cycle.length) % cycle.length;
	return cycle[nextIndex]!;
}

/** Human-readable label (icon + word) for a state filter, used in the footer. */
export function getSessionStateFilterLabel(filter: SessionStateFilter): string {
	switch (filter) {
		case 'all':
			return 'All';
		case 'busy':
			return `${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY}`;
		case 'waiting':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`;
		case 'idle':
			return `${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`;
	}
}
