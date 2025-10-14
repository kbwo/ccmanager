import {describe, it, expect, vi, beforeEach} from 'vitest';
import {isWorktreeConfigEnabled} from './worktreeConfig.js';
import * as cp from 'child_process';

vi.mock('child_process');
vi.mock('../services/worktreeConfigManager.js', () => ({
	worktreeConfigManager: {
		isAvailable: vi.fn(() => true),
	},
}));

describe('worktreeConfig', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('isWorktreeConfigEnabled', () => {
		it('should return true when worktree config is enabled', () => {
			vi.mocked(cp.execSync).mockReturnValue('true\n');

			const result = isWorktreeConfigEnabled('/test/path');

			expect(result).toBe(true);
			expect(cp.execSync).toHaveBeenCalledWith(
				'git config extensions.worktreeConfig',
				{
					cwd: '/test/path',
					encoding: 'utf8',
				},
			);
		});

		it('should return false when worktree config is disabled', () => {
			vi.mocked(cp.execSync).mockReturnValue('false\n');

			const result = isWorktreeConfigEnabled('/test/path');

			expect(result).toBe(false);
		});

		it('should return false when git config command fails', () => {
			vi.mocked(cp.execSync).mockImplementation(() => {
				throw new Error('Command failed');
			});

			const result = isWorktreeConfigEnabled('/test/path');

			expect(result).toBe(false);
		});
	});

	// Note: getWorktreeParentBranch and setWorktreeParentBranch are tested
	// in integration tests since they use Effect.tryPromise with real execFile
});
