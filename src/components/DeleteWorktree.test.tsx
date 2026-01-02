import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
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

// Mock SelectInput to render items as simple text
vi.mock('ink-select-input', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text, Box} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({items}: {items: Array<{label: string; value: string}>}) => {
			return React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item: {label: string}, index: number) =>
					React.createElement(Text, {key: index}, item.label),
				),
			);
		},
	};
});

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
});
