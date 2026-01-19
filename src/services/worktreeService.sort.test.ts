import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {Effect} from 'effect';
import {WorktreeService, setWorktreeLastOpened} from './worktreeService.js';
import {execSync} from 'child_process';

// We need to keep a reference to the original Map to clear it between tests
// Module-level state needs to be reset for isolated tests

// Mock child_process module
vi.mock('child_process');

// Mock fs module
vi.mock('fs');

// Mock worktreeConfigManager
vi.mock('./worktreeConfigManager.js', () => ({
	worktreeConfigManager: {
		initialize: vi.fn(),
		isAvailable: vi.fn(() => true),
		reset: vi.fn(),
	},
}));

// Mock configReader (still needed for getWorktreeHooks in createWorktreeEffect)
vi.mock('./config/configReader.js', () => ({
	configReader: {
		getWorktreeConfig: vi.fn(() => ({
			autoDirectory: false,
			copySessionData: true,
			sortByLastSession: false,
		})),
		getWorktreeHooks: vi.fn(() => ({})),
	},
}));

// Mock HookExecutor
vi.mock('../utils/hookExecutor.js', () => ({
	executeWorktreePostCreationHook: vi.fn(),
}));

// Get the mocked functions with proper typing
const mockedExecSync = vi.mocked(execSync);

// Helper to clear worktree last opened state by setting all known paths to undefined time
// Since we can't clear the Map directly, we'll set timestamps to 0 for cleanup
const clearWorktreeTimestamps = () => {
	// This is a workaround since we can't access the internal Map
	// Tests should use unique paths or set their own timestamps
};

