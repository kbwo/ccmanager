import React from 'react';
import {render} from 'ink-testing-library';
import Menu from './Menu.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest';

// Mock bunTerminal to avoid native module issues in tests
vi.mock('../services/bunTerminal.js', () => ({
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
vi.mock('../hooks/useGitStatus.js', () => ({
	useGitStatus: (worktrees: unknown) => worktrees,
}));

vi.mock('../services/projectManager.js', () => ({
	projectManager: {
		getRecentProjects: vi.fn().mockReturnValue([]),
	},
}));

vi.mock('../services/globalSessionOrchestrator.js', () => ({
	globalSessionOrchestrator: {
		getProjectSessions: vi.fn().mockReturnValue([]),
	},
}));

vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		getShortcutDisplay: vi.fn().mockReturnValue('Ctrl+C'),
		getShortcuts: vi.fn().mockReturnValue({
			refresh: {key: 'r'},
			newWorktree: {key: 'n'},
			quit: {key: 'q', ctrl: true},
		}),
		matchesShortcut: vi.fn().mockReturnValue(false),
	},
}));

vi.mock('../hooks/useSearchMode.js', () => ({
	useSearchMode: () => ({
		isSearchMode: false,
		searchQuery: '',
		setSearchQuery: vi.fn(),
		handleKey: vi.fn(),
	}),
}));

