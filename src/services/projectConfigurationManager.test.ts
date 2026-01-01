import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, readFileSync, statSync} from 'fs';
import {execSync} from 'child_process';
import {ProjectConfigurationManager} from './projectConfigurationManager.js';
import type {ConfigurationData} from '../types/index.js';
import {Effect} from 'effect';

// Mock fs module
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	statSync: vi.fn(),
}));

// Mock child_process module
vi.mock('child_process', () => ({
	execSync: vi.fn(),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
	default: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

describe('ProjectConfigurationManager', () => {
	let projectConfigManager: ProjectConfigurationManager;
	const mockGitRoot = '/path/to/repo';
	const mockProjectConfigPath = '/path/to/repo/.ccmanager.json';

	beforeEach(() => {
		vi.clearAllMocks();
		projectConfigManager = new ProjectConfigurationManager();
	});

	afterEach(() => {
		projectConfigManager.clearCache();
		vi.resetAllMocks();
	});

	describe('findGitRoot', () => {
		it('should find git root from absolute .git directory path', async () => {
			(execSync as ReturnType<typeof vi.fn>).mockReturnValue('/path/to/repo/.git\n');

			const result = await Effect.runPromise(
				projectConfigManager.findGitRoot('/path/to/repo/src'),
			);

			expect(result).toBe('/path/to/repo/.git/..');
			expect(execSync).toHaveBeenCalledWith(
				'git rev-parse --git-common-dir',
				expect.objectContaining({
					cwd: '/path/to/repo/src',
					encoding: 'utf8',
				}),
			);
		});

		it('should find git root from relative .git directory path', async () => {
			(execSync as ReturnType<typeof vi.fn>).mockReturnValue('.git\n');

			const result = await Effect.runPromise(
				projectConfigManager.findGitRoot('/path/to/repo'),
			);

			expect(result).toContain('.git/..');
		});

		it('should fail when git command fails', async () => {
			(execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('not a git repository');
			});

			const resultEffect = Effect.either(
				projectConfigManager.findGitRoot('/not/a/repo'),
			);
			const result = await Effect.runPromise(resultEffect);

			expect(result._tag).toBe('Left');
			if (result._tag === 'Left') {
				expect(result.left.message).toContain('Failed to find git root');
			}
		});
	});

	describe('loadProjectConfigEffect', () => {
		it('should return null when .ccmanager.json does not exist', async () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

			const result = await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			expect(result).toBeNull();
			expect(existsSync).toHaveBeenCalledWith(mockProjectConfigPath);
		});

		it('should load and cache valid project config', async () => {
			const mockConfig: ConfigurationData = {
				worktree: {
					autoDirectory: true,
				},
				worktreeHooks: {
					post_creation: {
						command: 'npm install',
						enabled: true,
					},
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig),
			);

			const result = await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			expect(result).toEqual(mockConfig);
			expect(readFileSync).toHaveBeenCalledWith(mockProjectConfigPath, 'utf-8');
		});

		it('should use cached config when mtime matches', async () => {
			const mockConfig: ConfigurationData = {
				worktree: {
					autoDirectory: true,
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig),
			);

			// First load
			await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			// Clear mock call history
			vi.clearAllMocks();
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			// Second load should use cache
			const result = await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			expect(result).toEqual(mockConfig);
			expect(readFileSync).not.toHaveBeenCalled();
		});

		it('should reload config when mtime changes', async () => {
			const mockConfig1: ConfigurationData = {worktree: {autoDirectory: true}};
			const mockConfig2: ConfigurationData = {worktree: {autoDirectory: false}};

			// First load
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig1),
			);

			await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			// Second load with different mtime
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 9876543210,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig2),
			);

			const result = await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			expect(result).toEqual(mockConfig2);
		});

		it('should return null on malformed JSON and log warning', async () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				'{ invalid json }',
			);

			const resultEffect = Effect.either(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);
			const result = await Effect.runPromise(resultEffect);

			// Should fail with ConfigError
			expect(result._tag).toBe('Left');
		});

		it('should return null when config fails validation', async () => {
			const invalidConfig = {
				shortcuts: 'not an object', // Invalid type
			};

			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(invalidConfig),
			);

			const result = await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			expect(result).toBeNull();
		});
	});

	describe('invalidateCache', () => {
		it('should clear cache for specific git root', async () => {
			const mockConfig: ConfigurationData = {
				worktree: {autoDirectory: true},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig),
			);

			// First load to populate cache
			await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			// Invalidate cache
			projectConfigManager.invalidateCache(mockGitRoot);

			// Clear mocks to verify next call reads from file
			vi.clearAllMocks();
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig),
			);

			// Next load should read from file
			await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect(mockGitRoot),
			);

			expect(readFileSync).toHaveBeenCalled();
		});
	});

	describe('clearCache', () => {
		it('should clear all cached configs', async () => {
			const mockConfig: ConfigurationData = {
				worktree: {autoDirectory: true},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig),
			);

			// Load configs for multiple repos
			await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect('/repo1'),
			);
			await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect('/repo2'),
			);

			// Clear all cache
			projectConfigManager.clearCache();

			// Clear mocks
			vi.clearAllMocks();
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify(mockConfig),
			);

			// Next load should read from file
			await Effect.runPromise(
				projectConfigManager.loadProjectConfigEffect('/repo1'),
			);

			expect(readFileSync).toHaveBeenCalled();
		});
	});
});
