import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {ConfigurationManager} from './configurationManager.js';
import type {ConfigurationData} from '../types/index.js';

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

describe('ConfigurationManager - selectPresetOnStart', () => {
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
				toggleMode: {ctrl: true, key: 't'},
			},
			commandPresets: {
				presets: [
					{
						id: '1',
						name: 'Main',
						command: 'claude',
					},
					{
						id: '2',
						name: 'Development',
						command: 'claude',
						args: ['--resume'],
					},
				],
				defaultPresetId: '1',
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

	describe('getSelectPresetOnStart', () => {
		it('should return false by default', () => {
			const result = configManager.getSelectPresetOnStart();
			expect(result).toBe(false);
		});

		it('should return true when configured', () => {
			mockConfigData.commandPresets!.selectPresetOnStart = true;
			configManager = new ConfigurationManager();

			const result = configManager.getSelectPresetOnStart();
			expect(result).toBe(true);
		});

		it('should return false when explicitly set to false', () => {
			mockConfigData.commandPresets!.selectPresetOnStart = false;
			configManager = new ConfigurationManager();

			const result = configManager.getSelectPresetOnStart();
			expect(result).toBe(false);
		});
	});

	describe('setSelectPresetOnStart', () => {
		it('should set selectPresetOnStart to true', () => {
			configManager.setSelectPresetOnStart(true);

			const result = configManager.getSelectPresetOnStart();
			expect(result).toBe(true);

			// Verify that config was saved
			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining('config.json'),
				expect.stringContaining('"selectPresetOnStart": true'),
			);
		});

		it('should set selectPresetOnStart to false', () => {
			// First set to true
			configManager.setSelectPresetOnStart(true);
			// Then set to false
			configManager.setSelectPresetOnStart(false);

			const result = configManager.getSelectPresetOnStart();
			expect(result).toBe(false);

			// Verify that config was saved
			expect(writeFileSync).toHaveBeenLastCalledWith(
				expect.stringContaining('config.json'),
				expect.stringContaining('"selectPresetOnStart": false'),
			);
		});

		it('should preserve other preset configuration when setting selectPresetOnStart', () => {
			configManager.setSelectPresetOnStart(true);

			const presets = configManager.getCommandPresets();
			expect(presets.presets).toHaveLength(2);
			expect(presets.defaultPresetId).toBe('1');
			expect(presets.selectPresetOnStart).toBe(true);
		});
	});
});
