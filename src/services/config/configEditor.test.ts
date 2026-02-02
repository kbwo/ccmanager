import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {ConfigEditor} from './configEditor.js';
import {
	addPreset,
	deletePreset,
	setDefaultPreset,
	getDefaultPreset,
} from './testUtils.js';
import type {
	CommandPresetsConfig,
	ConfigurationData,
} from '../../types/index.js';

// Mock fs module
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

// Mock os module
vi.mock('os', () => ({
	homedir: vi.fn(() => '/home/test'),
}));

describe('ConfigEditor (global scope) - Command Presets', () => {
	let configEditor: ConfigEditor;
	let mockConfigData: ConfigurationData;
	let savedConfigData: string | null = null;

	// Helper to reset saved config when modifying mockConfigData
	const resetSavedConfig = () => {
		savedConfigData = null;
	};

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();
		savedConfigData = null;

		// Default mock config data
		mockConfigData = {
			shortcuts: {
				returnToMenu: {ctrl: true, key: 'e'},
				cancel: {key: 'escape'},
			},
		};

		// Mock file system operations
		(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				return path.includes('config.json');
			},
		);

		(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
			// Return saved data if available, otherwise return initial mock data
			return savedConfigData ?? JSON.stringify(mockConfigData);
		});

		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(
			(_path: string, data: string) => {
				// Track written data so subsequent reads return it
				savedConfigData = data;
			},
		);

		// Create new instance for each test and reload to pick up mocked fs
		configEditor = new ConfigEditor('global');
		configEditor.reload();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('getCommandPresets', () => {
		it('should return default presets when no presets are configured', () => {
			resetSavedConfig();
			configEditor.reload();

			const presets = configEditor.getCommandPresets()!;

			expect(presets).toBeDefined();
			expect(presets.presets).toHaveLength(1);
			expect(presets.presets[0]).toEqual({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			expect(presets.defaultPresetId).toBe('1');
		});

		it('should return configured presets', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Development', command: 'claude', args: ['--resume']},
				],
				defaultPresetId: '2',
			};

			resetSavedConfig();
			configEditor.reload();
			const presets = configEditor.getCommandPresets()!;

			expect(presets.presets).toHaveLength(2);
			expect(presets.defaultPresetId).toBe('2');
		});
	});

	describe('setCommandPresets', () => {
		it('should save new presets configuration', () => {
			const newPresets: CommandPresetsConfig = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '2',
			};

			configEditor.setCommandPresets(newPresets);

			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining('config.json'),
				expect.stringContaining('commandPresets'),
			);
		});
	});

	describe('getDefaultPreset', () => {
		it('should return the default preset', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '2',
			};

			resetSavedConfig();
			configEditor.reload();
			const defaultPreset = getDefaultPreset(configEditor);

			expect(defaultPreset).toEqual({
				id: '2',
				name: 'Custom',
				command: 'claude',
				args: ['--custom'],
			});
		});

		it('should return first preset if defaultPresetId is invalid', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: 'invalid',
			};

			resetSavedConfig();
			configEditor.reload();
			const defaultPreset = getDefaultPreset(configEditor);

			expect(defaultPreset).toEqual({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
		});
	});

	describe('addPreset', () => {
		it('should add a new preset', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			resetSavedConfig();
			configEditor.reload();
			const newPreset = {
				id: '2',
				name: 'New Preset',
				command: 'claude',
				args: ['--new'],
			};

			addPreset(configEditor, newPreset);

			const presets = configEditor.getCommandPresets()!;
			expect(presets.presets).toHaveLength(2);
			expect(presets.presets[1]).toEqual(newPreset);
		});

		it('should replace preset with same id', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			resetSavedConfig();
			configEditor.reload();
			const updatedPreset = {
				id: '1',
				name: 'Updated Default',
				command: 'claude',
				args: ['--updated'],
			};

			addPreset(configEditor, updatedPreset);

			const presets = configEditor.getCommandPresets()!;
			expect(presets.presets).toHaveLength(1);
			expect(presets.presets[0]).toEqual(updatedPreset);
		});
	});

	describe('deletePreset', () => {
		it('should delete preset by id', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '1',
			};

			resetSavedConfig();
			configEditor.reload();
			deletePreset(configEditor, '2');

			const presets = configEditor.getCommandPresets()!;
			expect(presets.presets).toHaveLength(1);
			expect(presets.presets[0]!.id).toBe('1');
		});

		it('should not delete the last preset', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			resetSavedConfig();
			configEditor.reload();
			deletePreset(configEditor, '1');

			const presets = configEditor.getCommandPresets()!;
			expect(presets.presets).toHaveLength(1);
		});

		it('should update defaultPresetId if default preset is deleted', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '2',
			};

			resetSavedConfig();
			configEditor.reload();
			deletePreset(configEditor, '2');

			const presets = configEditor.getCommandPresets()!;
			expect(presets.defaultPresetId).toBe('1');
		});
	});

	describe('setDefaultPreset', () => {
		it('should update default preset id', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '1',
			};

			resetSavedConfig();
			configEditor.reload();
			setDefaultPreset(configEditor, '2');

			const presets = configEditor.getCommandPresets()!;
			expect(presets.defaultPresetId).toBe('2');
		});

		it('should not update if preset id does not exist', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			resetSavedConfig();
			configEditor.reload();
			setDefaultPreset(configEditor, '999');

			const presets = configEditor.getCommandPresets()!;
			expect(presets.defaultPresetId).toBe('1');
		});
	});

	describe('getWorktreeConfig - field-level merging', () => {
		it('should return default worktree config values', () => {
			resetSavedConfig();
			configEditor.reload();

			const worktreeConfig = configEditor.getWorktreeConfig()!;

			expect(worktreeConfig.autoDirectory).toBe(false);
			expect(worktreeConfig.copySessionData).toBe(true);
			expect(worktreeConfig.sortByLastSession).toBe(false);
			expect(worktreeConfig.autoUseDefaultBranch).toBe(false);
		});

		it('should merge worktree config from global when not overridden', () => {
			mockConfigData.worktree = {
				autoDirectory: true,
				autoUseDefaultBranch: true,
				copySessionData: false,
				sortByLastSession: true,
			};

			resetSavedConfig();
			configEditor.reload();

			const worktreeConfig = configEditor.getWorktreeConfig()!;

			expect(worktreeConfig.autoDirectory).toBe(true);
			expect(worktreeConfig.autoUseDefaultBranch).toBe(true);
			expect(worktreeConfig.copySessionData).toBe(false);
			expect(worktreeConfig.sortByLastSession).toBe(true);
		});
	});
});
