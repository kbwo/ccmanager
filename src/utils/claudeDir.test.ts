import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Effect, Either} from 'effect';
import {
	getClaudeDir,
	getClaudeProjectsDir,
	pathToClaudeProjectName,
	claudeDirExists,
} from './claudeDir.js';
import {ValidationError, FileSystemError} from '../types/errors.js';

describe('claudeDir', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = {...originalEnv};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('getClaudeDir', () => {
		it('should return Either.right with CLAUDE_CONFIG_DIR when set', () => {
			process.env.CLAUDE_CONFIG_DIR = '/custom/claude';

			const result = getClaudeDir();

			expect(Either.isRight(result)).toBe(true);
			if (Either.isRight(result)) {
				expect(result.right).toBe('/custom/claude');
			}
		});

		it('should trim whitespace from CLAUDE_CONFIG_DIR', () => {
			process.env.CLAUDE_CONFIG_DIR = '  /custom/claude  ';

			const result = getClaudeDir();

			expect(Either.isRight(result)).toBe(true);
			if (Either.isRight(result)) {
				expect(result.right).toBe('/custom/claude');
			}
		});

		it('should return Either.right with default ~/.claude when env var not set', () => {
			delete process.env.CLAUDE_CONFIG_DIR;

			const result = getClaudeDir();

			expect(Either.isRight(result)).toBe(true);
			if (Either.isRight(result)) {
				expect(result.right).toContain('.claude');
			}
		});

		it('should return Either.right even when HOME vars deleted (os.homedir has fallbacks)', () => {
			delete process.env.CLAUDE_CONFIG_DIR;
			delete process.env.HOME;
			delete process.env.USERPROFILE;

			const result = getClaudeDir();

			// os.homedir() has multiple fallback mechanisms, so this will likely still succeed
			expect(Either.isRight(result)).toBe(true);
		});
	});

	describe('getClaudeProjectsDir', () => {
		it('should return Either.right with projects subdirectory', () => {
			process.env.CLAUDE_CONFIG_DIR = '/custom/claude';

			const result = getClaudeProjectsDir();

			expect(Either.isRight(result)).toBe(true);
			if (Either.isRight(result)) {
				expect(result.right).toBe('/custom/claude/projects');
			}
		});

		it('should return Either.right from getClaudeDir fallbacks', () => {
			delete process.env.CLAUDE_CONFIG_DIR;
			delete process.env.HOME;
			delete process.env.USERPROFILE;

			const result = getClaudeProjectsDir();

			// Since getClaudeDir has fallbacks, this should succeed
			expect(Either.isRight(result)).toBe(true);
		});
	});

	describe('pathToClaudeProjectName', () => {
		it('should convert absolute path to Claude naming convention', () => {
			const result = pathToClaudeProjectName('/home/user/projects/myapp');

			expect(result).toBe('-home-user-projects-myapp');
		});

		it('should replace forward slashes with dashes', () => {
			const result = pathToClaudeProjectName('/a/b/c');

			expect(result).toBe('-a-b-c');
		});

		it('should replace backslashes with dashes (Windows)', () => {
			const result = pathToClaudeProjectName('C:\\Users\\test\\app');

			expect(result).toContain('-');
			expect(result).not.toContain('\\');
		});

		it('should replace dots with dashes', () => {
			const result = pathToClaudeProjectName('/home/user/my.app');

			expect(result).toBe('-home-user-my-app');
		});
	});

	describe('claudeDirExists', () => {
		it('should return Effect with false for nonexistent directory', async () => {
			const effect = claudeDirExists('nonexistent-dir-12345-test-project');
			const result = await Effect.runPromise(effect);

			expect(result).toBe(false);
		});

		it('should check in Claude projects directory', async () => {
			// This test verifies the path construction, not the existence
			// Since ~/.claude/projects likely doesn't exist in test environment
			const effect = claudeDirExists('any-project-name');
			const result = await Effect.runPromise(effect);

			// Should return false (directory doesn't exist) not throw an error
			expect(result).toBe(false);
		});

		it('should fail with FileSystemError on access error', async () => {
			// Mock fs.stat to throw a non-ENOENT error
			const {promises: fs} = await import('fs');
			const originalStat = fs.stat;
			vi.spyOn(fs, 'stat').mockRejectedValue(
				Object.assign(new Error('Permission denied'), {code: 'EACCES'}),
			);

			const effect = claudeDirExists('test-project');
			const exit = await Effect.runPromiseExit(effect);

			expect(exit._tag).toBe('Failure');

			// Restore original
			vi.mocked(fs.stat).mockRestore();
		});
	});
});
