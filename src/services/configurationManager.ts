import {homedir} from 'os';
import {join} from 'path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {Effect, Either} from 'effect';
import {
	ConfigurationData,
	StatusHookConfig,
	WorktreeHookConfig,
	ShortcutConfig,
	WorktreeConfig,
	CommandConfig,
	CommandPreset,
	CommandPresetsConfig,
	DEFAULT_SHORTCUTS,
} from '../types/index.js';
import {
	FileSystemError,
	ConfigError,
	ValidationError,
} from '../types/errors.js';

export class ConfigurationManager {
	private configPath: string;
	private legacyShortcutsPath: string;
	private configDir: string;
	private config: ConfigurationData = {};

	constructor() {
		// Determine config directory based on platform
		const homeDir = homedir();
		this.configDir =
			process.platform === 'win32'
				? join(
						process.env['APPDATA'] || join(homeDir, 'AppData', 'Roaming'),
						'ccmanager',
					)
				: join(homeDir, '.config', 'ccmanager');

		// Ensure config directory exists
		if (!existsSync(this.configDir)) {
			mkdirSync(this.configDir, {recursive: true});
		}

		this.configPath = join(this.configDir, 'config.json');
		this.legacyShortcutsPath = join(this.configDir, 'shortcuts.json');
		this.loadConfig();
	}

	private loadConfig(): void {
		// Try to load the new config file
		if (existsSync(this.configPath)) {
			try {
				const configData = readFileSync(this.configPath, 'utf-8');
				this.config = JSON.parse(configData);
			} catch (error) {
				console.error('Failed to load configuration:', error);
				this.config = {};
			}
		} else {
			// If new config doesn't exist, check for legacy shortcuts.json
			this.migrateLegacyShortcuts();
		}

		// Check if shortcuts need to be loaded from legacy file
		// This handles the case where config.json exists but doesn't have shortcuts
		if (!this.config.shortcuts && existsSync(this.legacyShortcutsPath)) {
			this.migrateLegacyShortcuts();
		}

		// Ensure default values
		if (!this.config.shortcuts) {
			this.config.shortcuts = DEFAULT_SHORTCUTS;
		}
		if (!this.config.statusHooks) {
			this.config.statusHooks = {};
		}
		if (!this.config.worktreeHooks) {
			this.config.worktreeHooks = {};
		}
		if (!this.config.worktree) {
			this.config.worktree = {
				autoDirectory: false,
				copySessionData: true,
			};
		}
		if (
			!Object.prototype.hasOwnProperty.call(
				this.config.worktree,
				'copySessionData',
			)
		) {
			this.config.worktree.copySessionData = true;
		}
		if (!this.config.command) {
			this.config.command = {
				command: 'claude',
			};
		}

		// Migrate legacy command config to presets if needed
		this.migrateLegacyCommandToPresets();
	}

	private migrateLegacyShortcuts(): void {
		if (existsSync(this.legacyShortcutsPath)) {
			try {
				const shortcutsData = readFileSync(this.legacyShortcutsPath, 'utf-8');
				const shortcuts = JSON.parse(shortcutsData);

				// Validate that it's a valid shortcuts config
				if (shortcuts && typeof shortcuts === 'object') {
					this.config.shortcuts = shortcuts;
					// Save to new config format
					this.saveConfig();
					console.log(
						'Migrated shortcuts from legacy shortcuts.json to config.json',
					);
				}
			} catch (error) {
				console.error('Failed to migrate legacy shortcuts:', error);
			}
		}
	}

	private saveConfig(): void {
		try {
			writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
		} catch (error) {
			console.error('Failed to save configuration:', error);
		}
	}

	getShortcuts(): ShortcutConfig {
		return this.config.shortcuts || DEFAULT_SHORTCUTS;
	}

	setShortcuts(shortcuts: ShortcutConfig): void {
		this.config.shortcuts = shortcuts;
		this.saveConfig();
	}

	getStatusHooks(): StatusHookConfig {
		return this.config.statusHooks || {};
	}

	setStatusHooks(hooks: StatusHookConfig): void {
		this.config.statusHooks = hooks;
		this.saveConfig();
	}

	getWorktreeHooks(): WorktreeHookConfig {
		return this.config.worktreeHooks || {};
	}

	setWorktreeHooks(hooks: WorktreeHookConfig): void {
		this.config.worktreeHooks = hooks;
		this.saveConfig();
	}

	getConfiguration(): ConfigurationData {
		return this.config;
	}

	setConfiguration(config: ConfigurationData): void {
		this.config = config;
		this.saveConfig();
	}

