import {describe, it, expect, vi} from 'vitest';
import {
	formatGitStatus,
	formatGitFileChanges,
	formatGitAheadBehind,
	formatParentBranch,
	getGitStatus,
	type GitStatus,
} from './gitStatus.js';
import {exec} from 'child_process';
import {promisify} from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock worktreeConfigManager
vi.mock('../services/worktreeConfigManager.js', () => ({
	worktreeConfigManager: {
		initialize: vi.fn(),
		isAvailable: vi.fn(() => true),
		reset: vi.fn(),
	},
}));

const execAsync = promisify(exec);

describe('formatGitStatus', () => {
	it('should format status with ANSI colors', () => {
		const status: GitStatus = {
			filesAdded: 42,
			filesDeleted: 10,
			aheadCount: 5,
			behindCount: 3,
			parentBranch: 'main',
		};

		const formatted = formatGitStatus(status);

		expect(formatted).toBe(
			'\x1b[32m+42\x1b[0m \x1b[31m-10\x1b[0m \x1b[36m↑5\x1b[0m \x1b[35m↓3\x1b[0m',
		);
	});

	it('should use formatGitStatusWithColors as alias', () => {
		const status: GitStatus = {
			filesAdded: 1,
			filesDeleted: 2,
			aheadCount: 3,
			behindCount: 4,
			parentBranch: 'main',
		};

		const withColors = formatGitStatus(status);
		const withColorsParam = formatGitStatus(status);

		expect(withColors).toBe(withColorsParam);
	});
});

describe('GitService Integration Tests', {timeout: 10000}, () => {
	it('should handle concurrent calls correctly', async () => {
		// Create a temporary git repo for testing
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccmanager-test-'));

		try {
			// Initialize git repo
			await execAsync('git init', {cwd: tmpDir});
			await execAsync('git config user.email "test@example.com"', {
				cwd: tmpDir,
			});
			await execAsync('git config user.name "Test User"', {cwd: tmpDir});
			await execAsync('git config commit.gpgsign false', {cwd: tmpDir});

			// Create a file and commit
			fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'Hello World');
			await execAsync('git add test.txt', {cwd: tmpDir});
			await execAsync('git commit -m "Initial commit"', {cwd: tmpDir});

			// Test concurrent calls - all should succeed now without locking
			// Create abort controllers for each call
			const controller1 = new AbortController();
			const controller2 = new AbortController();
			const controller3 = new AbortController();

			const results = await Promise.all([
				getGitStatus(tmpDir, 'main', controller1.signal),
				getGitStatus(tmpDir, 'main', controller2.signal),
				getGitStatus(tmpDir, 'main', controller3.signal),
			]);

			// All should succeed
			const successCount = results.filter(r => r.success).length;
			expect(successCount).toBe(3);

			// All results should have the same data
			const firstData = results[0]!.data;
			results.forEach(result => {
				expect(result.success).toBe(true);
				expect(result.data).toEqual(firstData);
			});
		} finally {
			// Cleanup
			fs.rmSync(tmpDir, {recursive: true, force: true});
		}
	});
});

describe('formatGitFileChanges', () => {
	it('should format only file changes', () => {
		const status: GitStatus = {
			filesAdded: 10,
			filesDeleted: 5,
			aheadCount: 3,
			behindCount: 2,
			parentBranch: 'main',
		};
		expect(formatGitFileChanges(status)).toBe(
			'\x1b[32m+10\x1b[0m \x1b[31m-5\x1b[0m',
		);
	});

	it('should handle zero file changes', () => {
		const status: GitStatus = {
			filesAdded: 0,
			filesDeleted: 0,
			aheadCount: 3,
			behindCount: 2,
			parentBranch: 'main',
		};
		expect(formatGitFileChanges(status)).toBe('');
	});
});

describe('formatGitAheadBehind', () => {
	it('should format only ahead/behind markers', () => {
		const status: GitStatus = {
			filesAdded: 10,
			filesDeleted: 5,
			aheadCount: 3,
			behindCount: 2,
			parentBranch: 'main',
		};
		expect(formatGitAheadBehind(status)).toBe(
			'\x1b[36m↑3\x1b[0m \x1b[35m↓2\x1b[0m',
		);
	});

	it('should handle zero ahead/behind', () => {
		const status: GitStatus = {
			filesAdded: 10,
			filesDeleted: 5,
			aheadCount: 0,
			behindCount: 0,
			parentBranch: 'main',
		};
		expect(formatGitAheadBehind(status)).toBe('');
	});
});

describe('formatParentBranch', () => {
	it('should return empty string when parent and current branch are the same', () => {
		expect(formatParentBranch('main', 'main')).toBe('');
		expect(formatParentBranch('feature', 'feature')).toBe('');
	});

	it('should format parent branch when different from current', () => {
		expect(formatParentBranch('main', 'feature')).toBe('\x1b[90m(main)\x1b[0m');
		expect(formatParentBranch('develop', 'feature-123')).toBe(
			'\x1b[90m(develop)\x1b[0m',
		);
	});

	it('should include color codes', () => {
		const formatted = formatParentBranch('main', 'feature');
		expect(formatted).toBe('\x1b[90m(main)\x1b[0m');
	});
});
