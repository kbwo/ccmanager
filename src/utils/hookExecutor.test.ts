import {describe, it, expect, vi, beforeEach} from 'vitest';
import {HookExecutor} from './hookExecutor.js';
import {exec} from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
	exec: vi.fn(),
}));

describe('HookExecutor', () => {
	const mockedExec = vi.mocked(exec);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('execute', () => {
		it('should execute command with correct environment', async () => {
			// Arrange
			const command = 'echo "Hello"';
			const cwd = '/test/path';
			const environment = {
				CCMANAGER_WORKTREE_PATH: '/test/worktree',
				CCMANAGER_WORKTREE_BRANCH: 'feature-branch',
				CCMANAGER_GIT_ROOT: '/test/repo',
			};

			mockedExec.mockImplementation((_cmd, _options, callback) => {
				callback?.(null, 'Hello\n', '');
				return {} as any;
			});

			// Act
			await HookExecutor.execute(command, cwd, environment);

			// Assert
			expect(mockedExec).toHaveBeenCalledWith(
				command,
				{
					cwd,
					env: expect.objectContaining(environment),
				},
				expect.any(Function),
			);
		});

		it('should log stdout when present', async () => {
			// Arrange
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			mockedExec.mockImplementation((_cmd, _options, callback) => {
				callback?.(null, 'Hook output', '');
				return {} as any;
			});

			// Act
			await HookExecutor.execute('test', '/path', {
				CCMANAGER_WORKTREE_PATH: '/test',
				CCMANAGER_WORKTREE_BRANCH: 'main',
				CCMANAGER_GIT_ROOT: '/repo',
			});

			// Assert
			expect(consoleSpy).toHaveBeenCalledWith('Hook output: Hook output');
			consoleSpy.mockRestore();
		});

		it('should log stderr when present', async () => {
			// Arrange
			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			mockedExec.mockImplementation((_cmd, _options, callback) => {
				callback?.(null, '', 'Warning message');
				return {} as any;
			});

			// Act
			await HookExecutor.execute('test', '/path', {
				CCMANAGER_WORKTREE_PATH: '/test',
				CCMANAGER_WORKTREE_BRANCH: 'main',
				CCMANAGER_GIT_ROOT: '/repo',
			});

			// Assert
			expect(consoleSpy).toHaveBeenCalledWith('Hook stderr: Warning message');
			consoleSpy.mockRestore();
		});

		it('should reject when command fails', async () => {
			// Arrange
			const error = new Error('Command failed');
			mockedExec.mockImplementation((_cmd, _options, callback) => {
				callback?.(error, '', '');
				return {} as any;
			});

			// Act & Assert
			await expect(
				HookExecutor.execute('test', '/path', {
					CCMANAGER_WORKTREE_PATH: '/test',
					CCMANAGER_WORKTREE_BRANCH: 'main',
					CCMANAGER_GIT_ROOT: '/repo',
				}),
			).rejects.toThrow('Command failed');
		});
	});

	describe('executeWorktreePostCreationHook', () => {
		it('should execute with correct environment variables', async () => {
			// Arrange
			const command = 'notify-send "Worktree created"';
			const worktree = {
				path: '/test/worktree',
				branch: 'feature-xyz',
				isMainWorktree: false,
				hasSession: false,
			};
			const gitRoot = '/test/repo';
			const baseBranch = 'main';

			mockedExec.mockImplementation((_cmd, _options, callback) => {
				callback?.(null, '', '');
				return {} as any;
			});

			// Act
			await HookExecutor.executeWorktreePostCreationHook(
				command,
				worktree,
				gitRoot,
				baseBranch,
			);

			// Assert
			expect(mockedExec).toHaveBeenCalledWith(
				command,
				{
					cwd: worktree.path,
					env: expect.objectContaining({
						CCMANAGER_WORKTREE_PATH: worktree.path,
						CCMANAGER_WORKTREE_BRANCH: worktree.branch,
						CCMANAGER_GIT_ROOT: gitRoot,
						CCMANAGER_BASE_BRANCH: baseBranch,
					}),
				},
				expect.any(Function),
			);
		});

		it('should not include base branch when not provided', async () => {
			// Arrange
			const worktree = {
				path: '/test/worktree',
				branch: 'feature-xyz',
				isMainWorktree: false,
				hasSession: false,
			};

			mockedExec.mockImplementation((_cmd, _options, callback) => {
				callback?.(null, '', '');
				return {} as any;
			});

			// Act
			await HookExecutor.executeWorktreePostCreationHook(
				'echo test',
				worktree,
				'/repo',
			);

			// Assert
			expect(mockedExec).toHaveBeenCalledWith(
				'echo test',
				{
					cwd: worktree.path,
					env: expect.not.objectContaining({
						CCMANAGER_BASE_BRANCH: expect.any(String),
					}),
				},
				expect.any(Function),
			);
		});

		it('should log error but not throw when hook fails', async () => {
			// Arrange
			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			const error = new Error('Hook execution failed');
			mockedExec.mockImplementation((_cmd, _options, callback) => {
				callback?.(error, '', '');
				return {} as any;
			});

			const worktree = {
				path: '/test/worktree',
				branch: 'feature-xyz',
				isMainWorktree: false,
				hasSession: false,
			};

			// Act
			await HookExecutor.executeWorktreePostCreationHook(
				'failing-command',
				worktree,
				'/repo',
			);

			// Assert
			expect(consoleSpy).toHaveBeenCalledWith(
				'Failed to execute post-creation hook: Hook execution failed',
			);
			consoleSpy.mockRestore();
		});
	});
});
