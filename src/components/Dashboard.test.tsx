import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {GitProject} from '../types/index.js';

// Mock bunTerminal to avoid native module loading issues
vi.mock('../services/bunTerminal.js', () => ({
	spawn: vi.fn(function () {
		return null;
	}),
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

// Mock TextInputWrapper to render as simple text
vi.mock('./TextInputWrapper.js', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({value, placeholder}: {value?: string; placeholder?: string}) => {
			return React.createElement(Text, {}, value || placeholder || '');
		},
	};
});

// Mock Effect for testing
vi.mock('effect', async () => {
	const actual = await vi.importActual<typeof import('effect')>('effect');
	return actual;
});

// Mock the projectManager
vi.mock('../services/projectManager.js', () => ({
	projectManager: {
		instance: {
			discoverProjectsEffect: vi.fn(),
		},
		getRecentProjects: vi.fn().mockReturnValue([]),
	},
}));

// Mock globalSessionOrchestrator
vi.mock('../services/globalSessionOrchestrator.js', () => ({
	globalSessionOrchestrator: {
		getProjectPaths: vi.fn().mockReturnValue([]),
		getProjectSessions: vi.fn().mockReturnValue([]),
		getManagerForProject: vi.fn().mockReturnValue({
			on: vi.fn(),
			off: vi.fn(),
			getAllSessions: vi.fn().mockReturnValue([]),
		}),
	},
}));

// Mock WorktreeService
vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn().mockImplementation(() => ({
		getWorktreesEffect: vi.fn(),
		getGitRootPath: vi.fn().mockReturnValue('/test'),
	})),
}));

// Mock useGitStatus to avoid async polling in tests
vi.mock('../hooks/useGitStatus.js', () => ({
	useGitStatus: vi.fn((worktrees: Array<{path: string}>) => worktrees),
}));

// Mock SessionManager static methods
vi.mock('../services/sessionManager.js', () => ({
	SessionManager: {
		getSessionCounts: vi.fn().mockReturnValue({
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: 0,
			backgroundTasks: 0,
			teamMembers: 0,
		}),
		formatSessionCounts: vi.fn().mockReturnValue(''),
	},
}));

// Now import after mocking
const {default: Dashboard} = await import('./Dashboard.js');
const {projectManager} = await import('../services/projectManager.js');
const {globalSessionOrchestrator} =
	await import('../services/globalSessionOrchestrator.js');
const {SessionManager} = await import('../services/sessionManager.js');
const {WorktreeService} = await import('../services/worktreeService.js');
const {Effect} = await import('effect');

