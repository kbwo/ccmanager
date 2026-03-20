import {describe, it, expect} from 'vitest';
import {prepareSessionItems} from '../utils/worktreeUtils.js';
import type {Worktree, Session} from '../types/index.js';

const makeWorktree = (path: string, branch: string): Worktree => ({
	path,
	branch,
	isMainWorktree: path.endsWith('/main'),
	hasSession: false,
});

const makeSession = (
	id: string,
	worktreePath: string,
	number: number,
	lastAccessedAt: number,
	name?: string,
): Session =>
	({
		id,
		worktreePath,
		sessionNumber: number,
		sessionName: name,
		lastAccessedAt,
		stateMutex: {
			getSnapshot: () => ({
				state: 'idle',
				backgroundTaskCount: 0,
				teamMemberCount: 0,
			}),
		},
	}) as unknown as Session;

describe('prepareSessionItems - sortByLastSession', () => {
	it('should not sort worktrees when sortByLastSession is false', () => {
		const worktrees = [
			makeWorktree('/repo', 'main'),
			makeWorktree('/repo/feature-a', 'feature-a'),
			makeWorktree('/repo/feature-b', 'feature-b'),
		];
		const sessions = [
			makeSession('s1', '/repo', 1, 1000),
			makeSession('s2', '/repo/feature-a', 1, 3000),
		];

		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: false,
		});

		expect(items[0]?.worktree.path).toBe('/repo');
		expect(items[1]?.worktree.path).toBe('/repo/feature-a');
		expect(items[2]?.worktree.path).toBe('/repo/feature-b');
	});

	it('should sort worktrees by most recent session lastAccessedAt', () => {
		const worktrees = [
			makeWorktree('/repo', 'main'),
			makeWorktree('/repo/feature-a', 'feature-a'),
			makeWorktree('/repo/feature-b', 'feature-b'),
		];
		const sessions = [
			makeSession('s1', '/repo', 1, 2000),
			makeSession('s2', '/repo/feature-a', 1, 1000),
			makeSession('s3', '/repo/feature-b', 1, 3000),
		];

		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo/feature-b'); // 3000
		expect(items[1]?.worktree.path).toBe('/repo'); // 2000
		expect(items[2]?.worktree.path).toBe('/repo/feature-a'); // 1000
	});

	it('should use the max lastAccessedAt across multiple sessions in one worktree', () => {
		const worktrees = [
			makeWorktree('/repo/wt-a', 'a'),
			makeWorktree('/repo/wt-b', 'b'),
		];
		const sessions = [
			makeSession('s1', '/repo/wt-a', 1, 1000),
			makeSession('s2', '/repo/wt-a', 2, 5000),
			makeSession('s3', '/repo/wt-b', 1, 3000),
		];

		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: true,
		});

		// wt-a has max 5000, wt-b has 3000
		expect(items[0]?.worktree.path).toBe('/repo/wt-a');
		expect(items[1]?.worktree.path).toBe('/repo/wt-a');
		expect(items[2]?.worktree.path).toBe('/repo/wt-b');
	});

	it('should place worktrees without sessions at the end', () => {
		const worktrees = [
			makeWorktree('/repo/no-session', 'no-session'),
			makeWorktree('/repo/has-session', 'has-session'),
		];
		const sessions = [makeSession('s1', '/repo/has-session', 1, 1000)];

		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo/has-session');
		expect(items[1]?.worktree.path).toBe('/repo/no-session');
	});

	it('should sort sessions within a worktree by lastAccessedAt', () => {
		const worktrees = [makeWorktree('/repo/wt', 'wt')];
		const sessions = [
			makeSession('s1', '/repo/wt', 1, 1000),
			makeSession('s2', '/repo/wt', 2, 3000),
			makeSession('s3', '/repo/wt', 3, 2000),
		];

		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: true,
		});

		expect(items).toHaveLength(3);
		expect(items[0]?.session?.id).toBe('s2'); // 3000
		expect(items[1]?.session?.id).toBe('s3'); // 2000
		expect(items[2]?.session?.id).toBe('s1'); // 1000
	});

	it('should handle empty worktree list', () => {
		const items = prepareSessionItems([], [], {sortByLastSession: true});
		expect(items).toHaveLength(0);
	});

	it('should preserve worktree properties after sorting', () => {
		const worktrees = [
			makeWorktree('/repo', 'main'),
			makeWorktree('/repo/feature', 'feature'),
		];
		const sessions = [
			makeSession('s1', '/repo/feature', 1, 2000),
			makeSession('s2', '/repo', 1, 1000),
		];

		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo/feature');
		expect(items[0]?.worktree.branch).toBe('feature');
		expect(items[0]?.worktree.isMainWorktree).toBe(false);
		expect(items[1]?.worktree.path).toBe('/repo');
		expect(items[1]?.worktree.branch).toBe('main');
	});

	it('should maintain stable order for worktrees with same timestamp', () => {
		const worktrees = [
			makeWorktree('/repo/a', 'a'),
			makeWorktree('/repo/b', 'b'),
			makeWorktree('/repo/c', 'c'),
		];
		const sessions = [
			makeSession('s1', '/repo/a', 1, 1000),
			makeSession('s2', '/repo/b', 1, 1000),
			makeSession('s3', '/repo/c', 1, 1000),
		];

		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo/a');
		expect(items[1]?.worktree.path).toBe('/repo/b');
		expect(items[2]?.worktree.path).toBe('/repo/c');
	});

	it('should not sort when no sessions exist', () => {
		const worktrees = [
			makeWorktree('/repo', 'main'),
			makeWorktree('/repo/feature', 'feature'),
		];

		const items = prepareSessionItems(worktrees, [], {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo');
		expect(items[1]?.worktree.path).toBe('/repo/feature');
	});
});
