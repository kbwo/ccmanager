import {describe, it, expect, vi} from 'vitest';
import {
	executeHook,
	executeWorktreePostCreationHook,
	executeStatusHook,
} from './hookExecutor.js';
import {mkdtemp, rm, readFile} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';
import type {SessionState, Session} from '../types/index.js';
import {configurationManager} from '../services/configurationManager.js';
import {WorktreeService} from '../services/worktreeService.js';

// Mock the configurationManager
vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getStatusHooks: vi.fn(),
	},
}));

// Mock the WorktreeService
vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn(),
}));

// Note: This file contains integration tests that execute real commands

describe('hookExecutor Integration Tests', () => {
	describe('executeHook (real execution)', () => {
		it('should execute a simple echo command', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-test-'));
			const environment = {
				CCMANAGER_WORKTREE_PATH: tmpDir,
				CCMANAGER_WORKTREE_BRANCH: 'test-branch',
				CCMANAGER_GIT_ROOT: tmpDir,
			};

			try {
				// Act & Assert - should not throw
				await expect(
					executeHook('echo "Test successful"', tmpDir, environment),
				).resolves.toBeUndefined();
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should reject when command fails', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-test-'));
			const environment = {
				CCMANAGER_WORKTREE_PATH: tmpDir,
				CCMANAGER_WORKTREE_BRANCH: 'test-branch',
				CCMANAGER_GIT_ROOT: tmpDir,
			};

			try {
				// Act & Assert
				await expect(
					executeHook('exit 1', tmpDir, environment),
				).rejects.toThrow();
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should include stderr in error message when command fails', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-test-'));
			const environment = {
				CCMANAGER_WORKTREE_PATH: tmpDir,
				CCMANAGER_WORKTREE_BRANCH: 'test-branch',
				CCMANAGER_GIT_ROOT: tmpDir,
			};

			try {
				// Act & Assert - command that writes to stderr and exits with error
				await expect(
					executeHook(
						'>&2 echo "Error details here"; exit 1',
						tmpDir,
						environment,
					),
				).rejects.toThrow(
					'Hook exited with code 1\nStderr: Error details here\n',
				);
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should verify stderr handling in error messages', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-test-'));
			const environment = {
				CCMANAGER_WORKTREE_PATH: tmpDir,
				CCMANAGER_WORKTREE_BRANCH: 'test-branch',
				CCMANAGER_GIT_ROOT: tmpDir,
			};

			try {
				// Test with multiline stderr
				try {
					await executeHook(
						'>&2 echo "Line 1"; >&2 echo "Line 2"; exit 3',
						tmpDir,
						environment,
					);
					expect.fail('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toContain('Hook exited with code 3');
					expect((error as Error).message).toContain('Stderr: Line 1\nLine 2');
				}

				// Test with empty stderr
				try {
					await executeHook('exit 4', tmpDir, environment);
					expect.fail('Should have thrown');
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toBe('Hook exited with code 4');
				}
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should ignore stderr when command succeeds', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-test-'));
			const environment = {
				CCMANAGER_WORKTREE_PATH: tmpDir,
				CCMANAGER_WORKTREE_BRANCH: 'test-branch',
				CCMANAGER_GIT_ROOT: tmpDir,
			};

			try {
				// Act - command that writes to stderr but exits successfully
				// Should not throw even though there's stderr output
				await expect(
					executeHook(
						'>&2 echo "Warning message"; exit 0',
						tmpDir,
						environment,
					),
				).resolves.toBeUndefined();
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should execute hook in the specified working directory', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-cwd-test-'));
			const outputFile = join(tmpDir, 'cwd.txt');
			const environment = {
				CCMANAGER_WORKTREE_PATH: tmpDir,
				CCMANAGER_WORKTREE_BRANCH: 'test-branch',
				CCMANAGER_GIT_ROOT: '/some/other/path',
			};

			try {
				// Act - write current directory to file
				await executeHook(`pwd > "${outputFile}"`, tmpDir, environment);

				// Read the output
				const {readFile} = await import('fs/promises');
				const output = await readFile(outputFile, 'utf-8');

				// Assert - should be executed in tmpDir
				expect(output.trim()).toBe(tmpDir);
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});
	});

	describe('executeWorktreePostCreationHook (real execution)', () => {
		it('should not throw even when command fails', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-test-'));
			const worktree = {
				path: tmpDir,
				branch: 'test-branch',
				isMainWorktree: false,
				hasSession: false,
			};

			try {
				// Act & Assert - should not throw even with failing command
				await expect(
					executeWorktreePostCreationHook('exit 1', worktree, tmpDir, 'main'),
				).resolves.toBeUndefined();
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should execute worktree hook in the worktree path by default', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-worktree-test-'));
			const outputFile = join(tmpDir, 'cwd.txt');
			const worktree = {
				path: tmpDir,
				branch: 'test-branch',
				isMainWorktree: false,
				hasSession: false,
			};
			const gitRoot = '/different/git/root';

			try {
				// Act - write current directory to file
				await executeWorktreePostCreationHook(
					`pwd > "${outputFile}"`,
					worktree,
					gitRoot,
					'main',
				);

				// Read the output
				const {readFile} = await import('fs/promises');
				const output = await readFile(outputFile, 'utf-8');

				// Assert - should be executed in worktree path, not git root
				expect(output.trim()).toBe(tmpDir);
				expect(output.trim()).not.toBe(gitRoot);
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should allow changing to git root using environment variable', async () => {
			// Arrange
			const tmpWorktreeDir = await mkdtemp(join(tmpdir(), 'hook-worktree-'));
			const tmpGitRootDir = await mkdtemp(join(tmpdir(), 'hook-gitroot-'));
			const outputFile = join(tmpWorktreeDir, 'gitroot.txt');
			const worktree = {
				path: tmpWorktreeDir,
				branch: 'test-branch',
				isMainWorktree: false,
				hasSession: false,
			};

			try {
				// Act - change to git root and write its path
				await executeWorktreePostCreationHook(
					`cd "$CCMANAGER_GIT_ROOT" && pwd > "${outputFile}"`,
					worktree,
					tmpGitRootDir,
					'main',
				);

				// Read the output
				const {readFile} = await import('fs/promises');
				const output = await readFile(outputFile, 'utf-8');

				// Assert - should have changed to git root
				expect(output.trim()).toBe(tmpGitRootDir);
			} finally {
				// Cleanup
				await rm(tmpWorktreeDir, {recursive: true});
				await rm(tmpGitRootDir, {recursive: true});
			}
		});

		it('should wait for all child processes to complete', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'hook-wait-test-'));
			const outputFile = join(tmpDir, 'delayed.txt');
			const worktree = {
				path: tmpDir,
				branch: 'test-branch',
				isMainWorktree: false,
				hasSession: false,
			};

			try {
				// Act - execute a command that spawns a background process with a delay
				// The background process writes to a file after a delay
				// We use a shell command that creates a background process and then exits
				await executeWorktreePostCreationHook(
					`(sleep 0.1 && echo "completed" > "${outputFile}") & wait`,
					worktree,
					tmpDir,
					'main',
				);

				// Read the output - this should exist because we waited for the background process
				const {readFile} = await import('fs/promises');
				const output = await readFile(outputFile, 'utf-8');

				// Assert - the file should contain the expected content
				expect(output.trim()).toBe('completed');
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});
	});

	describe('executeStatusHook', () => {
		it('should wait for hook execution to complete', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'status-hook-test-'));
			const outputFile = join(tmpDir, 'status-hook-output.txt');

			const mockSession = {
				id: 'test-session-123',
				worktreePath: tmpDir, // Use tmpDir as the worktree path
				process: {} as unknown as Session['process'],
				terminal: {} as unknown as Session['terminal'],
				output: [],
				outputHistory: [],
				state: 'idle' as SessionState,
				stateCheckInterval: undefined,
				lastActivity: new Date(),
				isActive: true,
			} satisfies Session;

			// Mock WorktreeService to return a worktree with the tmpDir path
			vi.mocked(WorktreeService).mockImplementation(
				() =>
					({
						getWorktrees: vi.fn(() => [
							{
								path: tmpDir,
								branch: 'test-branch',
								isMainWorktree: false,
								hasSession: true,
							},
						]),
					}) as unknown as InstanceType<typeof WorktreeService>,
			);

			// Configure mock to return a hook that writes to a file with delay
			vi.mocked(configurationManager.getStatusHooks).mockReturnValue({
				busy: {
					enabled: true,
					command: `sleep 0.1 && echo "Hook executed" > "${outputFile}"`,
				},
				idle: {enabled: false, command: ''},
				waiting_input: {enabled: false, command: ''},
			});

			try {
				// Act - execute the hook and await it
				await executeStatusHook('idle', 'busy', mockSession);

				// Assert - file should exist because we awaited the hook
				const content = await readFile(outputFile, 'utf-8');
				expect(content.trim()).toBe('Hook executed');
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should handle hook execution errors gracefully', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'status-hook-test-'));

			const mockSession = {
				id: 'test-session-456',
				worktreePath: tmpDir, // Use tmpDir as the worktree path
				process: {} as unknown as Session['process'],
				terminal: {} as unknown as Session['terminal'],
				output: [],
				outputHistory: [],
				state: 'idle' as SessionState,
				stateCheckInterval: undefined,
				lastActivity: new Date(),
				isActive: true,
			} satisfies Session;

			// Mock WorktreeService to return a worktree with the tmpDir path
			vi.mocked(WorktreeService).mockImplementation(
				() =>
					({
						getWorktrees: vi.fn(() => [
							{
								path: tmpDir,
								branch: 'test-branch',
								isMainWorktree: false,
								hasSession: true,
							},
						]),
					}) as unknown as InstanceType<typeof WorktreeService>,
			);

			// Configure mock to return a hook that fails
			vi.mocked(configurationManager.getStatusHooks).mockReturnValue({
				busy: {
					enabled: true,
					command: 'exit 1',
				},
				idle: {enabled: false, command: ''},
				waiting_input: {enabled: false, command: ''},
			});

			try {
				// Act & Assert - should not throw even when hook fails
				await expect(
					executeStatusHook('idle', 'busy', mockSession),
				).resolves.toBeUndefined();
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});

		it('should not execute disabled hooks', async () => {
			// Arrange
			const tmpDir = await mkdtemp(join(tmpdir(), 'status-hook-test-'));
			const outputFile = join(tmpDir, 'should-not-exist.txt');

			const mockSession = {
				id: 'test-session-789',
				worktreePath: tmpDir, // Use tmpDir as the worktree path
				process: {} as unknown as Session['process'],
				terminal: {} as unknown as Session['terminal'],
				output: [],
				outputHistory: [],
				state: 'idle' as SessionState,
				stateCheckInterval: undefined,
				lastActivity: new Date(),
				isActive: true,
			} satisfies Session;

			// Mock WorktreeService to return a worktree with the tmpDir path
			vi.mocked(WorktreeService).mockImplementation(
				() =>
					({
						getWorktrees: vi.fn(() => [
							{
								path: tmpDir,
								branch: 'test-branch',
								isMainWorktree: false,
								hasSession: true,
							},
						]),
					}) as unknown as InstanceType<typeof WorktreeService>,
			);

			// Configure mock to return a disabled hook
			vi.mocked(configurationManager.getStatusHooks).mockReturnValue({
				busy: {
					enabled: false,
					command: `echo "Should not run" > "${outputFile}"`,
				},
				idle: {enabled: false, command: ''},
				waiting_input: {enabled: false, command: ''},
			});

			try {
				// Act
				await executeStatusHook('idle', 'busy', mockSession);

				// Assert - file should not exist because hook was disabled
				await expect(readFile(outputFile, 'utf-8')).rejects.toThrow();
			} finally {
				// Cleanup
				await rm(tmpDir, {recursive: true});
			}
		});
	});
});
