/**
 * @internal
 * This module is for internal use within the config directory only.
 * External code should use ConfigEditor or ConfigReader instead.
 */
import {homedir} from 'os';
import {join} from 'path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {
	ConfigurationData,
	StatusHookConfig,
	WorktreeHookConfig,
	ShortcutConfig,
	WorktreeConfig,
	CommandPreset,
	CommandPresetsConfig,
	DEFAULT_SHORTCUTS,
	IConfigEditor,
} from '../../types/index.js';

export class GlobalConfigManager implements IConfigEditor {
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
				sortByLastSession: false,
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
		if (
			!Object.prototype.hasOwnProperty.call(
				this.config.worktree,
				'sortByLastSession',
			)
		) {
			this.config.worktree.sortByLastSession = false;
		}
		if (!this.config.autoApproval) {
			this.config.autoApproval = {
				enabled: false,
				timeout: 30,
			};
		} else {
			if (
				!Object.prototype.hasOwnProperty.call(
					this.config.autoApproval,
					'enabled',
				)
			) {
				this.config.autoApproval.enabled = false;
			}
			if (
				!Object.prototype.hasOwnProperty.call(
					this.config.autoApproval,
					'timeout',
				)
			) {
				this.config.autoApproval.timeout = 30;
			}
		}

		// Migrate legacy command config to presets if needed
		this.ensureDefaultPresets();
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
			const jsonData = JSON.stringify(this.config, null, 2);
			writeFileSync(this.configPath, jsonData);
			// Re-parse to ensure in-memory state matches what was written to disk
			this.config = JSON.parse(jsonData);
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

	getAutoApprovalConfig(): NonNullable<ConfigurationData['autoApproval']> {
		const config = this.config.autoApproval || {
			enabled: false,
		};
		// Default timeout to 30 seconds if not set
		return {
			...config,
			timeout: config.timeout ?? 30,
		};
	}

	setAutoApprovalConfig(
		autoApproval: NonNullable<ConfigurationData['autoApproval']>,
	): void {
		this.config.autoApproval = autoApproval;
		this.saveConfig();
	}

	private ensureDefaultPresets(): void {
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
			this.ensureDefaultPresets();
		}
		return this.config.commandPresets!;
	}

	setCommandPresets(presets: CommandPresetsConfig): void {
		this.config.commandPresets = presets;
		this.saveConfig();
	}

	/**
	 * Reload configuration from disk
	 */
	reload(): void {
		this.loadConfig();
	}
}

export const globalConfigManager = new GlobalConfigManager();
