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
	});
});
