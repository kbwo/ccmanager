/**
 * @fileoverview Test utilities for config module
 *
 * WARNING: This file is intended for TEST USE ONLY.
 * Do not import from production code.
 *
 * These functions provide Effect-based wrappers for testing config operations.
 */
import {Effect, Either} from 'effect';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {
	ConfigurationData,
	DEFAULT_SHORTCUTS,
	CommandPreset,
	CommandPresetsConfig,
	ShortcutConfig,
	IConfigEditor,
} from '../../types/index.js';
import {
	FileSystemError,
	ConfigError,
	ValidationError,
} from '../../types/errors.js';

/**
 * TEST ONLY: Load configuration from file with Effect-based error handling
 *
 * @param configPath - Path to the config file
 * @param legacyShortcutsPath - Path to legacy shortcuts file for migration
 * @returns Effect with ConfigurationData on success, errors on failure
 */
export function loadConfigEffect(
	configPath: string,
	legacyShortcutsPath: string,
): Effect.Effect<ConfigurationData, FileSystemError | ConfigError, never> {
	return Effect.try({
		try: () => {
			if (existsSync(configPath)) {
				const configData = readFileSync(configPath, 'utf-8');
				const parsedConfig = JSON.parse(configData);
				return applyDefaults(parsedConfig);
			} else {
				const migratedConfig = migrateLegacyShortcutsSync(
					configPath,
					legacyShortcutsPath,
				);
				return applyDefaults(migratedConfig || {});
			}
		},
		catch: (error: unknown) => {
			if (error instanceof SyntaxError) {
				return new ConfigError({
					configPath,
					reason: 'parse',
					details: String(error),
				});
			}
			return new FileSystemError({
				operation: 'read',
				path: configPath,
				cause: String(error),
			});
		},
	});
}

/**
 * Type guard to check if value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
}

type ValidationResult = Either.Either<ConfigurationData, ValidationError>;

function validationError(
	constraint: string,
	receivedValue: unknown,
): ValidationResult {
	return Either.left(
		new ValidationError({
			field: 'config',
			constraint,
			receivedValue,
		}),
	);
}

function validationSuccess(config: ConfigurationData): ValidationResult {
	return Either.right(config);
}

/**
 * TEST ONLY: Validate configuration structure
 */
export function validateConfig(config: unknown): ValidationResult {
	if (!isObject(config)) {
		return validationError('must be a valid configuration object', config);
	}

	const shortcuts = config['shortcuts'];
	if (shortcuts !== undefined && !isObject(shortcuts)) {
		return validationError('shortcuts must be a valid object', config);
	}

	return validationSuccess(config as ConfigurationData);
}

/**
 * Apply default values to configuration
 */
function applyDefaults(config: ConfigurationData): ConfigurationData {
	if (!config.shortcuts) {
		config.shortcuts = DEFAULT_SHORTCUTS;
	}
	if (!config.statusHooks) {
		config.statusHooks = {};
	}
	if (!config.worktreeHooks) {
		config.worktreeHooks = {};
	}
	if (!config.worktree) {
		config.worktree = {
			autoDirectory: false,
			copySessionData: true,
			sortByLastSession: false,
		};
	}
	if (
		!Object.prototype.hasOwnProperty.call(config.worktree, 'copySessionData')
	) {
		config.worktree.copySessionData = true;
	}
	if (
		!Object.prototype.hasOwnProperty.call(config.worktree, 'sortByLastSession')
	) {
		config.worktree.sortByLastSession = false;
	}
	if (!config.autoApproval) {
		config.autoApproval = {
			enabled: false,
			timeout: 30,
		};
	} else {
		if (!Object.prototype.hasOwnProperty.call(config.autoApproval, 'enabled')) {
			config.autoApproval.enabled = false;
		}
		if (!Object.prototype.hasOwnProperty.call(config.autoApproval, 'timeout')) {
			config.autoApproval.timeout = 30;
		}
	}

	return config;
}

/**
 * Synchronous legacy shortcuts migration helper
 */