describe('Menu component Effect-based error handling', () => {
	let sessionManager: SessionManager;
	let worktreeService: WorktreeService;

	beforeEach(() => {
		sessionManager = new SessionManager();
		worktreeService = new WorktreeService();
		// Mock EventEmitter methods
		vi.spyOn(sessionManager, 'on').mockImplementation(() => sessionManager);
		vi.spyOn(sessionManager, 'off').mockImplementation(() => sessionManager);
		vi.spyOn(sessionManager, 'getAllSessions').mockReturnValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should handle GitError from getWorktreesEffect and display error message', async () => {
		const {Effect} = await import('effect');
		const {GitError} = await import('../types/errors.js');

		const onSelectWorktree = vi.fn();
		const onDismissError = vi.fn();

		// Mock getWorktreesEffect to return a failing Effect
		const gitError = new GitError({
			command: 'git worktree list --porcelain',
			exitCode: 128,
			stderr: 'fatal: not a git repository',
			stdout: '',
		});

		vi.spyOn(worktreeService, 'getWorktreesEffect').mockReturnValue(
			Effect.fail(gitError),
		);

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				onDismissError={onDismissError}
				version="test"
			/>,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Should display error with GitError information
		expect(output).toContain('Error:');
		expect(output).toContain('git worktree list --porcelain');
		expect(output).toContain('fatal: not a git repository');
	});

	it('should successfully load worktrees using getWorktreesEffect', async () => {
		const {Effect} = await import('effect');

		const onSelectWorktree = vi.fn();

		const mockWorktrees = [
			{
				path: '/test/main',
				branch: 'main',
				isMainWorktree: true,
				hasSession: false,
			},
			{
				path: '/test/feature',
				branch: 'feature-branch',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		// Mock getWorktreesEffect to return successful Effect
		vi.spyOn(worktreeService, 'getWorktreesEffect').mockReturnValue(
			Effect.succeed(mockWorktrees),
		);
		// Mock getDefaultBranchEffect to return successful Effect
		vi.spyOn(worktreeService, 'getDefaultBranchEffect').mockReturnValue(
			Effect.succeed('main'),
		);

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				version="test"
			/>,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Should display worktrees
		expect(output).toContain('main');
		expect(output).toContain('feature-branch');
	});

	it('should handle GitError from getDefaultBranchEffect and display error message', async () => {
		const {Effect} = await import('effect');
		const {GitError} = await import('../types/errors.js');

		const onSelectWorktree = vi.fn();
		const onDismissError = vi.fn();

		const mockWorktrees = [
			{
				path: '/test/main',
				branch: 'main',
				isMainWorktree: true,
				hasSession: false,
			},
		];

		// Mock getWorktreesEffect to succeed
		vi.spyOn(worktreeService, 'getWorktreesEffect').mockReturnValue(
			Effect.succeed(mockWorktrees),
		);

		// Mock getDefaultBranchEffect to fail
		const gitError = new GitError({
			command: 'git symbolic-ref refs/remotes/origin/HEAD',
			exitCode: 128,
			stderr: 'fatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
			stdout: '',
		});

		vi.spyOn(worktreeService, 'getDefaultBranchEffect').mockReturnValue(
			Effect.fail(gitError),
		);

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				onDismissError={onDismissError}
				version="test"
			/>,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Should display error with GitError information
		expect(output).toContain('Error:');
		expect(output).toContain('git symbolic-ref');
		expect(output).toContain(
			'fatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
		);
	});

	it('should use Effect composition to load worktrees and default branch together', async () => {
		const {Effect} = await import('effect');

		const onSelectWorktree = vi.fn();

		const mockWorktrees = [
			{
				path: '/test/main',
				branch: 'main',
				isMainWorktree: true,
				hasSession: false,
			},
		];

		// Track that both Effects are called
		const getWorktreesSpy = vi
			.spyOn(worktreeService, 'getWorktreesEffect')
			.mockReturnValue(Effect.succeed(mockWorktrees));
		const getDefaultBranchSpy = vi
			.spyOn(worktreeService, 'getDefaultBranchEffect')
			.mockReturnValue(Effect.succeed('main'));

		render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				version="test"
			/>,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		// Verify both Effect-based methods were called (Effect composition)
		expect(getWorktreesSpy).toHaveBeenCalled();
		expect(getDefaultBranchSpy).toHaveBeenCalled();
	});
});

describe('Menu component rendering', () => {
	let sessionManager: SessionManager;
	let worktreeService: WorktreeService;

	beforeEach(async () => {
		const {Effect} = await import('effect');
		sessionManager = new SessionManager();
		worktreeService = new WorktreeService();
		// Mock Effect-based methods
		vi.spyOn(worktreeService, 'getWorktreesEffect').mockReturnValue(
			Effect.succeed([]),
		);
		vi.spyOn(worktreeService, 'getDefaultBranchEffect').mockReturnValue(
			Effect.succeed('main'),
		);
		vi.spyOn(sessionManager, 'getAllSessions').mockReturnValue([]);
		// Mock EventEmitter methods
		vi.spyOn(sessionManager, 'on').mockImplementation(() => sessionManager);
		vi.spyOn(sessionManager, 'off').mockImplementation(() => sessionManager);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should not render duplicate title when re-rendered with new key', async () => {
		const onSelectWorktree = vi.fn();

		// First render
		const {unmount, lastFrame} = render(
			<Menu
				key={1}
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				version="test"
			/>,
		);

		// Wait for async operations
		await new Promise(resolve => setTimeout(resolve, 100));

		const firstRenderOutput = lastFrame();

		// Count occurrences of the title
		const titleCount = (
			firstRenderOutput?.match(/CCManager - Claude Code Worktree Manager/g) ||
			[]
		).length;
		expect(titleCount).toBe(1);

		// Unmount and re-render with new key
		unmount();

		const {lastFrame: lastFrame2} = render(
			<Menu
				key={2}
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				version="test"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const secondRenderOutput = lastFrame2();
		const titleCount2 = (
			secondRenderOutput?.match(/CCManager - Claude Code Worktree Manager/g) ||
			[]
		).length;
		expect(titleCount2).toBe(1);
	});

	it('should render title and description only once', async () => {
		const onSelectWorktree = vi.fn();

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				version="test"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Check title appears only once
		const titleMatches =
			output?.match(/CCManager - Claude Code Worktree Manager/g) || [];
		expect(titleMatches.length).toBe(1);

		// Check description appears only once
		const descMatches =
			output?.match(
				/Select a worktree to start or resume a Claude Code session:/g,
			) || [];
		expect(descMatches.length).toBe(1);
	});

	it('should display number shortcuts for recent projects when worktrees < 10', async () => {
		const {Effect} = await import('effect');
		const onSelectWorktree = vi.fn();
		const onSelectRecentProject = vi.fn();

		// Setup: 3 worktrees
		const mockWorktrees = [
			{
				path: '/test/wt1',
				branch: 'feature-1',
				isMainWorktree: false,
				hasSession: false,
			},
			{
				path: '/test/wt2',
				branch: 'feature-2',
				isMainWorktree: false,
				hasSession: false,
			},
			{
				path: '/test/wt3',
				branch: 'feature-3',
				isMainWorktree: false,
				hasSession: false,
			},
		];

		// Setup: 3 recent projects
		const mockRecentProjects = [
			{name: 'Project A', path: '/test/project-a', lastAccessed: Date.now()},
			{name: 'Project B', path: '/test/project-b', lastAccessed: Date.now()},
			{name: 'Project C', path: '/test/project-c', lastAccessed: Date.now()},
		];

		vi.spyOn(worktreeService, 'getWorktreesEffect').mockReturnValue(
			Effect.succeed(mockWorktrees),
		);
		vi.spyOn(worktreeService, 'getGitRootPath').mockReturnValue(
			'/test/current',
		);
		const {projectManager} = await import('../services/projectManager.js');
		vi.mocked(projectManager.getRecentProjects).mockReturnValue(
			mockRecentProjects,
		);

		// Mock session counts
		vi.spyOn(SessionManager, 'getSessionCounts').mockReturnValue({
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: 0,
			backgroundTasks: 0,
			teamMembers: 0,
		});
		vi.spyOn(SessionManager, 'formatSessionCounts').mockReturnValue('');

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				onSelectRecentProject={onSelectRecentProject}
				multiProject={true}
				version="test"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Check that worktrees have numbers 0-2
		expect(output).toContain('0 ❯');
		expect(output).toContain('1 ❯');
		expect(output).toContain('2 ❯');

		// Check that recent projects have numbers 3-5
		expect(output).toContain('3 ❯ Project A');
		expect(output).toContain('4 ❯ Project B');
		expect(output).toContain('5 ❯ Project C');
	});

	it('should not display number shortcuts for recent projects when worktrees >= 10', async () => {
		const {Effect} = await import('effect');
		const onSelectWorktree = vi.fn();
		const onSelectRecentProject = vi.fn();

		// Setup: 10 worktrees
		const mockWorktrees = Array.from({length: 10}, (_, i) => ({
			path: `/test/wt${i}`,
			branch: `feature-${i}`,
			isMainWorktree: false,
			hasSession: false,
		}));

		// Setup: 2 recent projects
		const mockRecentProjects = [
			{name: 'Project A', path: '/test/project-a', lastAccessed: Date.now()},
			{name: 'Project B', path: '/test/project-b', lastAccessed: Date.now()},
		];

		vi.spyOn(worktreeService, 'getWorktreesEffect').mockReturnValue(
			Effect.succeed(mockWorktrees),
		);
		vi.spyOn(worktreeService, 'getGitRootPath').mockReturnValue(
			'/test/current',
		);
		const {projectManager} = await import('../services/projectManager.js');
		vi.mocked(projectManager.getRecentProjects).mockReturnValue(
			mockRecentProjects,
		);

		// Mock session counts
		vi.spyOn(SessionManager, 'getSessionCounts').mockReturnValue({
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: 0,
			backgroundTasks: 0,
			teamMembers: 0,
		});
		vi.spyOn(SessionManager, 'formatSessionCounts').mockReturnValue('');

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				onSelectRecentProject={onSelectRecentProject}
				multiProject={true}
				version="test"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();

		// Check that recent projects don't have numbers (just ❯ prefix)
		expect(output).toContain('❯ Project A');
		expect(output).toContain('❯ Project B');
		// Make sure they don't have number prefixes
		expect(output).not.toContain('10 ❯ Project A');
		expect(output).not.toContain('11 ❯ Project B');
	});
});
