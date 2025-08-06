import {describe, it, expect} from 'vitest';
import {executeHook, executeWorktreePostCreationHook} from './hookExecutor.js';
import {mkdtemp, rm} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';

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
	});
});
