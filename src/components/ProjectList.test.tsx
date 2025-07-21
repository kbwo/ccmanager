import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ProjectList from './ProjectList.js';
import {GitProject} from '../types/index.js';
import {MultiProjectService} from '../services/multiProjectService.js';

// Mock the MultiProjectService
vi.mock('../services/multiProjectService.js', () => {
	return {
		MultiProjectService: vi.fn().mockImplementation(() => {
			return {
				discoverProjects: vi.fn(),
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
		vi.mocked(MultiProjectService).mockImplementation(
			() =>
				({
					discoverProjects: mockDiscoverProjects,
				}) as any,
		);
	});

	it('should render project list with correct title', () => {
		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
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
			/>,
		);

		expect(lastFrame()).toContain('Loading projects...');
	});

	it('should display projects after loading', async () => {
		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
			/>,
		);

		// Wait for component to update after async loading
		await vi.waitFor(() => {
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
				/>,
			);
			return lastFrame()?.includes('project1') ?? false;
		});

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
			/>,
		);

		// Wait for component to update after async loading
		await vi.waitFor(() => {
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
				/>,
			);
			return lastFrame()?.includes('project1') ?? false;
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
		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			return lastFrame()?.includes('project1') ?? false;
		});

		// Verify number prefixes are shown
		const frame = lastFrame();
		expect(frame).toContain('0 ❯ project1');
		expect(frame).toContain('1 ❯ project2');
		expect(frame).toContain('2 ❯ project3');
	});

	it('should display exit option in menu', async () => {
		const {lastFrame} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			return lastFrame()?.includes('project1') ?? false;
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
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
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

	it('should respect limit prop for SelectInput', async () => {
		const manyProjects = Array.from({length: 20}, (_, i) => ({
			name: `project${i}`,
			path: `/projects/project${i}`,
			relativePath: `project${i}`,
			worktrees: [],
			isValid: true,
		}));

		mockDiscoverProjects.mockResolvedValue(manyProjects);

		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				limit={10}
			/>,
		);

		// Wait for projects to load
		await vi.waitFor(() => {
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					limit={10}
				/>,
			);
			return lastFrame()?.includes('project0') ?? false;
		});

		// Should show only first 10 numbered items (0-9)
		expect(lastFrame()).toContain('0 ❯');
		expect(lastFrame()).toContain('9 ❯');
		expect(lastFrame()).not.toContain('10 ❯');
	});
});
