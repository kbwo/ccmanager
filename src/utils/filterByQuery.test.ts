import {describe, it, expect} from 'vitest';
import {
	filterWorktreesByQuery,
	filterSessionItemsByQuery,
} from './filterByQuery.js';
import {Worktree} from '../types/index.js';
import {SessionItem} from './worktreeUtils.js';

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
