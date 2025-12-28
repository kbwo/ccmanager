import React from 'react';
import {render} from 'ink-testing-library';
import NewWorktree from './NewWorktree.js';
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest';

// Mock bun-pty to avoid native module issues in tests
vi.mock('@skitee3000/bun-pty', () => ({
	spawn: vi.fn(function () {
		return null;
	}),
}));

// Mock ink to avoid stdin issues
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn(),
	};
});

// Mock TextInputWrapper
vi.mock('./TextInputWrapper.js', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({value}: {value: string}) => {
			return React.createElement(Text, {}, value || 'input');
		},
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

// Mock dependencies
vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		getShortcutDisplay: () => 'Ctrl+C',
		matchesShortcut: () => false,
	},
}));

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getWorktreeConfig: () => ({
			autoDirectory: false,
			autoDirectoryPattern: '../{project}-{branch}',
			copySessionData: true,
		}),
	},
}));

vi.mock('../hooks/useSearchMode.js', () => ({
	useSearchMode: () => ({
		isSearchMode: false,
		searchQuery: '',
		selectedIndex: 0,
		setSearchQuery: vi.fn(),
	}),
}));

// Mock WorktreeService
vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn(function () {
		return {};
	}),
}));

describe('NewWorktree component Effect integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should show loading indicator while branches load', async () => {
		const {Effect} = await import('effect');
		const {WorktreeService} = await import('../services/worktreeService.js');

		// Mock WorktreeService to return Effects that never resolve (simulating loading)
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getAllBranchesEffect: vi.fn(() =>
					Effect.async<string[], never>(() => {
						// Never resolves to simulate loading state
					}),
				),
				getDefaultBranchEffect: vi.fn(() =>
					Effect.async<string, never>(() => {
						// Never resolves to simulate loading state
					}),
				),
			} as unknown as InstanceType<typeof WorktreeService>;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Should immediately show loading state
		const output = lastFrame();
		expect(output).toContain('Loading branches...');
		expect(output).toContain('Create New Worktree');
	});

	it('should display error message when branch loading fails with GitError', async () => {
		const {Effect} = await import('effect');
		const {GitError} = await import('../types/errors.js');
		const {WorktreeService} = await import('../services/worktreeService.js');

		const gitError = new GitError({
			command: 'git branch --all',
			exitCode: 128,
			stderr: 'fatal: not a git repository',
			stdout: '',
		});

		// Mock WorktreeService to fail with GitError
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getAllBranchesEffect: vi.fn(() => Effect.fail(gitError)),
				getDefaultBranchEffect: vi.fn(() => Effect.succeed('main')),
			} as unknown as InstanceType<typeof WorktreeService>;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('Error loading branches:');
		expect(output).toContain('git branch --all');
		expect(output).toContain('fatal: not a git repository');
	});

	it('should successfully load branches using Effect.all for parallel execution', async () => {
		const {Effect} = await import('effect');
		const {WorktreeService} = await import('../services/worktreeService.js');

		const mockBranches = ['main', 'feature-1', 'feature-2'];
		const mockDefaultBranch = 'main';

		// Mock WorktreeService to succeed with both Effects
		const getAllBranchesSpy = vi.fn(() => Effect.succeed(mockBranches));
		const getDefaultBranchSpy = vi.fn(() => Effect.succeed(mockDefaultBranch));

		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getAllBranchesEffect: getAllBranchesSpy,
				getDefaultBranchEffect: getDefaultBranchSpy,
			} as unknown as InstanceType<typeof WorktreeService>;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		render(<NewWorktree onComplete={onComplete} onCancel={onCancel} />);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		// Verify both Effect-based methods were called (parallel execution via Effect.all)
		expect(getAllBranchesSpy).toHaveBeenCalled();
		expect(getDefaultBranchSpy).toHaveBeenCalled();
	});

	it('should handle getDefaultBranchEffect failure and display error', async () => {
		const {Effect} = await import('effect');
		const {GitError} = await import('../types/errors.js');
		const {WorktreeService} = await import('../services/worktreeService.js');

		const gitError = new GitError({
			command: 'git symbolic-ref refs/remotes/origin/HEAD',
			exitCode: 128,
			stderr: 'fatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
			stdout: '',
		});

		// Mock WorktreeService - branches succeed, default branch fails
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getAllBranchesEffect: vi.fn(() => Effect.succeed(['main', 'develop'])),
				getDefaultBranchEffect: vi.fn(() => Effect.fail(gitError)),
			} as unknown as InstanceType<typeof WorktreeService>;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('Error loading branches:');
		expect(output).toContain('git symbolic-ref');
		expect(output).toContain(
			'fatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
		);
	});

	it('should handle empty branch list', async () => {
		const {Effect} = await import('effect');
		const {WorktreeService} = await import('../services/worktreeService.js');
		const {configurationManager} =
			await import('../services/configurationManager.js');

		// Mock autoDirectory to true so component starts at base-branch step
		vi.spyOn(configurationManager, 'getWorktreeConfig').mockReturnValue({
			autoDirectory: true,
			autoDirectoryPattern: '../{project}-{branch}',
			copySessionData: true,
		});

		// Mock WorktreeService to return empty branch list
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getAllBranchesEffect: vi.fn(() => Effect.succeed([])),
				getDefaultBranchEffect: vi.fn(() => Effect.succeed('main')),
			} as unknown as InstanceType<typeof WorktreeService>;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Should show the component (base-branch step) even with empty branch list
		// The component will display just the default branch
		expect(output).toContain('Create New Worktree');
		expect(output).toContain('Select base branch');
	});

	it('should display branches after successful loading', async () => {
		const {Effect} = await import('effect');
		const {WorktreeService} = await import('../services/worktreeService.js');
		const {configurationManager} =
			await import('../services/configurationManager.js');

		// Mock autoDirectory to true so component starts at base-branch step
		vi.spyOn(configurationManager, 'getWorktreeConfig').mockReturnValue({
			autoDirectory: true,
			autoDirectoryPattern: '../{project}-{branch}',
			copySessionData: true,
		});

		const mockBranches = ['main', 'feature-1', 'develop'];
		const mockDefaultBranch = 'main';

		// Mock WorktreeService to succeed
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getAllBranchesEffect: vi.fn(() => Effect.succeed(mockBranches)),
				getDefaultBranchEffect: vi.fn(() => Effect.succeed(mockDefaultBranch)),
			} as unknown as InstanceType<typeof WorktreeService>;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		const {lastFrame} = render(
			<NewWorktree onComplete={onComplete} onCancel={onCancel} />,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Should display the base-branch selection step with branches
		expect(output).toContain('Create New Worktree');
		expect(output).toContain('Select base branch');
		expect(output).toContain('main (default)');
	});

	it('should use Effect.match pattern for error handling', async () => {
		const {Effect} = await import('effect');
		const {GitError} = await import('../types/errors.js');
		const {WorktreeService} = await import('../services/worktreeService.js');

		const gitError = new GitError({
			command: 'git branch --all',
			exitCode: 1,
			stderr: 'error message',
			stdout: '',
		});

		// Track Effect execution
		let effectExecuted = false;
		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getAllBranchesEffect: vi.fn(() => {
					effectExecuted = true;
					return Effect.fail(gitError);
				}),
				getDefaultBranchEffect: vi.fn(() => Effect.succeed('main')),
			} as unknown as InstanceType<typeof WorktreeService>;
		});

		const onComplete = vi.fn();
		const onCancel = vi.fn();

		render(<NewWorktree onComplete={onComplete} onCancel={onCancel} />);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		// Verify Effect was executed (Effect.match pattern)
		expect(effectExecuted).toBe(true);
	});
});
