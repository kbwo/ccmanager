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
import {ConfigurationData, DEFAULT_SHORTCUTS} from '../../types/index.js';
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
