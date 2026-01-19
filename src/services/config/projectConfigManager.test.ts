import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {execSync} from 'child_process';
import type {ProjectConfigurationData} from '../../types/index.js';

// Mock fs module
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	unlinkSync: vi.fn(),
}));

// Mock child_process module
vi.mock('child_process', () => ({
	execSync: vi.fn(),
}));

describe('ProjectConfigManager - git repository root', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should read config from git repository root, not cwd', async () => {
		const cwd = '/path/to/repo/subdir';
		const gitRoot = '/path/to/repo';
		const projectConfig: ProjectConfigurationData = {
			shortcuts: {
				returnToMenu: {ctrl: true, key: 'r'},
				cancel: {key: 'escape'},
			},
		};

		// Mock git rev-parse to return the .git directory
		(execSync as ReturnType<typeof vi.fn>).mockReturnValue(`${gitRoot}/.git\n`);

		// Mock existsSync to return true for the git root config path
		(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				// Config exists at git root, not at cwd
				return path === `${gitRoot}/.ccmanager.json`;
			},
		);

		// Mock readFileSync to return project config
		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
			JSON.stringify(projectConfig),
		);

		// Dynamic import to pick up mocks
		const {ProjectConfigManager} = await import('./projectConfigManager.js');
		const manager = new ProjectConfigManager(cwd);

		// Verify config was read from git root
		const shortcuts = manager.getShortcuts();
		expect(shortcuts).toEqual(projectConfig.shortcuts);

		// Verify readFileSync was called with git root path
		expect(readFileSync).toHaveBeenCalledWith(
			`${gitRoot}/.ccmanager.json`,
			'utf-8',
		);
	});

	it('should write config to git repository root, not cwd', async () => {
		const cwd = '/path/to/repo/deep/nested/dir';
		const gitRoot = '/path/to/repo';

		// Mock git rev-parse
		(execSync as ReturnType<typeof vi.fn>).mockReturnValue(`${gitRoot}/.git\n`);

		// No existing config
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});

		const {ProjectConfigManager} = await import('./projectConfigManager.js');
		const manager = new ProjectConfigManager(cwd);

		// Set shortcuts to trigger a write
		manager.setShortcuts({
			returnToMenu: {ctrl: true, key: 'x'},
			cancel: {key: 'q'},
		});

		// Verify writeFileSync was called with git root path
		expect(writeFileSync).toHaveBeenCalledWith(
			`${gitRoot}/.ccmanager.json`,
			expect.any(String),
		);
	});

	it('should handle worktree paths correctly', async () => {
		const cwd = '/path/to/worktree';
		const mainRepoRoot = '/path/to/main-repo';
		const projectConfig: ProjectConfigurationData = {
			worktree: {
				autoDirectory: true,
			},
		};

		// Mock git rev-parse to return worktree .git path
		(execSync as ReturnType<typeof vi.fn>).mockReturnValue(
			`${mainRepoRoot}/.git/worktrees/my-worktree\n`,
		);

		(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				return path === `${mainRepoRoot}/.ccmanager.json`;
			},
		);

		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
			JSON.stringify(projectConfig),
		);

		const {ProjectConfigManager} = await import('./projectConfigManager.js');
		const manager = new ProjectConfigManager(cwd);

		// Verify config was read from main repo root
		const worktreeConfig = manager.getWorktreeConfig();
		expect(worktreeConfig).toEqual(projectConfig.worktree);

		expect(readFileSync).toHaveBeenCalledWith(
			`${mainRepoRoot}/.ccmanager.json`,
			'utf-8',
		);
	});

	it('should return undefined when not in a git repository', async () => {
		const cwd = '/not/a/git/repo';

		// Mock git rev-parse to throw (not a git repo)
		(execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
			throw new Error('fatal: not a git repository');
		});

		const {ProjectConfigManager} = await import('./projectConfigManager.js');
		const manager = new ProjectConfigManager(cwd);

		// Should return undefined for all getters
		expect(manager.getShortcuts()).toBeUndefined();
		expect(manager.getWorktreeConfig()).toBeUndefined();
		expect(manager.getCommandPresets()).toBeUndefined();

		// Should not attempt to read any file
		expect(readFileSync).not.toHaveBeenCalled();
	});
});