describe('WorktreeService - Sorting', () => {
	let service: WorktreeService;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock git rev-parse --git-common-dir to return a predictable path
		mockedExecSync.mockImplementation((cmd, _options) => {
			if (typeof cmd === 'string' && cmd === 'git rev-parse --git-common-dir') {
				return '/test/repo/.git\n';
			}
			throw new Error('Command not mocked: ' + cmd);
		});

		// Create service instance
		service = new WorktreeService('/test/repo');
	});

	afterEach(() => {
		clearWorktreeTimestamps();
	});

	describe('getWorktreesEffect with sortByLastSession', () => {
		it('should not sort worktrees when sortByLastSession is false', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo
branch refs/heads/main

worktree /test/repo/feature-a
branch refs/heads/feature-a

worktree /test/repo/feature-b
branch refs/heads/feature-b
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: false}),
			);

			// Verify order is unchanged (as returned by git)
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo');
			expect(result[1]?.path).toBe('/test/repo/feature-a');
			expect(result[2]?.path).toBe('/test/repo/feature-b');
		});

		it('should not sort worktrees when sortByLastSession is undefined', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo
branch refs/heads/main

worktree /test/repo/feature-a
branch refs/heads/feature-a

worktree /test/repo/feature-b
branch refs/heads/feature-b
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Execute without options
			const result = await Effect.runPromise(service.getWorktreesEffect());

			// Verify order is unchanged (as returned by git)
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo');
			expect(result[1]?.path).toBe('/test/repo/feature-a');
			expect(result[2]?.path).toBe('/test/repo/feature-b');
		});

		it('should sort worktrees by last opened timestamp in descending order', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo
branch refs/heads/main

worktree /test/repo/feature-a
branch refs/heads/feature-a

worktree /test/repo/feature-b
branch refs/heads/feature-b
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Setup timestamps - feature-b was opened most recently, then main, then feature-a
			setWorktreeLastOpened('/test/repo', 2000);
			setWorktreeLastOpened('/test/repo/feature-a', 1000);
			setWorktreeLastOpened('/test/repo/feature-b', 3000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorted order (most recent first)
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo/feature-b'); // 3000
			expect(result[1]?.path).toBe('/test/repo'); // 2000
			expect(result[2]?.path).toBe('/test/repo/feature-a'); // 1000
		});

		it('should place worktrees without timestamps at the end', async () => {
			// Setup mock git output - use unique paths to avoid state pollution
			const gitOutput = `worktree /test/repo-no-ts/main
branch refs/heads/main

worktree /test/repo-no-ts/feature-a
branch refs/heads/feature-a

worktree /test/repo-no-ts/feature-b
branch refs/heads/feature-b

worktree /test/repo-no-ts/feature-c
branch refs/heads/feature-c
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Setup timestamps - only feature-a and feature-b have timestamps
			// main and feature-c have no timestamps set
			setWorktreeLastOpened('/test/repo-no-ts/feature-a', 1000);
			setWorktreeLastOpened('/test/repo-no-ts/feature-b', 2000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorted order
			expect(result).toHaveLength(4);
			expect(result[0]?.path).toBe('/test/repo-no-ts/feature-b'); // 2000
			expect(result[1]?.path).toBe('/test/repo-no-ts/feature-a'); // 1000
			// main and feature-c at the end with timestamp 0 (original order preserved)
			expect(result[2]?.path).toBe('/test/repo-no-ts/main'); // undefined -> 0
			expect(result[3]?.path).toBe('/test/repo-no-ts/feature-c'); // undefined -> 0
		});

		it('should handle empty worktree list', async () => {
			// Setup empty git output
			mockedExecSync.mockReturnValue('');

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify empty result
			expect(result).toHaveLength(0);
		});

		it('should handle single worktree', async () => {
			// Setup mock git output with single worktree - unique path
			const gitOutput = `worktree /test/repo-single
branch refs/heads/main
`;

			mockedExecSync.mockReturnValue(gitOutput);
			setWorktreeLastOpened('/test/repo-single', 1000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify single result
			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe('/test/repo-single');
		});

		it('should maintain stable sort for worktrees with same timestamp', async () => {
			// Setup mock git output - unique paths
			const gitOutput = `worktree /test/repo-stable/feature-a
branch refs/heads/feature-a

worktree /test/repo-stable/feature-b
branch refs/heads/feature-b

worktree /test/repo-stable/feature-c
branch refs/heads/feature-c
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// All have the same timestamp
			setWorktreeLastOpened('/test/repo-stable/feature-a', 1000);
			setWorktreeLastOpened('/test/repo-stable/feature-b', 1000);
			setWorktreeLastOpened('/test/repo-stable/feature-c', 1000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify original order is maintained (stable sort)
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo-stable/feature-a');
			expect(result[1]?.path).toBe('/test/repo-stable/feature-b');
			expect(result[2]?.path).toBe('/test/repo-stable/feature-c');
		});

		it('should sort correctly with mixed timestamps including zero', async () => {
			// Setup mock git output - unique paths
			const gitOutput = `worktree /test/repo-zero/zero-timestamp
branch refs/heads/zero-timestamp

worktree /test/repo-zero/recent
branch refs/heads/recent

worktree /test/repo-zero/older
branch refs/heads/older
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Setup timestamps including explicit zero
			setWorktreeLastOpened('/test/repo-zero/zero-timestamp', 0);
			setWorktreeLastOpened('/test/repo-zero/recent', 3000);
			setWorktreeLastOpened('/test/repo-zero/older', 1000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorted order
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo-zero/recent'); // 3000
			expect(result[1]?.path).toBe('/test/repo-zero/older'); // 1000
			expect(result[2]?.path).toBe('/test/repo-zero/zero-timestamp'); // 0
		});

		it('should preserve worktree properties after sorting', async () => {
			// Setup mock git output - unique paths
			const gitOutput = `worktree /test/repo-props
branch refs/heads/main
bare

worktree /test/repo-props/feature-a
branch refs/heads/feature-a
`;

			mockedExecSync.mockReturnValue(gitOutput);

			setWorktreeLastOpened('/test/repo-props', 1000);
			setWorktreeLastOpened('/test/repo-props/feature-a', 2000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify properties are preserved
			expect(result).toHaveLength(2);
			expect(result[0]?.path).toBe('/test/repo-props/feature-a');
			expect(result[0]?.branch).toBe('feature-a');
			expect(result[0]?.isMainWorktree).toBe(false);

			expect(result[1]?.path).toBe('/test/repo-props');
			expect(result[1]?.branch).toBe('main');
			expect(result[1]?.isMainWorktree).toBe(true);
		});

		it('should handle very large timestamps', async () => {
			// Setup mock git output - unique paths
			const gitOutput = `worktree /test/repo-large/old
branch refs/heads/old

worktree /test/repo-large/new
branch refs/heads/new
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Use actual Date.now() values
			const now = Date.now();
			const yesterday = now - 24 * 60 * 60 * 1000;

			setWorktreeLastOpened('/test/repo-large/old', yesterday);
			setWorktreeLastOpened('/test/repo-large/new', now);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorted order
			expect(result).toHaveLength(2);
			expect(result[0]?.path).toBe('/test/repo-large/new');
			expect(result[1]?.path).toBe('/test/repo-large/old');
		});
	});

	describe('getWorktreesEffect error handling with sorting', () => {
		it('should sort correctly when sortByLastSession is true', async () => {
			// Setup mock git output - unique paths
			const gitOutput = `worktree /test/repo-sort
branch refs/heads/main

worktree /test/repo-sort/feature-a
branch refs/heads/feature-a

worktree /test/repo-sort/feature-b
branch refs/heads/feature-b
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Set timestamps to verify sorting works
			setWorktreeLastOpened('/test/repo-sort', 1000);
			setWorktreeLastOpened('/test/repo-sort/feature-a', 3000);
			setWorktreeLastOpened('/test/repo-sort/feature-b', 2000);

			// Execute with sorting
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorting happened correctly (implicitly means getWorktreeLastOpenedTime was called)
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo-sort/feature-a'); // 3000
			expect(result[1]?.path).toBe('/test/repo-sort/feature-b'); // 2000
			expect(result[2]?.path).toBe('/test/repo-sort'); // 1000
		});

		it('should not sort when sortByLastSession is false', async () => {
			// Setup mock git output - unique paths
			const gitOutput = `worktree /test/repo-nosort
branch refs/heads/main

worktree /test/repo-nosort/feature-a
branch refs/heads/feature-a

worktree /test/repo-nosort/feature-b
branch refs/heads/feature-b
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Set timestamps that would cause reordering if sorting was applied
			setWorktreeLastOpened('/test/repo-nosort', 1000);
			setWorktreeLastOpened('/test/repo-nosort/feature-a', 3000);
			setWorktreeLastOpened('/test/repo-nosort/feature-b', 2000);

			// Execute without sorting
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: false}),
			);

			// Verify original order is preserved
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo-nosort');
			expect(result[1]?.path).toBe('/test/repo-nosort/feature-a');
			expect(result[2]?.path).toBe('/test/repo-nosort/feature-b');
		});
	});
});
