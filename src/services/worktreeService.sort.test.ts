import {describe, it, expect} from 'vitest';
import {prepareSessionItems} from '../utils/worktreeUtils.js';
import type {Worktree, SessionMeta} from '../types/index.js';

const makeWorktree = (path: string, branch: string): Worktree => ({
	path,
	branch,
	isMainWorktree: path.endsWith('/main'),
	hasSession: false,
});

describe('prepareSessionItems - sortByLastSession', () => {
	it('should not sort worktrees when sortByLastSession is false', () => {
		const worktrees = [
			makeWorktree('/repo', 'main'),
			makeWorktree('/repo/feature-a', 'feature-a'),
			makeWorktree('/repo/feature-b', 'feature-b'),
		];
		const metas: SessionMeta[] = [
			{id: 's1', worktreePath: '/repo', number: 1, lastAccessedAt: 1000},
			{
				id: 's2',
				worktreePath: '/repo/feature-a',
				number: 1,
				lastAccessedAt: 3000,
			},
		];

		const items = prepareSessionItems(worktrees, [], metas, {
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
		const metas: SessionMeta[] = [
			{id: 's1', worktreePath: '/repo', number: 1, lastAccessedAt: 2000},
			{
				id: 's2',
				worktreePath: '/repo/feature-a',
				number: 1,
				lastAccessedAt: 1000,
			},
			{
				id: 's3',
				worktreePath: '/repo/feature-b',
				number: 1,
				lastAccessedAt: 3000,
			},
		];

		const items = prepareSessionItems(worktrees, [], metas, {
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
		const metas: SessionMeta[] = [
			{id: 's1', worktreePath: '/repo/wt-a', number: 1, lastAccessedAt: 1000},
			{id: 's2', worktreePath: '/repo/wt-a', number: 2, lastAccessedAt: 5000},
			{id: 's3', worktreePath: '/repo/wt-b', number: 1, lastAccessedAt: 3000},
		];

		const items = prepareSessionItems(worktrees, [], metas, {
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
		const metas: SessionMeta[] = [
			{
				id: 's1',
				worktreePath: '/repo/has-session',
				number: 1,
				lastAccessedAt: 1000,
			},
		];

		const items = prepareSessionItems(worktrees, [], metas, {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo/has-session');
		expect(items[1]?.worktree.path).toBe('/repo/no-session');
	});

	it('should sort sessions within a worktree by lastAccessedAt', () => {
		const worktrees = [makeWorktree('/repo/wt', 'wt')];
		const metas: SessionMeta[] = [
			{id: 's1', worktreePath: '/repo/wt', number: 1, lastAccessedAt: 1000},
			{id: 's2', worktreePath: '/repo/wt', number: 2, lastAccessedAt: 3000},
			{id: 's3', worktreePath: '/repo/wt', number: 3, lastAccessedAt: 2000},
		];

		const items = prepareSessionItems(worktrees, [], metas, {
			sortByLastSession: true,
		});

		// Within the worktree, sessions sorted by lastAccessedAt descending
		expect(items).toHaveLength(3);
		expect(items[0]?.sessionMeta?.id).toBe('s2'); // 3000
		expect(items[1]?.sessionMeta?.id).toBe('s3'); // 2000
		expect(items[2]?.sessionMeta?.id).toBe('s1'); // 1000
	});

	it('should handle empty worktree list', () => {
		const items = prepareSessionItems([], [], [], {
			sortByLastSession: true,
		});
		expect(items).toHaveLength(0);
	});

	it('should preserve worktree properties after sorting', () => {
		const worktrees = [
			makeWorktree('/repo', 'main'),
			makeWorktree('/repo/feature', 'feature'),
		];
		const metas: SessionMeta[] = [
			{
				id: 's1',
				worktreePath: '/repo/feature',
				number: 1,
				lastAccessedAt: 2000,
			},
			{id: 's2', worktreePath: '/repo', number: 1, lastAccessedAt: 1000},
		];

		const items = prepareSessionItems(worktrees, [], metas, {
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
		const metas: SessionMeta[] = [
			{id: 's1', worktreePath: '/repo/a', number: 1, lastAccessedAt: 1000},
			{id: 's2', worktreePath: '/repo/b', number: 1, lastAccessedAt: 1000},
			{id: 's3', worktreePath: '/repo/c', number: 1, lastAccessedAt: 1000},
		];

		const items = prepareSessionItems(worktrees, [], metas, {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo/a');
		expect(items[1]?.worktree.path).toBe('/repo/b');
		expect(items[2]?.worktree.path).toBe('/repo/c');
	});

	it('should not sort when no session metas are provided', () => {
		const worktrees = [
			makeWorktree('/repo', 'main'),
			makeWorktree('/repo/feature', 'feature'),
		];

		const items = prepareSessionItems(worktrees, [], undefined, {
			sortByLastSession: true,
		});

		expect(items[0]?.worktree.path).toBe('/repo');
		expect(items[1]?.worktree.path).toBe('/repo/feature');
	});
});
