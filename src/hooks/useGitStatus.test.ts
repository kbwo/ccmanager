import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import React from 'react';
import {render, cleanup} from 'ink-testing-library';
import {Text} from 'ink';
import {Effect, Exit} from 'effect';
import {useGitStatus} from './useGitStatus.js';
import type {Worktree} from '../types/index.js';
import {getGitStatusLimited, type GitStatus} from '../utils/gitStatus.js';
import {GitError} from '../types/errors.js';

// Mock the gitStatus module
vi.mock('../utils/gitStatus.js', () => ({
	getGitStatusLimited: vi.fn(),
}));

describe('useGitStatus', () => {
	const mockGetGitStatus = getGitStatusLimited as ReturnType<typeof vi.fn>;

	const createWorktree = (path: string): Worktree => ({
		path,
		branch: 'main',
		isMainWorktree: false,
		hasSession: false,
	});

	const createGitStatus = (added = 1, deleted = 0): GitStatus => ({
		filesAdded: added,
		filesDeleted: deleted,
		aheadCount: 0,
		behindCount: 0,
		parentBranch: 'main',
	});

	beforeEach(() => {
		vi.useFakeTimers();
		mockGetGitStatus.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
		cleanup();
	});

	// Main behavioral test
	it('should fetch and update git status for worktrees', async () => {
		const worktrees = [createWorktree('/path1'), createWorktree('/path2')];
		const gitStatus1 = createGitStatus(5, 3);
		const gitStatus2 = createGitStatus(2, 1);
		let hookResult: Worktree[] = [];

		mockGetGitStatus.mockImplementation(path => {
			if (path === '/path1') {
				return Effect.succeed(gitStatus1);
			}
			return Effect.succeed(gitStatus2);
		});

		const TestComponent = () => {
			hookResult = useGitStatus(worktrees, 'main', 100);
			return React.createElement(Text, null, 'test');
		};

		render(React.createElement(TestComponent));

		// Should return worktrees immediately
		expect(hookResult).toEqual(worktrees);

		// Wait for status updates
		await vi.waitFor(() => {
			expect(hookResult[0]?.gitStatus).toBeDefined();
			expect(hookResult[1]?.gitStatus).toBeDefined();
		});

		// Should have correct status for each worktree
		expect(hookResult[0]?.gitStatus).toEqual(gitStatus1);
		expect(hookResult[1]?.gitStatus).toEqual(gitStatus2);
	});

	it('should handle empty worktree array', () => {
		let hookResult: Worktree[] = [];

		const TestComponent = () => {
			hookResult = useGitStatus([], 'main');
			return React.createElement(Text, null, 'test');
		};

		render(React.createElement(TestComponent));

		expect(hookResult).toEqual([]);
		expect(mockGetGitStatus).not.toHaveBeenCalled();
	});

	it('should not fetch when defaultBranch is null', async () => {
		const worktrees = [createWorktree('/path1'), createWorktree('/path2')];
		let hookResult: Worktree[] = [];

		const TestComponent = () => {
			hookResult = useGitStatus(worktrees, null);
			return React.createElement(Text, null, 'test');
		};

		render(React.createElement(TestComponent));

		// Should return worktrees immediately without modification
		expect(hookResult).toEqual(worktrees);

		// Wait to ensure no fetches occur
		await vi.advanceTimersByTimeAsync(1000);
		expect(mockGetGitStatus).not.toHaveBeenCalled();
	});

	it('should continue polling after errors', async () => {
		const worktrees = [createWorktree('/path1')];

		const gitError = new GitError({
			command: 'git status',
			exitCode: 128,
			stderr: 'Git error',
		});

		mockGetGitStatus.mockReturnValue(Effect.fail(gitError));

		const TestComponent = () => {
			useGitStatus(worktrees, 'main', 100);
			return React.createElement(Text, null, 'test');
		};

		render(React.createElement(TestComponent));

		// Wait for initial fetch
		await vi.waitFor(() => {
			expect(mockGetGitStatus).toHaveBeenCalledTimes(1);
		});

		// Clear to track subsequent calls
		mockGetGitStatus.mockClear();

		// Advance time and verify polling continues despite errors
		await vi.advanceTimersByTimeAsync(100);
		expect(mockGetGitStatus).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(100);
		expect(mockGetGitStatus).toHaveBeenCalledTimes(2);

		// All calls should have been made despite continuous errors
		expect(mockGetGitStatus).toHaveBeenCalledWith('/path1');
	});

	it('should handle slow git operations that exceed update interval', async () => {
		const worktrees = [createWorktree('/path1')];
		let fetchCount = 0;
		let resolveEffect: ((exit: Exit.Exit<GitStatus, GitError>) => void) | null =
			null;

		mockGetGitStatus.mockImplementation(() => {
			fetchCount++;
			// Create an Effect that we can resolve manually
			return Effect.async<GitStatus, GitError>(resume => {
				resolveEffect = resume;
			});
		});

		const TestComponent = () => {
			useGitStatus(worktrees, 'main', 100);
			return React.createElement(Text, null, 'test');
		};

		render(React.createElement(TestComponent));

		// Wait for initial fetch to start
		await vi.waitFor(() => {
			expect(mockGetGitStatus).toHaveBeenCalledTimes(1);
		});

		// Advance time past the update interval while fetch is still pending
		await vi.advanceTimersByTimeAsync(250);

		// Should not have started a second fetch yet
		expect(mockGetGitStatus).toHaveBeenCalledTimes(1);

		// Complete the first fetch
		resolveEffect!(Exit.succeed(createGitStatus(1, 0)));

		// Wait for the promise to resolve
		await vi.waitFor(() => {
			expect(fetchCount).toBe(1);
		});

		// Now advance time by the update interval
		await vi.advanceTimersByTimeAsync(100);

		// Should have started the second fetch
		await vi.waitFor(() => {
			expect(mockGetGitStatus).toHaveBeenCalledTimes(2);
		});
	});

	it('should properly cleanup resources when worktrees change', async () => {
		let activeRequests = 0;
		const interruptedPaths: string[] = [];

		mockGetGitStatus.mockImplementation(path => {
			activeRequests++;

			// Create an Effect that never completes but handles interruption
			return Effect.async<GitStatus, GitError>(_resume => {
				return Effect.sync(() => {
					activeRequests--;
					interruptedPaths.push(path);
				});
			});
		});

		const TestComponent: React.FC<{worktrees: Worktree[]}> = ({worktrees}) => {
			useGitStatus(worktrees, 'main', 100);
			return React.createElement(Text, null, 'test');
		};

		// Start with 3 worktrees
		const initialWorktrees = [
			createWorktree('/path1'),
			createWorktree('/path2'),
			createWorktree('/path3'),
		];

		const {rerender} = render(
			React.createElement(TestComponent, {worktrees: initialWorktrees}),
		);

		// Should have 3 active requests
		await vi.waitFor(() => {
			expect(activeRequests).toBe(3);
		});

		// Change to 2 different worktrees
		const newWorktrees = [createWorktree('/path4'), createWorktree('/path5')];
		rerender(React.createElement(TestComponent, {worktrees: newWorktrees}));

		// Wait for cleanup and new requests
		await vi.waitFor(() => {
			expect(interruptedPaths).toHaveLength(3);
			expect(activeRequests).toBe(2);
		});

		// Verify all old paths were interrupted
		expect(interruptedPaths).toContain('/path1');
		expect(interruptedPaths).toContain('/path2');
		expect(interruptedPaths).toContain('/path3');
	});
});
