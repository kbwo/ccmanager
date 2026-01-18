import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {ConfigEditor} from './configEditor.js';
import {getSelectPresetOnStart, setSelectPresetOnStart} from './testUtils.js';
import type {ConfigurationData} from '../../types/index.js';

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

describe('ConfigEditor (global scope) - selectPresetOnStart', () => {
	let configEditor: ConfigEditor;
	let mockConfigData: ConfigurationData;
	let savedConfigData: string | null = null;

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

	describe('getSelectPresetOnStart', () => {
		it('should return false by default', () => {
			const result = getSelectPresetOnStart(configEditor);
			expect(result).toBe(false);
		});

		it('should return true when configured', () => {
			mockConfigData.commandPresets!.selectPresetOnStart = true;
			configEditor.reload();

			const result = getSelectPresetOnStart(configEditor);
			expect(result).toBe(true);
		});

		it('should return false when explicitly set to false', () => {
			mockConfigData.commandPresets!.selectPresetOnStart = false;
			configEditor.reload();

			const result = getSelectPresetOnStart(configEditor);
			expect(result).toBe(false);
		});
	});

	describe('setSelectPresetOnStart', () => {
		it('should set selectPresetOnStart to true', () => {
			setSelectPresetOnStart(configEditor, true);

			const result = getSelectPresetOnStart(configEditor);
			expect(result).toBe(true);

			// Verify that config was saved
			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining('config.json'),
				expect.stringContaining('"selectPresetOnStart": true'),
			);
		});

		it('should set selectPresetOnStart to false', () => {
			// First set to true
			setSelectPresetOnStart(configEditor, true);
			// Then set to false
			setSelectPresetOnStart(configEditor, false);

			const result = getSelectPresetOnStart(configEditor);
			expect(result).toBe(false);

			// Verify that config was saved
			expect(writeFileSync).toHaveBeenLastCalledWith(
				expect.stringContaining('config.json'),
				expect.stringContaining('"selectPresetOnStart": false'),
			);
		});

		it('should preserve other preset configuration when setting selectPresetOnStart', () => {
			setSelectPresetOnStart(configEditor, true);

			const presets = configEditor.getCommandPresets()!;
			expect(presets.presets).toHaveLength(2);
			expect(presets.defaultPresetId).toBe('1');
			expect(presets.selectPresetOnStart).toBe(true);
		});
	});
});
