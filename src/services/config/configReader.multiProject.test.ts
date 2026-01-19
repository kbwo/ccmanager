import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, readFileSync, mkdirSync, writeFileSync} from 'fs';
import {ENV_VARS} from '../../constants/env.js';
import type {
	ConfigurationData,
	ProjectConfigurationData,
} from '../../types/index.js';

// Mock fs module
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	unlinkSync: vi.fn(),
}));

// Mock os module
vi.mock('os', () => ({
	homedir: vi.fn(() => '/home/test'),
}));

describe('ConfigReader in multi-project mode', () => {
	let originalEnv: string | undefined;

	// Global config data
	const globalConfigData: ConfigurationData = {
		shortcuts: {
			returnToMenu: {ctrl: true, key: 'g'},
			cancel: {key: 'escape'},
		},
		commandPresets: {
			presets: [{id: 'global-1', name: 'Global Preset', command: 'claude'}],
			defaultPresetId: 'global-1',
		},
		worktree: {
			autoDirectory: false,
			copySessionData: true,
			sortByLastSession: false,
		},
		autoApproval: {
			enabled: false,
			timeout: 30,
		},
	};

	// Project config data (should be ignored in multi-project mode)
	const projectConfigData: ProjectConfigurationData = {
		shortcuts: {
			returnToMenu: {ctrl: true, key: 'p'},
			cancel: {key: 'q'},
		},
		commandPresets: {
			presets: [
				{id: 'project-1', name: 'Project Preset', command: 'claude-project'},
			],
			defaultPresetId: 'project-1',
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();

		// Save original env
		originalEnv = process.env[ENV_VARS.MULTI_PROJECT_ROOT];

		// Mock file system
		(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				if (path.includes('.ccmanager.json')) {
					return true; // Project config exists
				}
				if (path.includes('config.json')) {
					return true; // Global config exists
				}
				return false;
			},
		);

		(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				if (path.includes('.ccmanager.json')) {
					return JSON.stringify(projectConfigData);
				}
				if (path.includes('config.json')) {
					return JSON.stringify(globalConfigData);
				}
				return '{}';
			},
		);

		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
	});

	afterEach(() => {
		// Restore original env
		if (originalEnv !== undefined) {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = originalEnv;
		} else {
			delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];
		}
		vi.resetAllMocks();
	});

	it('should return global config when CCMANAGER_MULTI_PROJECT_ROOT is set', async () => {
		// Set multi-project mode
		process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/path/to/projects';

		// Dynamic import to pick up the env var
		const {ConfigReader} = await import('./configReader.js');
		const reader = new ConfigReader();
		reader.reload();

		// Verify global config is returned (not project config)
		const shortcuts = reader.getShortcuts();
		expect(shortcuts.returnToMenu).toEqual({ctrl: true, key: 'g'});

		const presets = reader.getCommandPresets();
		expect(presets.presets[0]!.id).toBe('global-1');
		expect(presets.presets[0]!.name).toBe('Global Preset');
	});

	it('should return project config when CCMANAGER_MULTI_PROJECT_ROOT is not set', async () => {
		// Ensure multi-project mode is NOT set
		delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];

		// Dynamic import
		const {ConfigReader} = await import('./configReader.js');
		const reader = new ConfigReader();
		reader.reload();

		// Verify project config takes priority
		const shortcuts = reader.getShortcuts();
		expect(shortcuts.returnToMenu).toEqual({ctrl: true, key: 'p'});

		const presets = reader.getCommandPresets();
		expect(presets.presets[0]!.id).toBe('project-1');
		expect(presets.presets[0]!.name).toBe('Project Preset');
	});

	it('should return global autoApproval config in multi-project mode', async () => {
		// Set multi-project mode
		process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/path/to/projects';

		const {ConfigReader} = await import('./configReader.js');
		const reader = new ConfigReader();
		reader.reload();

		const autoApproval = reader.getAutoApprovalConfig();
		expect(autoApproval.enabled).toBe(false);
		expect(autoApproval.timeout).toBe(30);
	});

	it('should return global worktree config in multi-project mode', async () => {
		// Set multi-project mode
		process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/path/to/projects';

		const {ConfigReader} = await import('./configReader.js');
		const reader = new ConfigReader();
		reader.reload();

		const worktreeConfig = reader.getWorktreeConfig();
		expect(worktreeConfig.autoDirectory).toBe(false);
		expect(worktreeConfig.copySessionData).toBe(true);
	});
});
