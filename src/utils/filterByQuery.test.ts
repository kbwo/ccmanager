import {describe, it, expect} from 'vitest';
import {
	filterWorktreesByQuery,
	filterSessionItemsByQuery,
	filterSessionItemsByState,
	cycleSessionStateFilter,
	getSessionStateFilterLabel,
} from './filterByQuery.js';
import {Session, SessionState, Worktree} from '../types/index.js';
import {SessionItem} from './worktreeUtils.js';
import {STATUS_ICONS, STATUS_LABELS} from '../constants/statusIcons.js';

const makeItem = (searchableName: string, path: string): SessionItem => ({
	worktree: {
		path,
		isMainWorktree: false,
		hasSession: false,
	} as Worktree,
	baseLabel: searchableName,
	searchableName,
	fileChanges: '',
	aheadBehind: '',
	parentBranch: '',
	lastCommitDate: '',
	lengths: {
		base: 0,
		fileChanges: 0,
		aheadBehind: 0,
		parentBranch: 0,
		lastCommitDate: 0,
	},
});

// Minimal session stub exposing only what filterSessionItemsByState reads:
// stateMutex.getSnapshot().state.
const makeItemWithState = (
	searchableName: string,
	path: string,
	state: SessionState,
): SessionItem => ({
	...makeItem(searchableName, path),
	session: {
		stateMutex: {getSnapshot: () => ({state})},
	} as unknown as Session,
});

describe('filterWorktreesByQuery', () => {
	const worktrees: Worktree[] = [
		{
			path: '/repo/feature-a',
			branch: 'feature/a',
			isMainWorktree: false,
			hasSession: false,
		},
		{
			path: '/repo/main',
			branch: 'main',
			isMainWorktree: true,
			hasSession: false,
		},
	];

	it('returns all worktrees when query is empty', () => {
		expect(filterWorktreesByQuery(worktrees, '')).toEqual(worktrees);
	});

	it('matches branch name case-insensitively', () => {
		const result = filterWorktreesByQuery(worktrees, 'FEATURE');
		expect(result).toHaveLength(1);
		expect(result[0]?.branch).toBe('feature/a');
	});

	it('matches path', () => {
		const result = filterWorktreesByQuery(worktrees, '/repo/main');
		expect(result).toHaveLength(1);
		expect(result[0]?.path).toBe('/repo/main');
	});
});

describe('filterSessionItemsByQuery', () => {
	const items: SessionItem[] = [
		makeItem('feature/a', '/repo/feature-a'),
		makeItem('main (main)', '/repo/main'),
		makeItem('feature/b: my-session', '/repo/feature-b'),
		makeItem('feature/b: other', '/repo/feature-b'),
	];

	it('returns all items when query is empty', () => {
		expect(filterSessionItemsByQuery(items, '')).toEqual(items);
	});

	it('matches the session name within a worktree', () => {
		const result = filterSessionItemsByQuery(items, 'my-session');
		expect(result).toHaveLength(1);
		expect(result[0]?.searchableName).toBe('feature/b: my-session');
	});

	it('matches the (main) indicator', () => {
		const result = filterSessionItemsByQuery(items, '(main)');
		expect(result).toHaveLength(1);
		expect(result[0]?.searchableName).toBe('main (main)');
	});

	it('matches branch name case-insensitively', () => {
		const result = filterSessionItemsByQuery(items, 'FEATURE/A');
		expect(result).toHaveLength(1);
		expect(result[0]?.searchableName).toBe('feature/a');
	});

	it('matches path', () => {
		const result = filterSessionItemsByQuery(items, '/repo/feature-b');
		expect(result).toHaveLength(2);
	});
});

describe('filterSessionItemsByState', () => {
	const items: SessionItem[] = [
		makeItemWithState('busy-a', '/repo/busy-a', 'busy'),
		makeItemWithState('waiting-a', '/repo/waiting-a', 'waiting_input'),
		makeItemWithState('pending-a', '/repo/pending-a', 'pending_auto_approval'),
		makeItemWithState('idle-a', '/repo/idle-a', 'idle'),
		// A worktree row with no running session (no state).
		makeItem('no-session', '/repo/no-session'),
	];

	it('returns all items when the filter is "all"', () => {
		expect(filterSessionItemsByState(items, 'all')).toEqual(items);
	});

	it('keeps only busy sessions', () => {
		const result = filterSessionItemsByState(items, 'busy');
		expect(result.map(i => i.searchableName)).toEqual(['busy-a']);
	});

	it('folds pending_auto_approval into the waiting category', () => {
		const result = filterSessionItemsByState(items, 'waiting');
		expect(result.map(i => i.searchableName)).toEqual([
			'waiting-a',
			'pending-a',
		]);
	});

	it('keeps only idle sessions', () => {
		const result = filterSessionItemsByState(items, 'idle');
		expect(result.map(i => i.searchableName)).toEqual(['idle-a']);
	});

	it('excludes rows without a session for any specific state', () => {
		for (const filter of ['busy', 'waiting', 'idle'] as const) {
			const result = filterSessionItemsByState(items, filter);
			expect(result.map(i => i.searchableName)).not.toContain('no-session');
		}
	});
});

describe('cycleSessionStateFilter', () => {
	it('cycles forward all -> busy -> waiting -> idle -> all', () => {
		expect(cycleSessionStateFilter('all', 'next')).toBe('busy');
		expect(cycleSessionStateFilter('busy', 'next')).toBe('waiting');
		expect(cycleSessionStateFilter('waiting', 'next')).toBe('idle');
		expect(cycleSessionStateFilter('idle', 'next')).toBe('all');
	});

	it('cycles backward all -> idle -> waiting -> busy -> all', () => {
		expect(cycleSessionStateFilter('all', 'prev')).toBe('idle');
		expect(cycleSessionStateFilter('idle', 'prev')).toBe('waiting');
		expect(cycleSessionStateFilter('waiting', 'prev')).toBe('busy');
		expect(cycleSessionStateFilter('busy', 'prev')).toBe('all');
	});
});

describe('getSessionStateFilterLabel', () => {
	it('labels each filter with icon and word', () => {
		expect(getSessionStateFilterLabel('all')).toBe('All');
		expect(getSessionStateFilterLabel('busy')).toBe(
			`${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY}`,
		);
		expect(getSessionStateFilterLabel('waiting')).toBe(
			`${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`,
		);
		expect(getSessionStateFilterLabel('idle')).toBe(
			`${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`,
		);
	});
});
