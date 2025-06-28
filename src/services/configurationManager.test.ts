import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {ConfigurationManager} from './configurationManager.js';
import type {
	CommandConfig,
	CommandPresetsConfig,
	ConfigurationData,
} from '../types/index.js';

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

describe('ConfigurationManager - Command Presets', () => {
	let configManager: ConfigurationManager;
	let mockConfigData: ConfigurationData;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Default mock config data
		mockConfigData = {
			shortcuts: {
				returnToMenu: {ctrl: true, key: 'e'},
				cancel: {key: 'escape'},
			},
			command: {
				command: 'claude',
				args: ['--existing'],
			},
		};

		// Mock file system operations
		(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				return path.includes('config.json');
			},
		);

		(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
			return JSON.stringify(mockConfigData);
		});

		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});

		// Create new instance for each test
		configManager = new ConfigurationManager();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('getCommandPresets', () => {
		it('should return default presets when no presets are configured', () => {
			// Remove command config for this test
			delete mockConfigData.command;
			configManager = new ConfigurationManager();

			const presets = configManager.getCommandPresets();

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

			configManager = new ConfigurationManager();
			const presets = configManager.getCommandPresets();

			expect(presets.presets).toHaveLength(2);
			expect(presets.defaultPresetId).toBe('2');
		});

		it('should migrate legacy command config to presets on first access', () => {
			// Config has legacy command but no presets
			mockConfigData.command = {
				command: 'claude',
				args: ['--resume'],
				fallbackArgs: ['--no-mcp'],
			};
			delete mockConfigData.commandPresets;

			configManager = new ConfigurationManager();
			const presets = configManager.getCommandPresets();

			expect(presets.presets).toHaveLength(1);
			expect(presets.presets[0]).toEqual({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--resume'],
				fallbackArgs: ['--no-mcp'],
			});
			expect(presets.defaultPresetId).toBe('1');

			// Verify that writeFileSync was called to save the migration
			expect(writeFileSync).toHaveBeenCalled();
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

			configManager.setCommandPresets(newPresets);

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

			configManager = new ConfigurationManager();
			const defaultPreset = configManager.getDefaultPreset();

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

			configManager = new ConfigurationManager();
			const defaultPreset = configManager.getDefaultPreset();

			expect(defaultPreset).toEqual({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
		});
	});

	describe('getPresetById', () => {
		it('should return preset by id', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			const preset = configManager.getPresetById('2');

			expect(preset).toEqual({
				id: '2',
				name: 'Custom',
				command: 'claude',
				args: ['--custom'],
			});
		});

		it('should return undefined for non-existent id', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			const preset = configManager.getPresetById('999');

			expect(preset).toBeUndefined();
		});
	});

	describe('addPreset', () => {
		it('should add a new preset', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			const newPreset = {
				id: '2',
				name: 'New Preset',
				command: 'claude',
				args: ['--new'],
			};

			configManager.addPreset(newPreset);

			const presets = configManager.getCommandPresets();
			expect(presets.presets).toHaveLength(2);
			expect(presets.presets[1]).toEqual(newPreset);
		});

		it('should replace preset with same id', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			const updatedPreset = {
				id: '1',
				name: 'Updated Default',
				command: 'claude',
				args: ['--updated'],
			};

			configManager.addPreset(updatedPreset);

			const presets = configManager.getCommandPresets();
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

			configManager = new ConfigurationManager();
			configManager.deletePreset('2');

			const presets = configManager.getCommandPresets();
			expect(presets.presets).toHaveLength(1);
			expect(presets.presets[0]!.id).toBe('1');
		});

		it('should not delete the last preset', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			configManager.deletePreset('1');

			const presets = configManager.getCommandPresets();
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

			configManager = new ConfigurationManager();
			configManager.deletePreset('2');

			const presets = configManager.getCommandPresets();
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

			configManager = new ConfigurationManager();
			configManager.setDefaultPreset('2');

			const presets = configManager.getCommandPresets();
			expect(presets.defaultPresetId).toBe('2');
		});

		it('should not update if preset id does not exist', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			configManager.setDefaultPreset('999');

			const presets = configManager.getCommandPresets();
			expect(presets.defaultPresetId).toBe('1');
		});
	});

	describe('backward compatibility', () => {
		it('should maintain getCommandConfig for backward compatibility', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude', args: ['--resume']},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			const commandConfig = configManager.getCommandConfig();

			// Should return the default preset as CommandConfig
			expect(commandConfig).toEqual({
				command: 'claude',
				args: ['--resume'],
			});
		});

		it('should update default preset when setCommandConfig is called', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new ConfigurationManager();
			const newConfig: CommandConfig = {
				command: 'claude',
				args: ['--new-args'],
				fallbackArgs: ['--new-fallback'],
			};

			configManager.setCommandConfig(newConfig);

			const presets = configManager.getCommandPresets();
			expect(presets.presets[0]).toEqual({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--new-args'],
				fallbackArgs: ['--new-fallback'],
			});
		});
	});
});
