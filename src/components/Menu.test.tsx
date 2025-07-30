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

vi.mock('../services/recentProjectsService.js', () => ({
	recentProjectsService: {
		getRecentProjects: vi.fn().mockReturnValue([]),
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
});
