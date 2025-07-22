import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {GitProject} from '../types/index.js';

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
		default: ({items}: any) => {
			return React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item: any, index: number) =>
					React.createElement(Text, {key: index}, item.label),
				),
			);
		},
	};
});

// Now import after mocking
const {default: ProjectList} = await import('./ProjectList.js');
const {MultiProjectService} = await import(
	'../services/multiProjectService.js'
);

// Mock the MultiProjectService
vi.mock('../services/multiProjectService.js', () => {
	return {
		MultiProjectService: vi.fn().mockImplementation(() => {
			return {
				discoverProjects: vi.fn(),
				loadProjectWorktrees: vi.fn().mockResolvedValue(undefined),
			};
		}),
	};
});

describe('ProjectList', () => {
	const mockOnSelectProject = vi.fn();
	const mockOnDismissError = vi.fn();
	const mockDiscoverProjects = vi.fn();
	const mockProjects: GitProject[] = [
		{
			name: 'project1',
			path: '/projects/project1',
			relativePath: 'project1',
			worktrees: [],
			isValid: true,
		},
		{
			name: 'project2',
			path: '/projects/project2',
			relativePath: 'project2',
			worktrees: [],
			isValid: true,
		},
		{
			name: 'project3',
			path: '/projects/project3',
			relativePath: 'project3',
			worktrees: [],
			isValid: true,
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockDiscoverProjects.mockClear();
		mockDiscoverProjects.mockResolvedValue(mockProjects);
		const mockLoadProjectWorktrees = vi.fn().mockResolvedValue(undefined);
		vi.mocked(MultiProjectService).mockImplementation(
			() =>
				({
					discoverProjects: mockDiscoverProjects,
					loadProjectWorktrees: mockLoadProjectWorktrees,
				}) as any,
		);
	});

	it('should render project list with correct title', () => {
		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		expect(lastFrame()).toContain('CCManager - Multi-Project Mode');
		expect(lastFrame()).toContain('Select a project:');
	});

	it('should display loading state initially', () => {
		// Create a promise that never resolves to keep loading state
		mockDiscoverProjects.mockReturnValue(new Promise(() => {}));

		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		expect(lastFrame()).toContain('Loading projects...');
	});

	it('should display projects after loading', async () => {
		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait a bit for async operations
		await new Promise(resolve => setTimeout(resolve, 100));

		// Force rerender
		rerender(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for SelectInput to render with our mock
		await vi.waitFor(
			() => {
				const frame = lastFrame();
				return frame && !frame.includes('Loading projects...');
			},
			{timeout: 2000},
		);

		const frame = lastFrame();
		expect(frame).toContain('0 ❯ project1');
		expect(frame).toContain('1 ❯ project2');
		expect(frame).toContain('2 ❯ project3');
	});

	it('should display error when provided', () => {
		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error="Failed to load projects"
				onDismissError={mockOnDismissError}
			/>,
		);

		expect(lastFrame()).toContain('Error: Failed to load projects');
		expect(lastFrame()).toContain('Press any key to dismiss');
	});

	it('should handle project selection via menu', async () => {
		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait a bit for async operations
		await new Promise(resolve => setTimeout(resolve, 100));

		// Force rerender
		rerender(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for component to update after async loading
		await vi.waitFor(() => {
			const frame = lastFrame();
			return frame && !frame.includes('Loading projects...');
		});

		// Verify menu structure
		const frame = lastFrame();
		expect(frame).toContain('0 ❯ project1');
		expect(frame).toContain('R');
		expect(frame).toContain('Refresh');
		expect(frame).toContain('Q');
		expect(frame).toContain('Exit');
	});

	it('should display number shortcuts for first 10 projects', async () => {
		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait a bit for async operations
		await new Promise(resolve => setTimeout(resolve, 100));

		// Force rerender
		rerender(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			const frame = lastFrame();
			return frame && !frame.includes('Loading projects...');
		});

		// Verify number prefixes are shown
		const frame = lastFrame();
		expect(frame).toContain('0 ❯ project1');
		expect(frame).toContain('1 ❯ project2');
		expect(frame).toContain('2 ❯ project3');
	});

	it('should display exit option in menu', async () => {
		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait a bit for async operations
		await new Promise(resolve => setTimeout(resolve, 100));

		// Force rerender
		rerender(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			const frame = lastFrame();
			return frame && !frame.includes('Loading projects...');
		});

		// Verify exit option is shown
		const frame = lastFrame();
		expect(frame).toContain('Q');
		expect(frame).toContain('Exit');
	});

	it('should display refresh option in menu', async () => {
		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			return lastFrame()?.includes('project1') ?? false;
		});

		// Verify refresh option is shown
		const frame = lastFrame();
		expect(frame).toContain('R');
		expect(frame).toContain('Refresh');
	});

	it('should show empty state when no projects found', async () => {
		mockDiscoverProjects.mockResolvedValue([]);

		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);
			return lastFrame()?.includes('No git repositories found') ?? false;
		});

		expect(lastFrame()).toContain('No git repositories found in /projects');
	});

	it('should display error message when error prop is provided', () => {
		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error="Test error"
				onDismissError={mockOnDismissError}
			/>,
		);

		expect(lastFrame()).toContain('Error: Test error');
		expect(lastFrame()).toContain('Press any key to dismiss');
	});

	it('should show worktree count when loaded', async () => {
		const projectsWithWorktrees: GitProject[] = [
			{
				name: 'project1',
				path: '/projects/project1',
				relativePath: 'project1',
				worktrees: [{path: '/path1', isMainWorktree: true, hasSession: false}],
				isValid: true,
			},
			{
				name: 'project2',
				path: '/projects/project2',
				relativePath: 'project2',
				worktrees: [
					{path: '/path2', isMainWorktree: true, hasSession: false},
					{path: '/path3', isMainWorktree: false, hasSession: false},
				],
				isValid: true,
			},
		];

		mockDiscoverProjects.mockResolvedValue(projectsWithWorktrees);

		// Mock loadProjectWorktrees to set worktrees
		vi.mocked(MultiProjectService).mockImplementation(
			() =>
				({
					discoverProjects: mockDiscoverProjects,
					loadProjectWorktrees: vi.fn().mockImplementation(() => {
						// Simulate that worktrees are already loaded in the projects
						return Promise.resolve();
					}),
				}) as any,
		);

		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait a bit for async operations
		await new Promise(resolve => setTimeout(resolve, 100));

		// Force rerender
		rerender(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for projects to load and worktrees to be loaded
		await vi.waitFor(() => {
			const frame = lastFrame();
			return frame && !frame.includes('Loading projects...');
		});

		const frame = lastFrame();
		expect(frame).toContain('project1 (1 worktree)');
		expect(frame).toContain('project2 (2 worktrees)');
	});
});
