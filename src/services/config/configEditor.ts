import {
	ConfigScope,
	ProjectConfigurationData,
	ShortcutConfig,
	StatusHookConfig,
	WorktreeHookConfig,
	WorktreeConfig,
	CommandPresetsConfig,
	MergeConfig,
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
		const globalConfig = globalConfigManager.getShortcuts();
		const scopedConfig = this.configEditor.getShortcuts();

		return {
			...globalConfig,
			...(scopedConfig || {}),
		};
	}

	setShortcuts(value: ShortcutConfig): void {
		this.configEditor.setShortcuts(value);
	}

	getStatusHooks(): StatusHookConfig | undefined {
		const globalConfig = globalConfigManager.getStatusHooks();
		const scopedConfig = this.configEditor.getStatusHooks();

		return {
			...globalConfig,
			...(scopedConfig || {}),
		};
	}

	setStatusHooks(value: StatusHookConfig): void {
		this.configEditor.setStatusHooks(value);
	}

	getWorktreeHooks(): WorktreeHookConfig | undefined {
		const globalConfig = globalConfigManager.getWorktreeHooks();
		const scopedConfig = this.configEditor.getWorktreeHooks();

		return {
			...globalConfig,
			...(scopedConfig || {}),
		};
	}

	setWorktreeHooks(value: WorktreeHookConfig): void {
		this.configEditor.setWorktreeHooks(value);
	}

	getWorktreeConfig(): WorktreeConfig | undefined {
		const globalConfig = globalConfigManager.getWorktreeConfig();
		const scopedConfig = this.configEditor.getWorktreeConfig();

		// Merge: global config is the base, scoped config fields override
		// This ensures explicit false values in project config take priority
		return {
			...globalConfig,
			...(scopedConfig || {}),
		};
	}

	setWorktreeConfig(value: WorktreeConfig): void {
		this.configEditor.setWorktreeConfig(value);
	}

	getCommandPresets(): CommandPresetsConfig | undefined {
		const globalConfig = globalConfigManager.getCommandPresets();
		const scopedConfig = this.configEditor.getCommandPresets();

		return {
			...globalConfig,
			...(scopedConfig || {}),
		};
	}

	setCommandPresets(value: CommandPresetsConfig): void {
		this.configEditor.setCommandPresets(value);
	}

	getMergeConfig(): MergeConfig | undefined {
		const globalConfig = globalConfigManager.getMergeConfig();
		const scopedConfig = this.configEditor.getMergeConfig();

		if (!globalConfig && !scopedConfig) return undefined;

		return {
			...(globalConfig || {}),
			...(scopedConfig || {}),
		};
	}

	setMergeConfig(value: MergeConfig): void {
		this.configEditor.setMergeConfig(value);
	}

	getAutoApprovalConfig(): AutoApprovalConfig | undefined {
		const globalConfig = globalConfigManager.getAutoApprovalConfig();
		const scopedConfig = this.configEditor.getAutoApprovalConfig();

		return {
			...globalConfig,
			...(scopedConfig || {}),
		};
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