	getWorktreeConfig(): WorktreeConfig {
		return (
			this.config.worktree || {
				autoDirectory: false,
			}
		);
	}

	setWorktreeConfig(worktreeConfig: WorktreeConfig): void {
		this.config.worktree = worktreeConfig;
		this.saveConfig();
	}

	getCommandConfig(): CommandConfig {
		// For backward compatibility, return the default preset as CommandConfig
		const defaultPreset = this.getDefaultPreset();
		return {
			command: defaultPreset.command,
			args: defaultPreset.args,
			fallbackArgs: defaultPreset.fallbackArgs,
		};
	}

	setCommandConfig(commandConfig: CommandConfig): void {
		this.config.command = commandConfig;

		// Also update the default preset for backward compatibility
		if (this.config.commandPresets) {
			const defaultPreset = this.config.commandPresets.presets.find(
				p => p.id === this.config.commandPresets!.defaultPresetId,
			);
			if (defaultPreset) {
				defaultPreset.command = commandConfig.command;
				defaultPreset.args = commandConfig.args;
				defaultPreset.fallbackArgs = commandConfig.fallbackArgs;
			}
		}

		this.saveConfig();
	}

	private migrateLegacyCommandToPresets(): void {
		// Only migrate if we have legacy command config but no presets
		if (this.config.command && !this.config.commandPresets) {
			const defaultPreset: CommandPreset = {
				id: '1',
				name: 'Main',
				command: this.config.command.command,
				args: this.config.command.args,
				fallbackArgs: this.config.command.fallbackArgs,
			};

			this.config.commandPresets = {
				presets: [defaultPreset],
				defaultPresetId: '1',
			};

			this.saveConfig();
		}

		// Ensure default presets if none exist
		if (!this.config.commandPresets) {
			this.config.commandPresets = {
				presets: [
					{
						id: '1',
						name: 'Main',
						command: 'claude',
					},
				],
				defaultPresetId: '1',
			};
		}
	}

	getCommandPresets(): CommandPresetsConfig {
		if (!this.config.commandPresets) {
			this.migrateLegacyCommandToPresets();
		}
		return this.config.commandPresets!;
	}

	setCommandPresets(presets: CommandPresetsConfig): void {
		this.config.commandPresets = presets;
		this.saveConfig();
	}

	getDefaultPreset(): CommandPreset {
		const presets = this.getCommandPresets();
		const defaultPreset = presets.presets.find(
			p => p.id === presets.defaultPresetId,
		);

		// If default preset not found, return the first one
		return defaultPreset || presets.presets[0]!;
	}

	getPresetById(id: string): CommandPreset | undefined {
		const presets = this.getCommandPresets();
		return presets.presets.find(p => p.id === id);
	}

	addPreset(preset: CommandPreset): void {
		const presets = this.getCommandPresets();

		// Replace if exists, otherwise add
		const existingIndex = presets.presets.findIndex(p => p.id === preset.id);
		if (existingIndex >= 0) {
			presets.presets[existingIndex] = preset;
		} else {
			presets.presets.push(preset);
		}

		this.setCommandPresets(presets);
	}

	deletePreset(id: string): void {
		const presets = this.getCommandPresets();

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

		this.setCommandPresets(presets);
	}

	setDefaultPreset(id: string): void {
		const presets = this.getCommandPresets();

		// Only update if preset exists
		if (presets.presets.some(p => p.id === id)) {
			presets.defaultPresetId = id;
			this.setCommandPresets(presets);
		}
	}

	getSelectPresetOnStart(): boolean {
		const presets = this.getCommandPresets();
		return presets.selectPresetOnStart ?? false;
	}

	setSelectPresetOnStart(enabled: boolean): void {
		const presets = this.getCommandPresets();
		presets.selectPresetOnStart = enabled;
		this.setCommandPresets(presets);
	}

	// Effect-based methods for type-safe error handling

	/**
	 * Load configuration from file with Effect-based error handling
	 * Returns Effect that may fail with FileSystemError or ConfigError
	 */
	loadConfigEffect(): Effect.Effect<
		ConfigurationData,
		FileSystemError | ConfigError,
		never
	> {
		return Effect.try({
			try: () => {
				// Try to load the new config file
				if (existsSync(this.configPath)) {
					const configData = readFileSync(this.configPath, 'utf-8');
					const parsedConfig = JSON.parse(configData);
					return this.applyDefaults(parsedConfig);
				} else {
					// If new config doesn't exist, check for legacy shortcuts.json
					const migratedConfig = this.migrateLegacyShortcutsSync();
					return this.applyDefaults(migratedConfig || {});
				}
			},
			catch: (error: unknown) => {
				// Determine error type
				if (error instanceof SyntaxError) {
					return new ConfigError({
						configPath: this.configPath,
						reason: 'parse',
						details: String(error),
					});
				}
				return new FileSystemError({
					operation: 'read',
					path: this.configPath,
					cause: String(error),
				});
			},
		});
	}