function migrateLegacyShortcutsSync(
	configPath: string,
	legacyShortcutsPath: string,
): ConfigurationData | null {
	if (existsSync(legacyShortcutsPath)) {
		try {
			const shortcutsData = readFileSync(legacyShortcutsPath, 'utf-8');
			const shortcuts = JSON.parse(shortcutsData);

			if (shortcuts && typeof shortcuts === 'object') {
				const config: ConfigurationData = {shortcuts};
				writeFileSync(configPath, JSON.stringify(config, null, 2));
				console.log(
					'Migrated shortcuts from legacy shortcuts.json to config.json',
				);
				return config;
			}
		} catch (error) {
			console.error('Failed to migrate legacy shortcuts:', error);
		}
	}
	return null;
}

// ============================================================================
// Test-only helper functions for GlobalConfigManager
// These functions were moved from GlobalConfigManager class to reduce its API
// surface while keeping tests functional.
// ============================================================================

/**
 * TEST ONLY: Add or update a preset in the config manager
 */
export function addPreset(
	configManager: IConfigEditor,
	preset: CommandPreset,
): void {
	const presets = configManager.getCommandPresets()!;

	// Replace if exists, otherwise add
	const existingIndex = presets.presets.findIndex(p => p.id === preset.id);
	if (existingIndex >= 0) {
		presets.presets[existingIndex] = preset;
	} else {
		presets.presets.push(preset);
	}

	configManager.setCommandPresets(presets);
}

/**
 * TEST ONLY: Delete a preset by ID
 */
export function deletePreset(configManager: IConfigEditor, id: string): void {
	const presets = configManager.getCommandPresets()!;

	// Don't delete if it's the last preset
	if (presets.presets.length <= 1) {
		return;
	}

	// Remove the preset
	presets.presets = presets.presets.filter(p => p.id !== id);

	// Update default if needed
	if (presets.defaultPresetId === id && presets.presets.length > 0) {
		presets.defaultPresetId = presets.presets[0]!.id;
	}

	configManager.setCommandPresets(presets);
}

/**
 * TEST ONLY: Set the default preset ID
 */
export function setDefaultPreset(
	configManager: IConfigEditor,
	id: string,
): void {
	const presets = configManager.getCommandPresets()!;

	// Only update if preset exists
	if (presets.presets.some(p => p.id === id)) {
		presets.defaultPresetId = id;
		configManager.setCommandPresets(presets);
	}
}

/**
 * TEST ONLY: Save configuration to file with Effect-based error handling
 */
export function saveConfigEffect(
	configManager: IConfigEditor,
	config: ConfigurationData,
	configPath: string,
): Effect.Effect<void, FileSystemError, never> {
	return Effect.try({
		try: () => {
			configManager.setCommandPresets(
				config.commandPresets || configManager.getCommandPresets()!,
			);
			if (config.shortcuts) {
				configManager.setShortcuts(config.shortcuts);
			}
			writeFileSync(configPath, JSON.stringify(config, null, 2));
		},
		catch: (error: unknown) => {
			return new FileSystemError({
				operation: 'write',
				path: configPath,
				cause: String(error),
			});
		},
	});
}

/**
 * TEST ONLY: Set shortcuts with Effect-based error handling
 */
export function setShortcutsEffect(
	configManager: IConfigEditor,
	shortcuts: ShortcutConfig,
	configPath: string,
): Effect.Effect<void, FileSystemError, never> {
	return Effect.try({
		try: () => {
			configManager.setShortcuts(shortcuts);
			const config = {
				...({} as ConfigurationData),
				shortcuts,
				commandPresets: configManager.getCommandPresets(),
			};
			writeFileSync(configPath, JSON.stringify(config, null, 2));
		},
		catch: (error: unknown) => {
			return new FileSystemError({
				operation: 'write',
				path: configPath,
				cause: String(error),
			});
		},
	});
}

/**
 * TEST ONLY: Set command presets with Effect-based error handling
 */
export function setCommandPresetsEffect(
	configManager: IConfigEditor,
	presets: CommandPresetsConfig,
	configPath: string,
): Effect.Effect<void, FileSystemError, never> {
	return Effect.try({
		try: () => {
			configManager.setCommandPresets(presets);
			const config = {
				...({} as ConfigurationData),
				commandPresets: presets,
			};
			writeFileSync(configPath, JSON.stringify(config, null, 2));
		},
		catch: (error: unknown) => {
			return new FileSystemError({
				operation: 'write',
				path: configPath,
				cause: String(error),
			});
		},
	});
}

