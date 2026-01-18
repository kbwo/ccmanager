import {Either} from 'effect';
import {
	ShortcutConfig,
	StatusHookConfig,
	WorktreeHookConfig,
	WorktreeConfig,
	CommandPresetsConfig,
	CommandPreset,
	ConfigurationData,
	IConfigReader,
} from '../../types/index.js';
import {ValidationError} from '../../types/errors.js';
import {globalConfigManager} from './globalConfigManager.js';
import {projectConfigManager} from './projectConfigManager.js';

/**
 * ConfigReader provides merged configuration reading for runtime components.
 * It combines project-level config (from `.ccmanager.json`) with global config,
 * with project config taking priority.
 *
 * Uses the singleton projectConfigManager (cwd-based) for project config.
 */
export class ConfigReader implements IConfigReader {
	// Shortcuts - returns merged value (project > global)
	getShortcuts(): ShortcutConfig {
		return (
			projectConfigManager.getShortcuts() || globalConfigManager.getShortcuts()
		);
	}

	// Status Hooks - returns merged value (project > global)
	getStatusHooks(): StatusHookConfig {
		return (
			projectConfigManager.getStatusHooks() ||
			globalConfigManager.getStatusHooks()
		);
	}

	// Worktree Hooks - returns merged value (project > global)
	getWorktreeHooks(): WorktreeHookConfig {
		return (
			projectConfigManager.getWorktreeHooks() ||
			globalConfigManager.getWorktreeHooks()
		);
	}

	// Worktree Config - returns merged value (project > global)
	getWorktreeConfig(): WorktreeConfig {
		return (
			projectConfigManager.getWorktreeConfig() ||
			globalConfigManager.getWorktreeConfig()
		);
	}

	// Command Presets - returns merged value (project > global)
	getCommandPresets(): CommandPresetsConfig {
		return (
			projectConfigManager.getCommandPresets() ||
			globalConfigManager.getCommandPresets()
		);
	}

	// Get full merged configuration
	getConfiguration(): ConfigurationData {
		return {
			shortcuts: this.getShortcuts(),
			statusHooks: this.getStatusHooks(),
			worktreeHooks: this.getWorktreeHooks(),
			worktree: this.getWorktreeConfig(),
			commandPresets: this.getCommandPresets(),
			autoApproval: this.getAutoApprovalConfig(),
		};
	}

	// Auto Approval Config - returns merged value (project > global)
	getAutoApprovalConfig(): NonNullable<ConfigurationData['autoApproval']> {
		const projectConfig = projectConfigManager.getAutoApprovalConfig();
		if (projectConfig) {
			return {
				...projectConfig,
				timeout: projectConfig.timeout ?? 30,
			};
		}
		return globalConfigManager.getAutoApprovalConfig();
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

	getSelectPresetOnStart(): boolean {
		const presets = this.getCommandPresets();
		return presets.selectPresetOnStart ?? false;
	}

	// Get preset by ID with Either-based error handling
	getPresetByIdEffect(
		id: string,
	): Either.Either<CommandPreset, ValidationError> {
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

	// Reload both project and global configs from disk
	reload(): void {
		projectConfigManager.reload();
		globalConfigManager.reload();
	}
}

/**
 * Default singleton instance
 */
export const configReader = new ConfigReader();