	/**
	 * Save configuration to file with Effect-based error handling
	 * Returns Effect that may fail with FileSystemError
	 */
	saveConfigEffect(
		config: ConfigurationData,
	): Effect.Effect<void, FileSystemError, never> {
		return Effect.try({
			try: () => {
				this.config = config;
				writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
			},
			catch: (error: unknown) => {
				return new FileSystemError({
					operation: 'write',
					path: this.configPath,
					cause: String(error),
				});
			},
		});
	}

	/**
	 * Validate configuration structure
	 * Synchronous validation using Either
	 */
	validateConfig(
		config: unknown,
	): Either.Either<ValidationError, ConfigurationData> {
		if (!config || typeof config !== 'object') {
			return Either.left(
				new ValidationError({
					field: 'config',
					constraint: 'must be a valid configuration object',
					receivedValue: config,
				}),
			);
		}

		// Validate shortcuts field if present
		const configObj = config as Record<string, unknown>;
		if (
			configObj.shortcuts !== undefined &&
			(typeof configObj.shortcuts !== 'object' || configObj.shortcuts === null)
		) {
			return Either.left(
				new ValidationError({
					field: 'config',
					constraint: 'shortcuts must be a valid object',
					receivedValue: config,
				}),
			);
		}

		// Additional validation could go here
		return Either.right(config as ConfigurationData);
	}

	/**
	 * Get preset by ID with Either-based error handling
	 * Synchronous lookup using Either
	 */
	getPresetByIdEffect(
		id: string,
	): Either.Either<ValidationError, CommandPreset> {
		const presets = this.getCommandPresets();
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

	/**
	 * Set shortcuts with Effect-based error handling
	 */
	setShortcutsEffect(
		shortcuts: ShortcutConfig,
	): Effect.Effect<void, FileSystemError, never> {
		this.config.shortcuts = shortcuts;
		return this.saveConfigEffect(this.config);
	}

	/**
	 * Set command presets with Effect-based error handling
	 */
	setCommandPresetsEffect(
		presets: CommandPresetsConfig,
	): Effect.Effect<void, FileSystemError, never> {
		this.config.commandPresets = presets;
		return this.saveConfigEffect(this.config);
	}

	/**
	 * Add or update preset with Effect-based error handling
	 */
	addPresetEffect(
		preset: CommandPreset,
	): Effect.Effect<void, FileSystemError, never> {
		const presets = this.getCommandPresets();

		// Replace if exists, otherwise add
		const existingIndex = presets.presets.findIndex(p => p.id === preset.id);
		if (existingIndex >= 0) {
			presets.presets[existingIndex] = preset;
		} else {
			presets.presets.push(preset);
		}

		return this.setCommandPresetsEffect(presets);
	}

	/**
	 * Delete preset with Effect-based error handling
	 */
	deletePresetEffect(
		id: string,
	): Effect.Effect<void, ValidationError | FileSystemError, never> {
		const presets = this.getCommandPresets();

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

		return this.setCommandPresetsEffect(presets);
	}

	/**
	 * Set default preset with Effect-based error handling
	 */
	setDefaultPresetEffect(
		id: string,
	): Effect.Effect<void, ValidationError | FileSystemError, never> {
		const presets = this.getCommandPresets();

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
		return this.setCommandPresetsEffect(presets);
	}

	// Helper methods

	/**
	 * Apply default values to configuration
	 */
	private applyDefaults(config: ConfigurationData): ConfigurationData {
		// Ensure default values
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
			};
		}
		if (
			!Object.prototype.hasOwnProperty.call(
				config.worktree,
				'copySessionData',
			)
		) {
			config.worktree.copySessionData = true;
		}
		if (!config.command) {
			config.command = {
				command: 'claude',
			};
		}

		return config;
	}

	/**
	 * Synchronous legacy shortcuts migration helper
	 */
	private migrateLegacyShortcutsSync(): ConfigurationData | null {
		if (existsSync(this.legacyShortcutsPath)) {
			try {
				const shortcutsData = readFileSync(this.legacyShortcutsPath, 'utf-8');
				const shortcuts = JSON.parse(shortcutsData);

				// Validate that it's a valid shortcuts config
				if (shortcuts && typeof shortcuts === 'object') {
					const config: ConfigurationData = {shortcuts};
					// Save to new config format
					this.config = config;
					writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
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
}

export const configurationManager = new ConfigurationManager();