/**
 * TEST ONLY: Add or update preset with Effect-based error handling
 */
export function addPresetEffect(
	configManager: IConfigEditor,
	preset: CommandPreset,
	configPath: string,
): Effect.Effect<void, FileSystemError, never> {
	const presets = configManager.getCommandPresets()!;

	// Replace if exists, otherwise add
	const existingIndex = presets.presets.findIndex(p => p.id === preset.id);
	if (existingIndex >= 0) {
		presets.presets[existingIndex] = preset;
	} else {
		presets.presets.push(preset);
	}

	return setCommandPresetsEffect(configManager, presets, configPath);
}

/**
 * TEST ONLY: Delete preset with Effect-based error handling
 */
export function deletePresetEffect(
	configManager: IConfigEditor,
	id: string,
	configPath: string,
): Effect.Effect<void, ValidationError | FileSystemError, never> {
	const presets = configManager.getCommandPresets()!;

	// Don't delete if it's the last preset
	if (presets.presets.length <= 1) {
		return Effect.fail(
			new ValidationError({
				field: 'presetId',
				constraint: 'Cannot delete last preset',
				receivedValue: id,
			}),
		);
	}

	// Remove the preset
	presets.presets = presets.presets.filter(p => p.id !== id);

	// Update default if needed
	if (presets.defaultPresetId === id && presets.presets.length > 0) {
		presets.defaultPresetId = presets.presets[0]!.id;
	}

	return setCommandPresetsEffect(configManager, presets, configPath);
}

/**
 * TEST ONLY: Set default preset with Effect-based error handling
 */
export function setDefaultPresetEffect(
	configManager: IConfigEditor,
	id: string,
	configPath: string,
): Effect.Effect<void, ValidationError | FileSystemError, never> {
	const presets = configManager.getCommandPresets()!;

	// Only update if preset exists
	if (!presets.presets.some(p => p.id === id)) {
		return Effect.fail(
			new ValidationError({
				field: 'presetId',
				constraint: 'Preset not found',
				receivedValue: id,
			}),
		);
	}

	presets.defaultPresetId = id;
	return setCommandPresetsEffect(configManager, presets, configPath);
}

/**
 * TEST ONLY: Get the default preset
 */
export function getDefaultPreset(configManager: IConfigEditor): CommandPreset {
	const presets = configManager.getCommandPresets()!;
	const defaultPreset = presets.presets.find(
		p => p.id === presets.defaultPresetId,
	);
	return defaultPreset || presets.presets[0]!;
}

/**
 * TEST ONLY: Get whether to select preset on start
 */
export function getSelectPresetOnStart(configManager: IConfigEditor): boolean {
	const presets = configManager.getCommandPresets()!;
	return presets.selectPresetOnStart ?? false;
}

/**
 * TEST ONLY: Set whether to select preset on start
 */
export function setSelectPresetOnStart(
	configManager: IConfigEditor,
	enabled: boolean,
): void {
	const presets = configManager.getCommandPresets()!;
	presets.selectPresetOnStart = enabled;
	configManager.setCommandPresets(presets);
}

/**
 * TEST ONLY: Get whether auto-approval is enabled
 */
export function isAutoApprovalEnabled(configManager: IConfigEditor): boolean {
	const config = configManager.getAutoApprovalConfig();
	return config?.enabled ?? false;
}

/**
 * TEST ONLY: Get preset by ID with Either-based error handling
 */
export function getPresetByIdEffect(
	configManager: IConfigEditor,
	id: string,
): Either.Either<CommandPreset, ValidationError> {
	const presets = configManager.getCommandPresets()!;
	const preset = presets.presets.find(p => p.id === id);

	if (!preset) {
		return Either.left(
			new ValidationError({
				field: 'presetId',
				constraint: 'Preset not found',
				receivedValue: id,
			}),
		);
	}

	return Either.right(preset);
}
