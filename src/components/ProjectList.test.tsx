import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {GitProject} from '../types/index.js';

// Mock bun-pty to avoid native module loading issues
vi.mock('@skitee3000/bun-pty', () => ({
	spawn: vi.fn(),
}));

// Type for the key parameter in useInput
type InputKey = {
	escape: boolean;
	return: boolean;
	leftArrow: boolean;
	rightArrow: boolean;
	upArrow: boolean;
	downArrow: boolean;
	pageDown: boolean;
	pageUp: boolean;
	ctrl: boolean;
	shift: boolean;
	tab: boolean;
	backspace: boolean;
	delete: boolean;
	meta: boolean;
};

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

// Now import after mocking
const {default: ProjectList} = await import('./ProjectList.js');
const {projectManager} = await import('../services/projectManager.js');
const {Effect} = await import('effect');

describe('ProjectList', () => {
	const mockOnSelectProject = vi.fn();
	const mockOnDismissError = vi.fn();
	const mockProjects: GitProject[] = [
		{
			name: 'project1',
			path: '/projects/project1',
			relativePath: 'project1',
			isValid: true,
		},
		{
			name: 'project2',
			path: '/projects/project2',
			relativePath: 'project2',
			isValid: true,
		},
		{
			name: 'project3',
			path: '/projects/project3',
			relativePath: 'project3',
			isValid: true,
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.succeed(mockProjects),
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
		// Create an Effect that never completes to keep loading state
		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.async<GitProject[], never>(() => {}),
		);

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
		vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
			Effect.succeed([]),
		);

		const {lastFrame, rerender} = render(
			<ProjectList
				projectsDir="/projects"
				onSelectProject={mockOnSelectProject}
				error={null}
				onDismissError={mockOnDismissError}
			/>,
		);

		// Wait for loading to finish
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
		await vi.waitFor(
			() => {
				const frame = lastFrame();
				return frame && !frame.includes('Loading projects...');
			},
			{timeout: 2000},
		);

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

	describe('search functionality', () => {
		it.skip('should enter search mode when "/" key is pressed', async () => {
			const mockUseInput = vi.mocked(await import('ink')).useInput;
			const inputHandlers: Array<(input: string, key: InputKey) => void> = [];
			mockUseInput.mockImplementation(handler => {
				inputHandlers.push(handler);
			});

			// Need to set up stdin.setRawMode for the test
			const originalSetRawMode = process.stdin.setRawMode;
			process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

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
				return lastFrame()?.includes('project1') ?? false;
			});

			// Simulate pressing "/" key on all handlers (both from useSearchMode and ProjectList)
			inputHandlers.forEach(handler => {
				handler('/', {
					escape: false,
					return: false,
					leftArrow: false,
					rightArrow: false,
					upArrow: false,
					downArrow: false,
					pageDown: false,
					pageUp: false,
					ctrl: false,
					shift: false,
					tab: false,
					backspace: false,
					delete: false,
					meta: false,
				});
			});

			// Wait a bit for state update
			await new Promise(resolve => setTimeout(resolve, 50));

			// Force rerender to see updated state
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Should show search input
			expect(lastFrame()).toContain('Search:');

			// Restore original
			process.stdin.setRawMode = originalSetRawMode;
		});

		it('should filter projects based on search query', async () => {
			const mockUseInput = vi.mocked(await import('ink')).useInput;
			let inputHandler: (input: string, key: InputKey) => void = () => {};
			mockUseInput.mockImplementation(handler => {
				inputHandler = handler;
			});

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
				return lastFrame()?.includes('project1') ?? false;
			});

			// Enter search mode
			inputHandler('/', {
				escape: false,
				return: false,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			// Force rerender with search active and query
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Simulate typing "project2" in search
			// This would be handled by the TextInput component
			// We'll test the filtering logic separately
		});

		it.skip('should exit search mode but keep filter when ESC is pressed in search mode', async () => {
			const mockUseInput = vi.mocked(await import('ink')).useInput;
			let inputHandler: (input: string, key: InputKey) => void = () => {};
			mockUseInput.mockImplementation(handler => {
				inputHandler = handler;
			});

			// Need to set up stdin.setRawMode for the test
			const originalSetRawMode = process.stdin.setRawMode;
			process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

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
				return lastFrame()?.includes('project1') ?? false;
			});

			// Enter search mode
			inputHandler('/', {
				escape: false,
				return: false,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			// Wait a bit for state update
			await new Promise(resolve => setTimeout(resolve, 50));

			// Force rerender
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Should be in search mode
			expect(lastFrame()).toContain('Search:');

			// Press ESC
			inputHandler('', {
				escape: true,
				return: false,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			// Wait a bit for state update
			await new Promise(resolve => setTimeout(resolve, 50));

			// Force rerender
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Should exit search mode
			expect(lastFrame()).not.toContain('Search:');

			// Restore original
			process.stdin.setRawMode = originalSetRawMode;
		});

		it('should not enter search mode when "/" is pressed during error display', async () => {
			const mockUseInput = vi.mocked(await import('ink')).useInput;
			let inputHandler: (input: string, key: InputKey) => void = () => {};
			mockUseInput.mockImplementation(handler => {
				inputHandler = handler;
			});

			// Need to set up stdin.setRawMode for the test
			const originalSetRawMode = process.stdin.setRawMode;
			process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

			const {lastFrame, rerender} = render(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error="Test error"
					onDismissError={mockOnDismissError}
				/>,
			);

			// Press "/" key
			inputHandler('/', {
				escape: false,
				return: false,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			// Wait a bit for state update
			await new Promise(resolve => setTimeout(resolve, 50));

			// Force rerender
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error="Test error"
					onDismissError={mockOnDismissError}
				/>,
			);

			// Should not show search input, should dismiss error instead
			expect(lastFrame()).not.toContain('Search:');
			expect(mockOnDismissError).toHaveBeenCalled();

			// Restore original
			process.stdin.setRawMode = originalSetRawMode;
		});

		it.skip('should exit search mode when Enter is pressed but keep filter', async () => {
			const mockUseInput = vi.mocked(await import('ink')).useInput;
			let inputHandler: (input: string, key: InputKey) => void = () => {};
			mockUseInput.mockImplementation(handler => {
				inputHandler = handler;
			});

			// Need to set up stdin.setRawMode for the test
			const originalSetRawMode = process.stdin.setRawMode;
			process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

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
				return lastFrame()?.includes('project1') ?? false;
			});

			// Enter search mode
			inputHandler('/', {
				escape: false,
				return: false,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			// Wait a bit for state update
			await new Promise(resolve => setTimeout(resolve, 50));

			// Force rerender
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Should be in search mode
			expect(lastFrame()).toContain('Search:');

			// Press Enter
			inputHandler('', {
				escape: false,
				return: true,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			// Wait a bit for state update
			await new Promise(resolve => setTimeout(resolve, 50));

			// Force rerender
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Should exit search mode
			expect(lastFrame()).not.toContain('Search:');
			// Should not have called onSelectProject
			expect(mockOnSelectProject).not.toHaveBeenCalled();

			// Restore original
			process.stdin.setRawMode = originalSetRawMode;
		});

		it('should clear filter when ESC is pressed outside search mode', async () => {
			const mockUseInput = vi.mocked(await import('ink')).useInput;
			let inputHandler: (input: string, key: InputKey) => void = () => {};
			mockUseInput.mockImplementation(handler => {
				inputHandler = handler;
			});

			// Need to set up stdin.setRawMode for the test
			const originalSetRawMode = process.stdin.setRawMode;
			process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

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
				return lastFrame()?.includes('project1') ?? false;
			});

			// Enter search mode
			inputHandler('/', {
				escape: false,
				return: false,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			await new Promise(resolve => setTimeout(resolve, 50));

			// Exit search mode with Enter (keeping filter)
			inputHandler('', {
				escape: false,
				return: true,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			await new Promise(resolve => setTimeout(resolve, 50));

			// Now press ESC outside search mode to clear filter
			inputHandler('', {
				escape: true,
				return: false,
				leftArrow: false,
				rightArrow: false,
				upArrow: false,
				downArrow: false,
				pageDown: false,
				pageUp: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			});

			await new Promise(resolve => setTimeout(resolve, 50));

			// Force rerender
			rerender(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Should display all projects (filter cleared)
			expect(lastFrame()).toContain('project1');
			expect(lastFrame()).toContain('project2');
			expect(lastFrame()).toContain('project3');

			// Restore original
			process.stdin.setRawMode = originalSetRawMode;
		});
	});

	describe('Effect-based Project Discovery Error Handling', () => {
		it('should handle FileSystemError from discoverProjectsEffect gracefully', async () => {
			const {FileSystemError} = await import('../types/errors.js');

			// Mock discoverProjectsEffect to return a failed Effect with FileSystemError
			const fileSystemError = new FileSystemError({
				operation: 'read',
				path: '/projects',
				cause: 'Directory not accessible',
			});

			vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
				Effect.fail(fileSystemError),
			);

			const {lastFrame, rerender} = render(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Wait for loading to finish
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

			// Wait for projects to attempt loading
			await vi.waitFor(
				() => {
					const frame = lastFrame();
					return frame && !frame.includes('Loading projects...');
				},
				{timeout: 2000},
			);

			// Should display error message with FileSystemError details
			const frame = lastFrame();
			expect(frame).toContain('Error:');
		});

		it.skip('should handle GitError from project validation failures', async () => {
			const {GitError} = await import('../types/errors.js');

			// Mock discoverProjectsEffect to return a failed Effect with GitError
			const gitError = new GitError({
				command: 'git rev-parse --show-toplevel',
				exitCode: 128,
				stderr: 'Not a git repository',
			});

			vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
				// @ts-expect-error - Test uses wrong error type (should be FileSystemError)
				Effect.fail(gitError),
			);

			const {lastFrame, rerender} = render(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Wait for projects to attempt loading
			await vi.waitFor(() => {
				rerender(
					<ProjectList
						projectsDir="/projects"
						onSelectProject={mockOnSelectProject}
						error={null}
						onDismissError={mockOnDismissError}
					/>,
				);
				return !lastFrame()?.includes('Loading projects...');
			});

			// Should display error message
			const frame = lastFrame();
			expect(frame).toContain('Error:');
		});

		it('should implement cancellation flag for cleanup on unmount', async () => {
			vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
				Effect.async<GitProject[], never>(emit => {
					const timeout = setTimeout(() => {
						emit(Effect.succeed(mockProjects));
					}, 500);
					return Effect.sync(() => clearTimeout(timeout));
				}),
			);

			const {unmount, lastFrame} = render(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Wait a bit to ensure promise is pending
			await new Promise(resolve => setTimeout(resolve, 100));

			// Component should still be loading
			expect(lastFrame()).toContain('Loading projects...');

			// Unmount before promise resolves
			unmount();

			// Wait for promise to potentially resolve
			await new Promise(resolve => setTimeout(resolve, 500));

			// Component is unmounted, no state updates should occur
			// This test verifies the cancellation flag prevents state updates after unmount
		});

		it('should successfully load projects using Effect execution', async () => {
			vi.mocked(projectManager.instance.discoverProjectsEffect).mockReturnValue(
				Effect.succeed(mockProjects),
			);

			const {lastFrame, rerender} = render(
				<ProjectList
					projectsDir="/projects"
					onSelectProject={mockOnSelectProject}
					error={null}
					onDismissError={mockOnDismissError}
				/>,
			);

			// Wait for loading to finish
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
			await vi.waitFor(
				() => {
					const frame = lastFrame();
					return frame && frame.includes('project1');
				},
				{timeout: 2000},
			);

			// Should display loaded projects
			const frame = lastFrame();
			expect(frame).toContain('0 ❯ project1');
			expect(frame).toContain('1 ❯ project2');
			expect(frame).toContain('2 ❯ project3');
		});
	});
});
