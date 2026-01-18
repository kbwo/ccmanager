/**
 * @internal
 * This module is for internal use within the config directory only.
 * External code should use ConfigEditor or ConfigReader instead.
 */
import {existsSync, readFileSync, writeFileSync, unlinkSync} from 'fs';
import {join} from 'path';
import {
	ProjectConfigurationData,
	ShortcutConfig,
	StatusHookConfig,
	WorktreeHookConfig,
	WorktreeConfig,
	CommandPresetsConfig,
	IConfigEditor,
	AutoApprovalConfig,
} from '../../types/index.js';

const PROJECT_CONFIG_FILENAME = '.ccmanager.json';

/**
 * ProjectConfigManager handles project-specific configuration.
 * Reads/writes from `<projectPath>/.ccmanager.json`.
 * Implements IConfigEditor for consistent API with GlobalConfigManager.
 */
export class ProjectConfigManager implements IConfigEditor {
	private projectPath: string;
	private projectConfigPath: string;
	private projectConfig: ProjectConfigurationData | null = null;

	constructor(projectPath?: string) {
		this.projectPath = projectPath || process.cwd();
		this.projectConfigPath = join(this.projectPath, PROJECT_CONFIG_FILENAME);
		this.loadProjectConfig();
	}

	private loadProjectConfig(): void {
		if (existsSync(this.projectConfigPath)) {
			try {
				const data = readFileSync(this.projectConfigPath, 'utf-8');
				this.projectConfig = JSON.parse(data);
			} catch {
				this.projectConfig = null;
			}
		} else {
			this.projectConfig = null;
		}
	}

	private saveProjectConfig(): void {
		if (this.projectConfig === null) {
			return;
		}
		try {
			const jsonData = JSON.stringify(this.projectConfig, null, 2);
			writeFileSync(this.projectConfigPath, jsonData);
			// Re-parse to ensure in-memory state matches what was written to disk
			this.projectConfig = JSON.parse(jsonData);
		} catch {
			// Silently fail - error handling can be added later
		}
	}

	private ensureProjectConfig(): ProjectConfigurationData {
		if (this.projectConfig === null) {
			this.projectConfig = {};
		}
		return this.projectConfig;
	}

	// IConfigEditor implementation

	getShortcuts(): ShortcutConfig | undefined {
		return this.projectConfig?.shortcuts;
	}

	setShortcuts(value: ShortcutConfig): void {
		const config = this.ensureProjectConfig();
		config.shortcuts = value;
		this.saveProjectConfig();
	}

	getStatusHooks(): StatusHookConfig | undefined {
		return this.projectConfig?.statusHooks;
	}

	setStatusHooks(value: StatusHookConfig): void {
		const config = this.ensureProjectConfig();
		config.statusHooks = value;
		this.saveProjectConfig();
	}

	getWorktreeHooks(): WorktreeHookConfig | undefined {
		return this.projectConfig?.worktreeHooks;
	}

	setWorktreeHooks(value: WorktreeHookConfig): void {
		const config = this.ensureProjectConfig();
		config.worktreeHooks = value;
		this.saveProjectConfig();
	}

	getWorktreeConfig(): WorktreeConfig | undefined {
		return this.projectConfig?.worktree;
	}

	setWorktreeConfig(value: WorktreeConfig): void {
		const config = this.ensureProjectConfig();
		config.worktree = value;
		this.saveProjectConfig();
	}

	getCommandPresets(): CommandPresetsConfig | undefined {
		return this.projectConfig?.commandPresets;
	}

	setCommandPresets(value: CommandPresetsConfig): void {
		const config = this.ensureProjectConfig();
		config.commandPresets = value;
		this.saveProjectConfig();
	}

	getAutoApprovalConfig(): AutoApprovalConfig | undefined {
		return this.projectConfig?.autoApproval;
	}

	setAutoApprovalConfig(value: AutoApprovalConfig): void {
		const config = this.ensureProjectConfig();
		config.autoApproval = value;
		this.saveProjectConfig();
	}

	reload(): void {
		this.loadProjectConfig();
	}

	// Project-specific helper methods

	/**
	 * Check if a specific field has a project-level override
	 */
	hasOverride(field: keyof ProjectConfigurationData): boolean {
		if (this.projectConfig === null) {
			return false;
		}
		return this.projectConfig[field] !== undefined;
	}

	/**
	 * Remove a project-level override for a specific field
	 */
	removeOverride(field: keyof ProjectConfigurationData): void {
		if (this.projectConfig === null) {
			return;
		}
		delete this.projectConfig[field];

		// If project config is now empty, delete the file
		if (Object.keys(this.projectConfig).length === 0) {
			this.projectConfig = null;
			try {
				if (existsSync(this.projectConfigPath)) {
					unlinkSync(this.projectConfigPath);
				}
			} catch {
				// Silently fail
			}
		} else {
			this.saveProjectConfig();
		}
	}
}

/**
 * Default singleton instance using current working directory
 */
export const projectConfigManager = new ProjectConfigManager();
