import React from 'react';
import {useInput, type Key} from 'ink';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {mkdtempSync, rmSync, utimesSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {Effect} from 'effect';
import DeleteWorktree from './DeleteWorktree.js';
import {WorktreeService} from '../services/worktreeService.js';
import {Worktree} from '../types/index.js';
import {GitError} from '../types/errors.js';

vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn(function () {
		return {
			getWorktreesEffect: vi.fn(),
		};
	}),
}));
vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		matchesShortcut: vi.fn(),
		getShortcutDisplay: vi.fn(() => 'Esc'),
	},
}));

// Mock stdin to avoid useInput errors
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn(),
	};
});

// The test terminal has no height; show 5 rows so scrolling can be tested
vi.mock('../hooks/useDynamicLimit.js', () => ({useDynamicLimit: () => 5}));

describe('DeleteWorktree - Effect Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should pass projectPath to WorktreeService when provided', async () => {
		// GIVEN: projectPath is provided
		const projectPath = '/test/project';
		const mockWorktrees: Worktree[] = [
			{
				path: '/test/project/wt1',
				branch: 'feature-1',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		const mockEffect = Effect.succeed(mockWorktrees);
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getWorktreesEffect: vi.fn(() => mockEffect),
			} as Partial<WorktreeService> as WorktreeService;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component renders with projectPath
		render(
			<DeleteWorktree
				projectPath={projectPath}
				onComplete={onComplete}
				onCancel={onCancel}
			/>,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: WorktreeService was called with projectPath
		expect(WorktreeService).toHaveBeenCalledWith(projectPath);
	});

	it('should use undefined when projectPath not provided', async () => {
		// GIVEN: No projectPath
		const mockWorktrees: Worktree[] = [
			{
				path: '/test/wt1',
				branch: 'feature-1',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		const mockEffect = Effect.succeed(mockWorktrees);
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getWorktreesEffect: vi.fn(() => mockEffect),
			} as Partial<WorktreeService> as WorktreeService;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component renders without projectPath
		render(<DeleteWorktree onComplete={onComplete} onCancel={onCancel} />);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: WorktreeService was called with undefined (defaults to cwd)
		expect(WorktreeService).toHaveBeenCalledWith(undefined);
	});

	it('should load worktrees using Effect-based method', async () => {
		// GIVEN: Mock worktrees returned by Effect
		const mockWorktrees: Worktree[] = [
			{
				path: '/test/worktree1',
				branch: 'feature-1',
				isMainWorktree: false,
				hasSession: false,
			},
			{
				path: '/test/worktree2',
				branch: 'feature-2',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		const mockEffect = Effect.succeed(mockWorktrees);
		const mockGetWorktreesEffect = vi.fn(() => mockEffect);

		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getWorktreesEffect: mockGetWorktreesEffect,
			} as Partial<WorktreeService> as WorktreeService;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component is rendered
		const {lastFrame} = render(
			<DeleteWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: Effect method should be called
		expect(mockGetWorktreesEffect).toHaveBeenCalled();

		// AND: Worktrees should be displayed
		const output = lastFrame();
		expect(output).toContain('feature-1');
		expect(output).toContain('feature-2');
	});

	it('should handle GitError from getWorktreesEffect gracefully', async () => {
		// GIVEN: Effect that fails with GitError
		const mockError = new GitError({
			command: 'git worktree list --porcelain',
			exitCode: 128,
			stderr: 'not a git repository',
		});

		const mockEffect = Effect.fail(mockError);
		const mockGetWorktreesEffect = vi.fn(() => mockEffect);

		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getWorktreesEffect: mockGetWorktreesEffect,
			} as Partial<WorktreeService> as WorktreeService;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component is rendered
		const {lastFrame} = render(
			<DeleteWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: Error should be displayed
		const output = lastFrame();
		const hasError =
			output?.includes('error') ||
			output?.includes('Error') ||
			output?.includes('not a git repository');
		expect(hasError).toBe(true);
	});

	it('should filter out main worktree from deletable list', async () => {
		// GIVEN: Mock worktrees including main worktree
		const mockWorktrees: Worktree[] = [
			{
				path: '/test/main',
				branch: 'main',
				isMainWorktree: true,
				hasSession: false,
			},
			{
				path: '/test/feature',
				branch: 'feature-1',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		const mockEffect = Effect.succeed(mockWorktrees);
		const mockGetWorktreesEffect = vi.fn(() => mockEffect);

		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getWorktreesEffect: mockGetWorktreesEffect,
			} as Partial<WorktreeService> as WorktreeService;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		// WHEN: Component is rendered
		const {lastFrame} = render(
			<DeleteWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 50));

		// THEN: Only non-main worktree should be shown
		const output = lastFrame();
		expect(output).toContain('feature-1');
		expect(output).not.toContain('main');
	});

	describe('keyboard navigation', () => {
		// Renders one worktree per branch and returns helpers to press keys
		// and read the list rows, e.g. '>[✓] a' for the cursor row (the
		// last-modified column, '-' for these nonexistent paths, is dropped)
		const renderList = async (branches: string[]) => {
			const mockWorktrees: Worktree[] = branches.map(branch => ({
				path: `/test/${branch}`,
				branch,
				isMainWorktree: false,
				hasSession: false,
			}));

			vi.mocked(WorktreeService).mockImplementation(function () {
				return {
					getWorktreesEffect: vi.fn(() => Effect.succeed(mockWorktrees)),
				} as Partial<WorktreeService> as WorktreeService;
			});

			const {lastFrame} = render(
				<DeleteWorktree onComplete={vi.fn()} onCancel={vi.fn()} />,
			);
			await new Promise(resolve => setTimeout(resolve, 50));

			return {
				// The component's own useInput is registered last in each render
				press: async (input: string, key: Partial<Key> = {}, times = 1) => {
					for (let i = 0; i < times; i++) {
						vi.mocked(useInput).mock.calls.at(-1)![0](input, key as Key);
						await new Promise(resolve => setTimeout(resolve, 20));
					}
				},
				rows: () =>
					lastFrame()!
						.split('\n')
						.filter(line => line.includes(' (/test/'))
						.map(line => line.split(' (/test/')[0]!.replace('] - ', '] ')),
			};
		};

		it('should move the cursor to the next row after toggling with space', async () => {
			const {press, rows} = await renderList(['a', 'b']);

			await press(' ');
			expect(rows()).toEqual([' [✓] a', '>[ ] b']);

			// On the last row the cursor stays where it is
			await press(' ');
			expect(rows()).toEqual([' [✓] a', '>[✓] b']);
		});

		it('should keep the visible rows in place when space is pressed mid-list', async () => {
			const {press, rows} = await renderList([
				'a',
				'b',
				'c',
				'd',
				'e',
				'f',
				'g',
				'h',
			]);

			// Scroll down to g (rows c-g visible), then back up to e
			await press('', {downArrow: true}, 6);
			await press('', {upArrow: true}, 2);
			expect(rows()).toEqual([
				' [ ] c',
				' [ ] d',
				'>[ ] e',
				' [ ] f',
				' [ ] g',
			]);

			await press(' ');
			expect(rows()).toEqual([
				' [ ] c',
				' [ ] d',
				' [✓] e',
				'>[ ] f',
				' [ ] g',
			]);
		});

		it('should wrap around and jump with number keys', async () => {
			const {press, rows} = await renderList(['a', 'b', 'c', 'd', 'e', 'f']);

			// Up from the first row wraps to the last row
			await press('k');
			expect(rows()).toEqual([
				' [ ] b',
				' [ ] c',
				' [ ] d',
				' [ ] e',
				'>[ ] f',
			]);

			// A number key moves to that visible row
			await press('2');
			expect(rows()).toEqual([
				' [ ] b',
				'>[ ] c',
				' [ ] d',
				' [ ] e',
				' [ ] f',
			]);

			// Down from the last row wraps to the first row
			await press('5');
			await press('j');
			expect(rows()).toEqual([
				'>[ ] a',
				' [ ] b',
				' [ ] c',
				' [ ] d',
				' [ ] e',
			]);
		});
	});

	it('should show the directory last-modified time before the branch name', async () => {
		// GIVEN: A worktree directory last modified three days ago
		const worktreePath = mkdtempSync(join(tmpdir(), 'ccmanager-delete-'));
		const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		utimesSync(worktreePath, threeDaysAgo, threeDaysAgo);

		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getWorktreesEffect: vi.fn(() =>
					Effect.succeed([
						{
							path: worktreePath,
							branch: 'feature-1',
							isMainWorktree: false,
							hasSession: false,
						},
					]),
				),
			} as Partial<WorktreeService> as WorktreeService;
		});

		// WHEN: Component is rendered
		const {lastFrame} = render(
			<DeleteWorktree onComplete={vi.fn()} onCancel={vi.fn()} />,
		);
		await new Promise(resolve => setTimeout(resolve, 50));
		rmSync(worktreePath, {recursive: true});

		// THEN: The relative time is shown ahead of the branch name
		expect(lastFrame()).toContain('[ ] 3d ago feature-1');
	});
});
