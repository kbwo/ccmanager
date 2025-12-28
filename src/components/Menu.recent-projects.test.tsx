import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import {Effect} from 'effect';
import Menu from './Menu.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {projectManager} from '../services/projectManager.js';

// Mock bun-pty to avoid native module issues in tests
vi.mock('@skitee3000/bun-pty', () => ({
	spawn: vi.fn(function () {
		return null;
	}),
}));

// Mock @xterm/headless
vi.mock('@xterm/headless', () => ({
	default: {
		Terminal: vi.fn().mockImplementation(function () {
			return {
				buffer: {
					active: {
						length: 0,
						getLine: vi.fn(),
					},
				},
				write: vi.fn(),
			};
		}),
	},
}));

// Import the actual component code but skip the useInput hook
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

// Mock all dependencies properly
vi.mock('../hooks/useGitStatus.js', () => ({
	useGitStatus: (worktrees: unknown) => worktrees,
}));

vi.mock('../services/projectManager.js', () => ({
	projectManager: {
		getRecentProjects: vi.fn(),
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
			back: {key: 'b'},
			quit: {key: 'q'},
		}),
		matchesShortcut: vi.fn().mockReturnValue(false),
	},
}));

describe('Menu - Recent Projects', () => {
	let mockSessionManager: SessionManager;
	let mockWorktreeService: WorktreeService;
	const originalEnv = process.env;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = {...originalEnv};

		mockSessionManager = {
			getAllSessions: vi.fn().mockReturnValue([]),
			on: vi.fn(),
			off: vi.fn(),
			getSession: vi.fn(),
			createSessionWithPreset: vi.fn(),
			createSessionWithDevcontainer: vi.fn(),
			destroy: vi.fn(),
		} as unknown as SessionManager;

		mockWorktreeService = {
			getWorktreesEffect: vi.fn().mockReturnValue(
				Effect.succeed([
					{
						path: '/workspace/main',
						branch: 'main',
						isMainWorktree: true,
						hasSession: false,
					},
				]),
			),
			getDefaultBranchEffect: vi.fn().mockReturnValue(Effect.succeed('main')),
			getGitRootPath: vi.fn().mockReturnValue('/default/project'),
		} as unknown as WorktreeService;

		vi.mocked(projectManager.getRecentProjects).mockReturnValue([]);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('should not show recent projects in single-project mode', () => {
		vi.mocked(projectManager.getRecentProjects).mockReturnValue([
			{path: '/project1', name: 'Project 1', lastAccessed: 1000},
		]);

		const {lastFrame} = render(
			<Menu
				sessionManager={mockSessionManager}
				worktreeService={mockWorktreeService}
				onSelectWorktree={vi.fn()}
				multiProject={false}
			/>,
		);

		const output = lastFrame();
		expect(output).not.toContain('─ Recent ─');
		expect(output).not.toContain('Project 1');
	});

	it('should show recent projects in multi-project mode', async () => {
		vi.mocked(projectManager.getRecentProjects).mockReturnValue([
			{path: '/project1', name: 'Project 1', lastAccessed: 2000},
			{path: '/project2', name: 'Project 2', lastAccessed: 1000},
		]);

		// Mock SessionManager static methods
		vi.spyOn(SessionManager, 'getSessionCounts').mockReturnValue({
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: 0,
		});
		vi.spyOn(SessionManager, 'formatSessionCounts').mockReturnValue('');

		const {lastFrame} = render(
			<Menu
				sessionManager={mockSessionManager}
				worktreeService={mockWorktreeService}
				onSelectWorktree={vi.fn()}
				onSelectRecentProject={vi.fn()}
				multiProject={true}
			/>,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('─ Recent ─');
		expect(output).toContain('Project 1');
		expect(output).toContain('Project 2');
	});

	it('should not show recent projects section when no recent projects', () => {
		vi.mocked(projectManager.getRecentProjects).mockReturnValue([]);

		const {lastFrame} = render(
			<Menu
				sessionManager={mockSessionManager}
				worktreeService={mockWorktreeService}
				onSelectWorktree={vi.fn()}
				onSelectRecentProject={vi.fn()}
				multiProject={true}
			/>,
		);

		const output = lastFrame();
		expect(output).not.toContain('─ Recent ─');
	});

	it('should show up to 5 recent projects', async () => {
		const manyProjects = Array.from({length: 5}, (_, i) => ({
			path: `/project${i}`,
			name: `Project ${i}`,
			lastAccessed: i * 1000,
		}));
		vi.mocked(projectManager.getRecentProjects).mockReturnValue(manyProjects);

		// Mock SessionManager static methods
		vi.spyOn(SessionManager, 'getSessionCounts').mockReturnValue({
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: 0,
		});
		vi.spyOn(SessionManager, 'formatSessionCounts').mockReturnValue('');

		const {lastFrame} = render(
			<Menu
				sessionManager={mockSessionManager}
				worktreeService={mockWorktreeService}
				onSelectWorktree={vi.fn()}
				onSelectRecentProject={vi.fn()}
				multiProject={true}
			/>,
		);

		// Wait for Effect to execute
		await new Promise(resolve => setTimeout(resolve, 100));

		const output = lastFrame();
		expect(output).toContain('─ Recent ─');
		expect(output).toContain('Project 0');
		expect(output).toContain('Project 4');
	});

	it('should filter out current project from recent projects', async () => {
		// Setup the initial recent projects
		vi.mocked(projectManager.getRecentProjects).mockReturnValue([
			{path: '/current/project', name: 'Current Project', lastAccessed: 3000},
			{path: '/project1', name: 'Project 1', lastAccessed: 2000},
			{path: '/project2', name: 'Project 2', lastAccessed: 1000},
		]);

		// Setup worktree service mock
		const worktreeServiceWithGitRoot = {
			...mockWorktreeService,
			getGitRootPath: vi.fn().mockReturnValue('/current/project'),
		} as unknown as WorktreeService;

		const {lastFrame, rerender} = render(
			<Menu
				sessionManager={mockSessionManager}
				worktreeService={worktreeServiceWithGitRoot}
				onSelectWorktree={vi.fn()}
				onSelectRecentProject={vi.fn()}
				multiProject={true}
			/>,
		);

		// Force a rerender to ensure all effects have run
		rerender(
			<Menu
				sessionManager={mockSessionManager}
				worktreeService={worktreeServiceWithGitRoot}
				onSelectWorktree={vi.fn()}
				onSelectRecentProject={vi.fn()}
				multiProject={true}
			/>,
		);

		// Wait for the state to update and component to re-render
		await new Promise(resolve => setTimeout(resolve, 50));

		const output = lastFrame();
		expect(output).toContain('─ Recent ─');
		expect(output).not.toContain('Current Project');
		expect(output).toContain('Project 1');
		expect(output).toContain('Project 2');
	});

	it('should hide recent projects section when all projects are filtered out', () => {
		vi.mocked(projectManager.getRecentProjects).mockReturnValue([
			{
				path: '/current/project',
				name: 'Current Project',
				lastAccessed: 3000,
			},
		]);

		// Mock getGitRootPath to return the current project path
		vi.mocked(mockWorktreeService.getGitRootPath).mockReturnValue(
			'/current/project',
		);

		const {lastFrame} = render(
			<Menu
				sessionManager={mockSessionManager}
				worktreeService={mockWorktreeService}
				onSelectWorktree={vi.fn()}
				onSelectRecentProject={vi.fn()}
				multiProject={true}
			/>,
		);

		const output = lastFrame();
		expect(output).not.toContain('─ Recent ─');
		expect(output).not.toContain('Current Project');
	});
});
