import {describe, it, expect, beforeEach, vi} from 'vitest';
import {Effect} from 'effect';
import {WorktreeService} from './worktreeService.js';
import {execSync} from 'child_process';
import {configReader} from './config/configReader.js';

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

// Mock configReader
vi.mock('./config/configReader.js', () => ({
	configReader: {
		getWorktreeLastOpenedTime: vi.fn(),
		setWorktreeLastOpened: vi.fn(),
		getWorktreeLastOpened: vi.fn(() => ({})),
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
const mockedGetWorktreeLastOpenedTime = vi.mocked(
	configReader.getWorktreeLastOpenedTime,
);

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
			mockedGetWorktreeLastOpenedTime.mockImplementation((path: string) => {
				if (path === '/test/repo') return 2000;
				if (path === '/test/repo/feature-a') return 1000;
				if (path === '/test/repo/feature-b') return 3000;
				return undefined;
			});

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
			// Setup mock git output
			const gitOutput = `worktree /test/repo
branch refs/heads/main

worktree /test/repo/feature-a
branch refs/heads/feature-a

worktree /test/repo/feature-b
branch refs/heads/feature-b

worktree /test/repo/feature-c
branch refs/heads/feature-c
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Setup timestamps - only feature-a and feature-b have timestamps
			mockedGetWorktreeLastOpenedTime.mockImplementation((path: string) => {
				if (path === '/test/repo/feature-a') return 1000;
				if (path === '/test/repo/feature-b') return 2000;
				// main and feature-c have no timestamps (undefined)
				return undefined;
			});

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorted order
			expect(result).toHaveLength(4);
			expect(result[0]?.path).toBe('/test/repo/feature-b'); // 2000
			expect(result[1]?.path).toBe('/test/repo/feature-a'); // 1000
			// main and feature-c at the end with timestamp 0 (original order preserved)
			expect(result[2]?.path).toBe('/test/repo'); // 0
			expect(result[3]?.path).toBe('/test/repo/feature-c'); // 0
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
			// Setup mock git output with single worktree
			const gitOutput = `worktree /test/repo
branch refs/heads/main
`;

			mockedExecSync.mockReturnValue(gitOutput);
			mockedGetWorktreeLastOpenedTime.mockReturnValue(1000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify single result
			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe('/test/repo');
		});

		it('should maintain stable sort for worktrees with same timestamp', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo/feature-a
branch refs/heads/feature-a

worktree /test/repo/feature-b
branch refs/heads/feature-b

worktree /test/repo/feature-c
branch refs/heads/feature-c
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// All have the same timestamp
			mockedGetWorktreeLastOpenedTime.mockReturnValue(1000);

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify original order is maintained (stable sort)
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo/feature-a');
			expect(result[1]?.path).toBe('/test/repo/feature-b');
			expect(result[2]?.path).toBe('/test/repo/feature-c');
		});

		it('should sort correctly with mixed timestamps including zero', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo/zero-timestamp
branch refs/heads/zero-timestamp

worktree /test/repo/recent
branch refs/heads/recent

worktree /test/repo/older
branch refs/heads/older
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Setup timestamps including explicit zero
			mockedGetWorktreeLastOpenedTime.mockImplementation((path: string) => {
				if (path === '/test/repo/zero-timestamp') return 0;
				if (path === '/test/repo/recent') return 3000;
				if (path === '/test/repo/older') return 1000;
				return undefined;
			});

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorted order
			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/test/repo/recent'); // 3000
			expect(result[1]?.path).toBe('/test/repo/older'); // 1000
			expect(result[2]?.path).toBe('/test/repo/zero-timestamp'); // 0
		});

		it('should preserve worktree properties after sorting', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo
branch refs/heads/main
bare

worktree /test/repo/feature-a
branch refs/heads/feature-a
`;

			mockedExecSync.mockReturnValue(gitOutput);

			mockedGetWorktreeLastOpenedTime.mockImplementation((path: string) => {
				if (path === '/test/repo') return 1000;
				if (path === '/test/repo/feature-a') return 2000;
				return undefined;
			});

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify properties are preserved
			expect(result).toHaveLength(2);
			expect(result[0]?.path).toBe('/test/repo/feature-a');
			expect(result[0]?.branch).toBe('feature-a');
			expect(result[0]?.isMainWorktree).toBe(false);

			expect(result[1]?.path).toBe('/test/repo');
			expect(result[1]?.branch).toBe('main');
			expect(result[1]?.isMainWorktree).toBe(true);
		});

		it('should handle very large timestamps', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo/old
branch refs/heads/old

worktree /test/repo/new
branch refs/heads/new
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Use actual Date.now() values
			const now = Date.now();
			const yesterday = now - 24 * 60 * 60 * 1000;

			mockedGetWorktreeLastOpenedTime.mockImplementation((path: string) => {
				if (path === '/test/repo/old') return yesterday;
				if (path === '/test/repo/new') return now;
				return undefined;
			});

			// Execute
			const result = await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify sorted order
			expect(result).toHaveLength(2);
			expect(result[0]?.path).toBe('/test/repo/new');
			expect(result[1]?.path).toBe('/test/repo/old');
		});
	});

	describe('getWorktreesEffect error handling with sorting', () => {
		it('should not call getWorktreeLastOpenedTime when sortByLastSession is false', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo
branch refs/heads/main
`;

			mockedExecSync.mockReturnValue(gitOutput);

			// Execute
			await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: false}),
			);

			// Verify getWorktreeLastOpenedTime was not called
			expect(mockedGetWorktreeLastOpenedTime).not.toHaveBeenCalled();
		});

		it('should call getWorktreeLastOpenedTime for each worktree when sorting', async () => {
			// Setup mock git output
			const gitOutput = `worktree /test/repo
branch refs/heads/main

worktree /test/repo/feature-a
branch refs/heads/feature-a

worktree /test/repo/feature-b
branch refs/heads/feature-b
`;

			mockedExecSync.mockReturnValue(gitOutput);
			mockedGetWorktreeLastOpenedTime.mockReturnValue(1000);

			// Execute
			await Effect.runPromise(
				service.getWorktreesEffect({sortByLastSession: true}),
			);

			// Verify getWorktreeLastOpenedTime was called for each worktree
			// Note: May be called multiple times during sort comparisons
			expect(mockedGetWorktreeLastOpenedTime).toHaveBeenCalled();
			expect(mockedGetWorktreeLastOpenedTime).toHaveBeenCalledWith(
				'/test/repo',
			);
			expect(mockedGetWorktreeLastOpenedTime).toHaveBeenCalledWith(
				'/test/repo/feature-a',
			);
			expect(mockedGetWorktreeLastOpenedTime).toHaveBeenCalledWith(
				'/test/repo/feature-b',
			);
		});
	});
});
