import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {Effect, Either} from 'effect';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {GlobalConfigEditor} from './globalConfigEditor.js';
import {
	FileSystemError,
	ConfigError,
	ValidationError,
} from '../types/errors.js';
import type {
	CommandPresetsConfig,
	ConfigurationData,
	CommandPreset,
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

describe('GlobalConfigEditor - Effect-based operations', () => {
	let configManager: GlobalConfigEditor;
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
		configManager = new GlobalConfigEditor();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('loadConfigEffect', () => {
		it('should return Effect with ConfigurationData on success', async () => {
			const result = await Effect.runPromise(configManager.loadConfigEffect());

			expect(result).toBeDefined();
			expect(result.shortcuts).toBeDefined();
		});

		it('should fail with FileSystemError when file read fails', async () => {
			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('EACCES: permission denied');
			});

			configManager = new GlobalConfigEditor();

			const result = await Effect.runPromise(
				Effect.either(configManager.loadConfigEffect()),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('FileSystemError');
				expect((result.left as FileSystemError).operation).toBe('read');
				expect((result.left as FileSystemError).cause).toContain(
					'permission denied',
				);
			}
		});

		it('should fail with ConfigError when JSON parsing fails', async () => {
			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				return 'invalid json{';
			});

			configManager = new GlobalConfigEditor();

			const result = await Effect.runPromise(
				Effect.either(configManager.loadConfigEffect()),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ConfigError');
				expect((result.left as ConfigError).reason).toBe('parse');
			}
		});

		it('should migrate legacy shortcuts and return success', async () => {
			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('shortcuts.json')) return true;
					if (path.includes('config.json')) return false;
					return true;
				},
			);

			const legacyShortcuts = {
				returnToMenu: {ctrl: true, key: 'b'},
			};

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('shortcuts.json')) {
						return JSON.stringify(legacyShortcuts);
					}
					return '{}';
				},
			);

			configManager = new GlobalConfigEditor();

			const result = await Effect.runPromise(configManager.loadConfigEffect());

			expect(result.shortcuts).toEqual(legacyShortcuts);
			expect(writeFileSync).toHaveBeenCalled();
		});
	});

	describe('saveConfigEffect', () => {
		it('should return Effect<void> on successful save', async () => {
			const newConfig: ConfigurationData = {
				shortcuts: {
					returnToMenu: {ctrl: true, key: 'z'},
					cancel: {key: 'escape'},
				},
			};

			await Effect.runPromise(configManager.saveConfigEffect(newConfig));

			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining('config.json'),
				expect.any(String),
			);
		});

		it('should fail with FileSystemError when file write fails', async () => {
			(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('ENOSPC: no space left on device');
			});

			const newConfig: ConfigurationData = {
				shortcuts: {
					returnToMenu: {ctrl: true, key: 'z'},
					cancel: {key: 'escape'},
				},
			};

			const result = await Effect.runPromise(
				Effect.either(configManager.saveConfigEffect(newConfig)),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('FileSystemError');
				expect((result.left as FileSystemError).operation).toBe('write');
				expect((result.left as FileSystemError).cause).toContain(
					'no space left on device',
				);
			}
		});
	});

	describe('validateConfig', () => {
		it('should return Right with valid ConfigurationData', () => {
			const validConfig: ConfigurationData = {
				shortcuts: {
					returnToMenu: {ctrl: true, key: 'e'},
					cancel: {key: 'escape'},
				},
			};

			const result = configManager.validateConfig(validConfig);

			expect(Either.isRight(result)).toBe(true);
			if (Either.isRight(result)) {
				expect(result.right).toEqual(validConfig);
			}
		});

		it('should return Left with ValidationError for invalid config', () => {
			const invalidConfig = {
				shortcuts: 'not an object',
			};

			const result = configManager.validateConfig(invalidConfig);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				const error = result.left as ValidationError;
				expect(error._tag).toBe('ValidationError');
				expect(error.field).toBe('config');
			}
		});

		it('should return Left for null config', () => {
			const result = configManager.validateConfig(null);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				const error = result.left as ValidationError;
				expect(error._tag).toBe('ValidationError');
			}
		});
	});

	describe('getPresetByIdEffect', () => {
		it('should return Right with preset when found', () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			const result = configManager.getPresetByIdEffect('2');

			expect(Either.isRight(result)).toBe(true);
			if (Either.isRight(result)) {
				expect(result.right).toEqual({
					id: '2',
					name: 'Custom',
					command: 'claude',
					args: ['--custom'],
				});
			}
		});

		it('should return Left with ValidationError when preset not found', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			const result = configManager.getPresetByIdEffect('999');

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				const error = result.left as unknown as ValidationError;
				expect(error._tag).toBe('ValidationError');
				expect(error.field).toBe('presetId');
				expect(error.receivedValue).toBe('999');
			}
		});

		it('should include constraint in ValidationError', () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			const result = configManager.getPresetByIdEffect('invalid-id');

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				const error = result.left as unknown as ValidationError;
				expect(error.constraint).toContain('not found');
			}
		});
	});

	describe('setShortcutsEffect', () => {
		it('should return Effect<void> on successful update', async () => {
			const newShortcuts = {
				returnToMenu: {ctrl: true, key: 'z'},
				cancel: {key: 'escape'},
			};

			await Effect.runPromise(configManager.setShortcutsEffect(newShortcuts));

			expect(writeFileSync).toHaveBeenCalled();
		});

		it('should fail with FileSystemError when save fails', async () => {
			(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Write failed');
			});

			const newShortcuts = {
				returnToMenu: {ctrl: true, key: 'z'},
				cancel: {key: 'escape'},
			};

			const result = await Effect.runPromise(
				Effect.either(configManager.setShortcutsEffect(newShortcuts)),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('FileSystemError');
			}
		});
	});

	describe('setCommandPresetsEffect', () => {
		it('should return Effect<void> on successful update', async () => {
			const newPresets: CommandPresetsConfig = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude', args: ['--custom']},
				],
				defaultPresetId: '2',
			};

			await Effect.runPromise(
				configManager.setCommandPresetsEffect(newPresets),
			);

			expect(writeFileSync).toHaveBeenCalled();
		});

		it('should fail with FileSystemError when save fails', async () => {
			(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Disk full');
			});

			const newPresets: CommandPresetsConfig = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			const result = await Effect.runPromise(
				Effect.either(configManager.setCommandPresetsEffect(newPresets)),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('FileSystemError');
			}
		});
	});

	describe('addPresetEffect', () => {
		it('should add new preset and return Effect<void>', async () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			const newPreset: CommandPreset = {
				id: '2',
				name: 'New',
				command: 'claude',
				args: ['--new'],
			};

			await Effect.runPromise(configManager.addPresetEffect(newPreset));

			expect(writeFileSync).toHaveBeenCalled();
		});

		it('should replace existing preset with same id', async () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			const updatedPreset: CommandPreset = {
				id: '1',
				name: 'Updated',
				command: 'claude',
				args: ['--updated'],
			};

			await Effect.runPromise(configManager.addPresetEffect(updatedPreset));

			expect(writeFileSync).toHaveBeenCalled();
		});

		it('should fail with FileSystemError when save fails', async () => {
			(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Save failed');
			});

			const newPreset: CommandPreset = {
				id: '2',
				name: 'New',
				command: 'claude',
			};

			const result = await Effect.runPromise(
				Effect.either(configManager.addPresetEffect(newPreset)),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('FileSystemError');
			}
		});
	});

	describe('deletePresetEffect', () => {
		it('should delete preset and return Effect<void>', async () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude'},
				],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			await Effect.runPromise(configManager.deletePresetEffect('2'));

			expect(writeFileSync).toHaveBeenCalled();
		});

		it('should fail with ValidationError when deleting last preset', async () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			const result = await Effect.runPromise(
				Effect.either(configManager.deletePresetEffect('1')),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ValidationError');
				expect((result.left as ValidationError).field).toBe('presetId');
				expect((result.left as ValidationError).constraint).toContain(
					'Cannot delete last preset',
				);
			}
		});

		it('should fail with FileSystemError when save fails', async () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude'},
				],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Save failed');
			});

			const result = await Effect.runPromise(
				Effect.either(configManager.deletePresetEffect('2')),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('FileSystemError');
			}
		});
	});

	describe('setDefaultPresetEffect', () => {
		it('should update default preset and return Effect<void>', async () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude'},
				],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			await Effect.runPromise(configManager.setDefaultPresetEffect('2'));

			expect(writeFileSync).toHaveBeenCalled();
		});

		it('should fail with ValidationError when preset id does not exist', async () => {
			mockConfigData.commandPresets = {
				presets: [{id: '1', name: 'Main', command: 'claude'}],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			const result = await Effect.runPromise(
				Effect.either(configManager.setDefaultPresetEffect('999')),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ValidationError');
				expect((result.left as ValidationError).field).toBe('presetId');
			}
		});

		it('should fail with FileSystemError when save fails', async () => {
			mockConfigData.commandPresets = {
				presets: [
					{id: '1', name: 'Main', command: 'claude'},
					{id: '2', name: 'Custom', command: 'claude'},
				],
				defaultPresetId: '1',
			};

			configManager = new GlobalConfigEditor();

			(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Save failed');
			});

			const result = await Effect.runPromise(
				Effect.either(configManager.setDefaultPresetEffect('2')),
			);

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('FileSystemError');
			}
		});
	});
});
