import React from 'react';
import {render} from 'ink-testing-library';
import Menu from './Menu.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest';

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

vi.mock('../services/globalSessionManager.js', () => ({
	globalSessionManager: {
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

describe('Menu component rendering', () => {
	let sessionManager: SessionManager;
	let worktreeService: WorktreeService;

	beforeEach(() => {
		sessionManager = new SessionManager();
		worktreeService = new WorktreeService();
		vi.spyOn(worktreeService, 'getWorktrees').mockReturnValue([]);
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

		vi.spyOn(worktreeService, 'getWorktrees').mockReturnValue(mockWorktrees);
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
			total: 0,
		});
		vi.spyOn(SessionManager, 'formatSessionCounts').mockReturnValue('');

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				onSelectRecentProject={onSelectRecentProject}
				multiProject={true}
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

		vi.spyOn(worktreeService, 'getWorktrees').mockReturnValue(mockWorktrees);
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
			total: 0,
		});
		vi.spyOn(SessionManager, 'formatSessionCounts').mockReturnValue('');

		const {lastFrame} = render(
			<Menu
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={onSelectWorktree}
				onSelectRecentProject={onSelectRecentProject}
				multiProject={true}
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
