import {Effect, Either} from 'effect';
import {
	ShortcutConfig,
	StatusHookConfig,
	WorktreeHookConfig,
	WorktreeConfig,
	CommandConfig,
	CommandPresetsConfig,
	CommandPreset,
	ConfigurationData,
	DEFAULT_SHORTCUTS,
} from '../types/index.js';
import {
	FileSystemError,
	ConfigError,
	ValidationError,
} from '../types/errors.js';
import {globalConfigEditor} from './globalConfigEditor.js';
import {projectConfigEditor} from './projectConfigEditor.js';

/**
 * ConfigReader provides merged configuration reading for runtime components.
 * It combines project-level config (from `.ccmanager.json`) with global config,
 * with project config taking priority.
 *
 * Uses the singleton projectConfigEditor (cwd-based) for project config.
 */
export class ConfigReader {
	// Shortcuts - returns merged value (project > global)
	getShortcuts(): ShortcutConfig {
		return (
			projectConfigEditor.getShortcuts() ||
			globalConfigEditor.getShortcuts() ||
			DEFAULT_SHORTCUTS
		);
	}

	// Status Hooks - returns merged value (project > global)
	getStatusHooks(): StatusHookConfig {
		return (
			projectConfigEditor.getStatusHooks() ||
			globalConfigEditor.getStatusHooks() ||
			{}
		);
	}

	// Worktree Hooks - returns merged value (project > global)
	getWorktreeHooks(): WorktreeHookConfig {
		return (
			projectConfigEditor.getWorktreeHooks() ||
			globalConfigEditor.getWorktreeHooks() ||
			{}
		);
	}

	// Worktree Config - returns merged value (project > global)
	getWorktreeConfig(): WorktreeConfig {
		return (
			projectConfigEditor.getWorktreeConfig() ||
			globalConfigEditor.getWorktreeConfig() || {
				autoDirectory: false,
				copySessionData: true,
				sortByLastSession: false,
			}
		);
	}

	// Command Config - for backward compatibility, return from global config
	getCommandConfig(): CommandConfig {
		return globalConfigEditor.getCommandConfig();
	}

	// Command Presets - returns merged value (project > global)
	getCommandPresets(): CommandPresetsConfig {
		return (
			projectConfigEditor.getCommandPresets() ||
			globalConfigEditor.getCommandPresets()
		);
	}

	// Get full merged configuration
	getConfiguration(): ConfigurationData {
		return {
			shortcuts: this.getShortcuts(),
			statusHooks: this.getStatusHooks(),
			worktreeHooks: this.getWorktreeHooks(),
			worktree: this.getWorktreeConfig(),
			command: this.getCommandConfig(),
			commandPresets: this.getCommandPresets(),
			autoApproval: this.getAutoApprovalConfig(),
		};
	}

	// Auto Approval Config - returns merged value (project > global)
	getAutoApprovalConfig(): NonNullable<ConfigurationData['autoApproval']> {
		const projectConfig = projectConfigEditor.getAutoApprovalConfig();
		if (projectConfig) {
			return {
				...projectConfig,
				timeout: projectConfig.timeout ?? 30,
			};
		}
		return globalConfigEditor.getAutoApprovalConfig();
	}

	// Check if auto-approval is enabled
	isAutoApprovalEnabled(): boolean {
		return this.getAutoApprovalConfig().enabled;
	}

	// Command Preset methods - delegate to global config for modifications
	getDefaultPreset(): CommandPreset {
		const presets = this.getCommandPresets();
		const defaultPreset = presets.presets.find(
			p => p.id === presets.defaultPresetId,
		);
		return defaultPreset || presets.presets[0]!;
	}

	getPresetById(id: string): CommandPreset | undefined {
		const presets = this.getCommandPresets();
		return presets.presets.find(p => p.id === id);
	}

	getSelectPresetOnStart(): boolean {
		const presets = this.getCommandPresets();
		return presets.selectPresetOnStart ?? false;
	}

	// Worktree last opened tracking - delegate to global config
	getWorktreeLastOpened(): Record<string, number> {
		return globalConfigEditor.getWorktreeLastOpened();
	}

	setWorktreeLastOpened(worktreePath: string, timestamp: number): void {
		globalConfigEditor.setWorktreeLastOpened(worktreePath, timestamp);
	}

	getWorktreeLastOpenedTime(worktreePath: string): number | undefined {
		return globalConfigEditor.getWorktreeLastOpenedTime(worktreePath);
	}

	// Effect-based methods for type-safe error handling
	loadConfigEffect(): Effect.Effect<
		ConfigurationData,
		FileSystemError | ConfigError,
		never
	> {
		const configPath = projectConfigEditor.getConfigPath();
		return Effect.try({
			try: () => this.getConfiguration(),
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

	// Validate configuration structure
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
			) as Either.Either<ValidationError, ConfigurationData>;
		}

		const configObj = config as Record<string, unknown>;
		if (
			configObj['shortcuts'] !== undefined &&
			(typeof configObj['shortcuts'] !== 'object' ||
				configObj['shortcuts'] === null)
		) {
			return Either.left(
				new ValidationError({
					field: 'config',
					constraint: 'shortcuts must be a valid object',
					receivedValue: config,
				}),
			) as unknown as Either.Either<ValidationError, ConfigurationData>;
		}

		return Either.right(
			config as ConfigurationData,
		) as unknown as Either.Either<ValidationError, ConfigurationData>;
	}

	// Get preset by ID with Either-based error handling
	getPresetByIdEffect(
		id: string,
	): Either.Either<ValidationError, CommandPreset> {
		const preset = this.getPresetById(id);

		if (!preset) {
			return Either.left(
				new ValidationError({
					field: 'presetId',
					constraint: 'Preset not found',
					receivedValue: id,
				}),
			) as unknown as Either.Either<ValidationError, CommandPreset>;
		}

		return Either.right(preset) as unknown as Either.Either<
			ValidationError,
			CommandPreset
		>;
	}

	// Reload project config from disk
	reload(): void {
		projectConfigEditor.reload();
	}
}

/**
 * Default singleton instance
 */
export const configReader = new ConfigReader();
