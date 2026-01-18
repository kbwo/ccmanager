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
} from '../types/index.js';
import {globalConfigEditor} from './globalConfigEditor.js';
import {projectConfigEditor} from './projectConfigEditor.js';

/**
 * ConfigEditor provides scope-aware configuration editing.
 * The scope is determined at construction time.
 *
 * - When scope='global', uses GlobalConfigEditor singleton
 * - When scope='project', uses ProjectConfigEditor singleton
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
			scope === 'global' ? globalConfigEditor : projectConfigEditor;
	}

	// IConfigEditor implementation - delegates to configEditor with fallback to global

	getShortcuts(): ShortcutConfig | undefined {
		return (
			this.configEditor.getShortcuts() ?? globalConfigEditor.getShortcuts()
		);
	}

	setShortcuts(value: ShortcutConfig): void {
		this.configEditor.setShortcuts(value);
	}

	getStatusHooks(): StatusHookConfig | undefined {
		return (
			this.configEditor.getStatusHooks() ?? globalConfigEditor.getStatusHooks()
		);
	}

	setStatusHooks(value: StatusHookConfig): void {
		this.configEditor.setStatusHooks(value);
	}

	getWorktreeHooks(): WorktreeHookConfig | undefined {
		return (
			this.configEditor.getWorktreeHooks() ??
			globalConfigEditor.getWorktreeHooks()
		);
	}

	setWorktreeHooks(value: WorktreeHookConfig): void {
		this.configEditor.setWorktreeHooks(value);
	}

	getWorktreeConfig(): WorktreeConfig | undefined {
		return (
			this.configEditor.getWorktreeConfig() ??
			globalConfigEditor.getWorktreeConfig()
		);
	}

	setWorktreeConfig(value: WorktreeConfig): void {
		this.configEditor.setWorktreeConfig(value);
	}

	getCommandPresets(): CommandPresetsConfig | undefined {
		return (
			this.configEditor.getCommandPresets() ??
			globalConfigEditor.getCommandPresets()
		);
	}

	setCommandPresets(value: CommandPresetsConfig): void {
		this.configEditor.setCommandPresets(value);
	}

	getAutoApprovalConfig(): AutoApprovalConfig | undefined {
		return (
			this.configEditor.getAutoApprovalConfig() ??
			globalConfigEditor.getAutoApprovalConfig()
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
		return projectConfigEditor.hasOverride(field);
	}

	/**
	 * Remove project override for a specific field
	 */
	removeProjectOverride(field: keyof ProjectConfigurationData): void {
		projectConfigEditor.removeOverride(field);
	}
}

/**
 * Factory function to create a ConfigEditor instance
 */
export function createConfigEditor(scope: ConfigScope): ConfigEditor {
	return new ConfigEditor(scope);
}
