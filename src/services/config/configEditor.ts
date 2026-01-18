import {
	ConfigScope,
	ProjectConfigurationData,
	ShortcutConfig,
	StatusHookConfig,
	WorktreeHookConfig,
	WorktreeConfig,
	CommandPresetsConfig,
	IConfigEditor,
	AutoApprovalConfig,
} from '../../types/index.js';
import {globalConfigManager} from './globalConfigManager.js';
import {projectConfigManager} from './projectConfigManager.js';

/**
 * ConfigEditor provides scope-aware configuration editing.
 * The scope is determined at construction time.
 *
 * - When scope='global', uses GlobalConfigManager singleton
 * - When scope='project', uses ProjectConfigManager singleton
 *   (with fallback to global if project value is undefined)
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
			scope === 'global' ? globalConfigManager : projectConfigManager;
	}

	// IConfigEditor implementation - delegates to configEditor with fallback to global

	getShortcuts(): ShortcutConfig | undefined {
		return (
			this.configEditor.getShortcuts() ?? globalConfigManager.getShortcuts()
		);
	}

	setShortcuts(value: ShortcutConfig): void {
		this.configEditor.setShortcuts(value);
	}

	getStatusHooks(): StatusHookConfig | undefined {
		return (
			this.configEditor.getStatusHooks() ?? globalConfigManager.getStatusHooks()
		);
	}

	setStatusHooks(value: StatusHookConfig): void {
		this.configEditor.setStatusHooks(value);
	}

	getWorktreeHooks(): WorktreeHookConfig | undefined {
		return (
			this.configEditor.getWorktreeHooks() ??
			globalConfigManager.getWorktreeHooks()
		);
	}

	setWorktreeHooks(value: WorktreeHookConfig): void {
		this.configEditor.setWorktreeHooks(value);
	}

	getWorktreeConfig(): WorktreeConfig | undefined {
		return (
			this.configEditor.getWorktreeConfig() ??
			globalConfigManager.getWorktreeConfig()
		);
	}

	setWorktreeConfig(value: WorktreeConfig): void {
		this.configEditor.setWorktreeConfig(value);
	}

	getCommandPresets(): CommandPresetsConfig | undefined {
		return (
			this.configEditor.getCommandPresets() ??
			globalConfigManager.getCommandPresets()
		);
	}

	setCommandPresets(value: CommandPresetsConfig): void {
		this.configEditor.setCommandPresets(value);
	}

	getAutoApprovalConfig(): AutoApprovalConfig | undefined {
		return (
			this.configEditor.getAutoApprovalConfig() ??
			globalConfigManager.getAutoApprovalConfig()
		);
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
		return projectConfigManager.hasOverride(field);
	}

	/**
	 * Remove project override for a specific field
	 */
	removeProjectOverride(field: keyof ProjectConfigurationData): void {
		projectConfigManager.removeOverride(field);
	}
}

/**
 * Factory function to create a ConfigEditor instance
 */
export function createConfigEditor(scope: ConfigScope): ConfigEditor {
	return new ConfigEditor(scope);
}
