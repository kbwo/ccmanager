import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {WorktreeService} from './worktreeService.js';
import {configurationManager} from './configurationManager.js';
import {HookExecutor} from '../utils/hookExecutor.js';
import {execSync} from 'child_process';

// Mock modules
vi.mock('child_process', () => ({
	execSync: vi.fn(),
	exec: vi.fn(),
}));

vi.mock('./configurationManager.js', () => ({
	configurationManager: {
		getWorktreeHooks: vi.fn(),
	},
}));

vi.mock('../utils/hookExecutor.js', () => ({
	HookExecutor: {
		executeWorktreePostCreationHook: vi.fn(),
	},
}));

describe('WorktreeService Hook Execution', () => {
	let worktreeService: WorktreeService;
	const mockedExecSync = vi.mocked(execSync);
	const mockedGetWorktreeHooks = vi.mocked(
		configurationManager.getWorktreeHooks,
	);
	const mockedExecuteHook = vi.mocked(
		HookExecutor.executeWorktreePostCreationHook,
	);

	beforeEach(() => {
		vi.clearAllMocks();
		worktreeService = new WorktreeService('/test/repo');

		// Mock git operations
		mockedExecSync.mockImplementation((command: string) => {
			if (command.includes('git rev-parse --git-common-dir')) {
				return '/test/repo/.git';
			}
			if (command.includes('git worktree list')) {
				return 'worktree /test/repo\nHEAD abc123\nbranch refs/heads/main\n';
			}
			if (command.includes('git worktree add')) {
				return '';
			}
			if (command.includes('git rev-parse --verify')) {
				throw new Error('Branch not found');
			}
			return '';
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should execute post-creation hook when worktree is created', async () => {
		// Arrange
		const hookCommand = 'echo "Worktree created: $CCMANAGER_WORKTREE_PATH"';
		mockedGetWorktreeHooks.mockReturnValue({
			post_creation: {
				command: hookCommand,
				enabled: true,
			},
		});

		mockedExecuteHook.mockResolvedValue(undefined);

		// Act
		const result = worktreeService.createWorktree(
			'feature-branch-dir',
			'feature-branch',
			'main',
			false,
			false,
		);

		// Assert
		expect(result.success).toBe(true);
		expect(mockedGetWorktreeHooks).toHaveBeenCalled();
		expect(mockedExecuteHook).toHaveBeenCalledWith(
			hookCommand,
			expect.objectContaining({
				path: '/test/repo/feature-branch-dir',
				branch: 'feature-branch',
				isMainWorktree: false,
				hasSession: false,
			}),
			'/test/repo',
			'main',
		);
	});

	it('should not execute hook when disabled', () => {
		// Arrange
		mockedGetWorktreeHooks.mockReturnValue({
			post_creation: {
				command: 'echo "Should not run"',
				enabled: false,
			},
		});

		// Act
		const result = worktreeService.createWorktree(
			'feature-branch-dir',
			'feature-branch',
			'main',
			false,
			false,
		);

		// Assert
		expect(result.success).toBe(true);
		expect(mockedGetWorktreeHooks).toHaveBeenCalled();
		expect(mockedExecuteHook).not.toHaveBeenCalled();
	});

	it('should not execute hook when not configured', () => {
		// Arrange
		mockedGetWorktreeHooks.mockReturnValue({});

		// Act
		const result = worktreeService.createWorktree(
			'feature-branch-dir',
			'feature-branch',
			'main',
			false,
			false,
		);

		// Assert
		expect(result.success).toBe(true);
		expect(mockedGetWorktreeHooks).toHaveBeenCalled();
		expect(mockedExecuteHook).not.toHaveBeenCalled();
	});

	it('should not fail worktree creation if hook execution fails', async () => {
		// Arrange
		mockedGetWorktreeHooks.mockReturnValue({
			post_creation: {
				command: 'failing-command',
				enabled: true,
			},
		});

		mockedExecuteHook.mockRejectedValue(new Error('Hook failed'));

		// Act
		const result = worktreeService.createWorktree(
			'feature-branch-dir',
			'feature-branch',
			'main',
			false,
			false,
		);

		// Allow async operations to complete
		await new Promise(resolve => setTimeout(resolve, 10));

		// Assert
		expect(result.success).toBe(true);
		expect(mockedExecuteHook).toHaveBeenCalled();
	});
});
