import {
	ConfigScope,
	ProjectConfigurationData,
	ShortcutConfig,
	StatusHookConfig,
	WorktreeHookConfig,
	WorktreeConfig,
	CommandPresetsConfig,
	DEFAULT_SHORTCUTS,
	IConfigEditor,
	AutoApprovalConfig,
} from '../types/index.js';
import {globalConfigEditor} from './globalConfigEditor.js';
import {projectConfigEditor} from './projectConfigEditor.js';

/**
 * ConfigEditor provides scope-aware configuration editing.
 * The scope is determined at construction time.
 *
 * - When scope='global', uses GlobalConfigEditor singleton
 * - When scope='project', uses ProjectConfigEditor singleton
 *
 * This class also provides methods to get effective values
 * (merged config where project overrides global).
 *
 * IMPORTANT: Uses singletons to ensure that config changes are
 * immediately visible to all components (e.g., shortcutManager, configReader).
 */
export class ConfigEditor implements IConfigEditor {
	private scope: ConfigScope;
	private configEditor: IConfigEditor;

	constructor(scope: ConfigScope) {
		this.scope = scope;
		this.configEditor =
			scope === 'global' ? globalConfigEditor : projectConfigEditor;
	}

	// IConfigEditor implementation - delegates to configEditor

	getShortcuts(): ShortcutConfig | undefined {
		return this.configEditor.getShortcuts();
	}

	setShortcuts(value: ShortcutConfig): void {
		this.configEditor.setShortcuts(value);
	}

	getStatusHooks(): StatusHookConfig | undefined {
		return this.configEditor.getStatusHooks();
	}

	setStatusHooks(value: StatusHookConfig): void {
		this.configEditor.setStatusHooks(value);
	}

	getWorktreeHooks(): WorktreeHookConfig | undefined {
		return this.configEditor.getWorktreeHooks();
	}

	setWorktreeHooks(value: WorktreeHookConfig): void {
		this.configEditor.setWorktreeHooks(value);
	}

	getWorktreeConfig(): WorktreeConfig | undefined {
		return this.configEditor.getWorktreeConfig();
	}

	setWorktreeConfig(value: WorktreeConfig): void {
		this.configEditor.setWorktreeConfig(value);
	}

	getCommandPresets(): CommandPresetsConfig | undefined {
		return this.configEditor.getCommandPresets();
	}

	setCommandPresets(value: CommandPresetsConfig): void {
		this.configEditor.setCommandPresets(value);
	}

	getAutoApprovalConfig(): AutoApprovalConfig | undefined {
		return this.configEditor.getAutoApprovalConfig();
	}

	setAutoApprovalConfig(value: AutoApprovalConfig): void {
		this.configEditor.setAutoApprovalConfig(value);
	}

	reload(): void {
		this.configEditor.reload();
	}

	// Helper methods

	/**
	 * Get the current scope
	 */
	getScope(): ConfigScope {
		return this.scope;
	}

	/**
	 * Check if project has an override for a specific field
	 */
	hasProjectOverride(field: keyof ProjectConfigurationData): boolean {
		return projectConfigEditor.hasOverride(field);
	}

	/**
	 * Remove project override for a specific field
	 */
	removeProjectOverride(field: keyof ProjectConfigurationData): void {
		projectConfigEditor.removeOverride(field);
	}

	// Effective value getters (merged: project overrides global)
	// These are useful for displaying the current effective value

	getEffectiveShortcuts(): ShortcutConfig {
		return (
			projectConfigEditor.getShortcuts() ||
			globalConfigEditor.getShortcuts() ||
			DEFAULT_SHORTCUTS
		);
	}

	getEffectiveStatusHooks(): StatusHookConfig {
		return (
			projectConfigEditor.getStatusHooks() ||
			globalConfigEditor.getStatusHooks() ||
			{}
		);
	}

	getEffectiveWorktreeHooks(): WorktreeHookConfig {
		return (
			projectConfigEditor.getWorktreeHooks() ||
			globalConfigEditor.getWorktreeHooks() ||
			{}
		);
	}

	getEffectiveWorktreeConfig(): WorktreeConfig {
		return (
			projectConfigEditor.getWorktreeConfig() ||
			globalConfigEditor.getWorktreeConfig() || {
				autoDirectory: false,
				copySessionData: true,
				sortByLastSession: false,
			}
		);
	}

	getEffectiveCommandPresets(): CommandPresetsConfig {
		return (
			projectConfigEditor.getCommandPresets() ||
			globalConfigEditor.getCommandPresets()
		);
	}

	getEffectiveAutoApprovalConfig(): AutoApprovalConfig {
		const projectConfig = projectConfigEditor.getAutoApprovalConfig();
		if (projectConfig) {
			return {
				...projectConfig,
				timeout: projectConfig.timeout ?? 30,
			};
		}
		return globalConfigEditor.getAutoApprovalConfig();
	}
}

/**
 * Factory function to create a ConfigEditor instance
 */
export function createConfigEditor(scope: ConfigScope): ConfigEditor {
	return new ConfigEditor(scope);
}