describe('Dashboard', () => {
	const mockOnSelectSession = vi.fn();
	const mockOnSelectProject = vi.fn();
	const mockOnDismissError = vi.fn();
	const mockProjects: GitProject[] = [
		{
			name: 'my-app',
			path: '/projects/my-app',
			relativePath: 'my-app',
			isValid: true,
		},
		{
			name: 'api-server',
			path: '/projects/api-server',
			relativePath: 'api-server',
			isValid: true,
		},
		{
			name: 'shared-lib',
			path: '/projects/shared-lib',
			relativePath: 'shared-lib',
			isValid: true,
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.succeed(mockProjects),
		);
		vi.mocked(globalSessionOrchestrator.getProjectPaths).mockReturnValue([]);
		vi.mocked(globalSessionOrchestrator.getProjectSessions).mockReturnValue([]);
		vi.mocked(globalSessionOrchestrator.getManagerForProject).mockReturnValue({
			on: vi.fn(),
			off: vi.fn(),
			getAllSessions: vi.fn().mockReturnValue([]),
		} as never);
	});

	it('should render dashboard with correct title and version', () => {
		const {lastFrame} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		expect(lastFrame()).toContain('CCManager - Dashboard v3.8.1');
	});

	it('should display loading state initially', () => {
		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.async<GitProject[], never>(() => {}),
		);

		const {lastFrame} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		expect(lastFrame()).toContain('Discovering projects...');
	});

	it('should display projects after loading', async () => {
		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));

		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(
			() => {
				const frame = lastFrame();
				return frame && !frame.includes('Discovering projects...');
			},
			{timeout: 2000},
		);

		const frame = lastFrame();
		expect(frame).toContain('my-app');
		expect(frame).toContain('api-server');
		expect(frame).toContain('shared-lib');
	});

	it('should display Projects section separator', async () => {
		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(() => {
			return lastFrame()?.includes('my-app') ?? false;
		});

		expect(lastFrame()).toContain('Projects');
	});

	it('should display Other section with Refresh and Exit', async () => {
		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(() => {
			return lastFrame()?.includes('my-app') ?? false;
		});

		const frame = lastFrame();
		expect(frame).toContain('Other');
		expect(frame).toContain('Refresh');
		expect(frame).toContain('Exit');
	});

	it('should display number shortcuts for projects', async () => {
		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(() => {
			return lastFrame()?.includes('my-app') ?? false;
		});

		const frame = lastFrame();
		expect(frame).toContain('0 ❯ my-app');
		expect(frame).toContain('1 ❯ api-server');
		expect(frame).toContain('2 ❯ shared-lib');
	});

	it('should display status legend', () => {
		const {lastFrame} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		const frame = lastFrame();
		expect(frame).toContain('Busy');
		expect(frame).toContain('Waiting');
		expect(frame).toContain('Idle');
	});

	it('should display error when provided', () => {
		const {lastFrame} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error="Failed to load"
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		expect(lastFrame()).toContain('Error: Failed to load');
		expect(lastFrame()).toContain('Press any key to dismiss');
	});

	it('should show empty state when no projects found', async () => {
		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.succeed([]),
		);

		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(
			() => {
				const frame = lastFrame();
				return frame && !frame.includes('Discovering projects...');
			},
			{timeout: 2000},
		);

		expect(lastFrame()).toContain('No git repositories found in /projects');
	});

	it('should not show Active Sessions section when there are no sessions', async () => {
		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(() => {
			return lastFrame()?.includes('my-app') ?? false;
		});

		expect(lastFrame()).not.toContain('Active Sessions');
	});

	it('should show Active Sessions when sessions exist', async () => {
		const mockSession = {
			id: 'session-1',
			worktreePath: '/projects/my-app/worktrees/feature-auth',
			lastActivity: new Date(),
			isActive: true,
			stateMutex: {
				getSnapshot: () => ({
					state: 'busy' as const,
					backgroundTaskCount: 0,
					teamMemberCount: 0,
				}),
			},
		};

		const mockWorktrees = [
			{
				path: '/projects/my-app/worktrees/feature-auth',
				branch: 'feature/auth',
				isMainWorktree: false,
				hasSession: true,
			},
		];

		vi.mocked(globalSessionOrchestrator.getProjectPaths).mockReturnValue([
			'/projects/my-app',
		]);
		vi.mocked(globalSessionOrchestrator.getProjectSessions).mockReturnValue([
			mockSession as never,
		]);

		vi.mocked(WorktreeService).mockImplementation(function () {
			return {
				getWorktreesEffect: () => Effect.succeed(mockWorktrees),
				getGitRootPath: () => '/projects/my-app',
			};
		} as never);

		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 200));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(
			() => {
				const frame = lastFrame();
				return frame?.includes('Active Sessions') ?? false;
			},
			{timeout: 3000},
		);

		const frame = lastFrame();
		expect(frame).toContain('Active Sessions');
		expect(frame).toContain('my-app :: feature/auth');
		expect(frame).toContain('Busy');
	});

	it('should show session counts next to projects', async () => {
		vi.mocked(SessionManager.formatSessionCounts).mockReturnValue(' (1 Busy)');

		vi.mocked(globalSessionOrchestrator.getProjectSessions).mockImplementation(
			(path: string) => {
				if (path === '/projects/my-app') {
					return [{id: 'session-1'}] as never;
				}
				return [];
			},
		);

		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(() => {
			return lastFrame()?.includes('my-app') ?? false;
		});

		expect(lastFrame()).toContain('(1 Busy)');
	});

	it('should use relativePath for duplicate project names', async () => {
		const duplicateProjects: GitProject[] = [
			{
				name: 'utils',
				path: '/projects/team-a/utils',
				relativePath: 'team-a/utils',
				isValid: true,
			},
			{
				name: 'utils',
				path: '/projects/team-b/utils',
				relativePath: 'team-b/utils',
				isValid: true,
			},
		];

		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.succeed(duplicateProjects),
		);

		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(() => {
			return lastFrame()?.includes('team-a/utils') ?? false;
		});

		const frame = lastFrame();
		expect(frame).toContain('team-a/utils');
		expect(frame).toContain('team-b/utils');
	});

	it('should display controls help text', () => {
		const {lastFrame} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		expect(lastFrame()).toContain('Controls:');
		expect(lastFrame()).toContain('0-9 Quick Select');
		expect(lastFrame()).toContain('R-Refresh');
		expect(lastFrame()).toContain('Q-Quit');
	});

	it('should handle filesystem error during project discovery', async () => {
		const {FileSystemError} = await import('../types/errors.js');

		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.fail(
				new FileSystemError({
					operation: 'read',
					path: '/projects',
					cause: 'Permission denied',
				}),
			),
		);

		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(
			() => {
				const frame = lastFrame();
				return frame && !frame.includes('Discovering projects...');
			},
			{timeout: 2000},
		);

		expect(lastFrame()).toContain('Error:');
	});

	it('should show recent projects first in the Projects section', async () => {
		vi.mocked(projectManager.getRecentProjects).mockReturnValue([
			{
				path: '/projects/shared-lib',
				name: 'shared-lib',
				lastAccessed: Date.now(),
			},
		]);

		const {lastFrame, rerender} = render(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 100));
		rerender(
			<Dashboard
				projectsDir="/projects"
				onSelectSession={mockOnSelectSession}
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
				version="3.8.1"
			/>,
		);

		await vi.waitFor(() => {
			return lastFrame()?.includes('shared-lib') ?? false;
		});

		const frame = lastFrame()!;
		// shared-lib should appear first (index 0) because it's recent
		expect(frame).toContain('0 ❯ shared-lib');
	});
});
