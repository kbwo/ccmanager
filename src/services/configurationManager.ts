import {homedir} from 'os';
import {join} from 'path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {
	ConfigurationData,
	StatusHookConfig,
	ShortcutConfig,
	WorktreeConfig,
	CommandConfig,
	DEFAULT_SHORTCUTS,
} from '../types/index.js';

export class ConfigurationManager {
	private configPath: string;
	private legacyShortcutsPath: string;
	private config: ConfigurationData = {};

	constructor() {
		// Determine config directory based on platform
		const homeDir = homedir();
		const configDir =
			process.platform === 'win32'
				? join(
						process.env['APPDATA'] || join(homeDir, 'AppData', 'Roaming'),
						'ccmanager',
					)
				: join(homeDir, '.config', 'ccmanager');

		// Ensure config directory exists
		if (!existsSync(configDir)) {
			mkdirSync(configDir, {recursive: true});
		}

		this.configPath = join(configDir, 'config.json');
		this.legacyShortcutsPath = join(configDir, 'shortcuts.json');
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
		if (!this.config.worktree) {
			this.config.worktree = {
				autoDirectory: false,
			};
		}
		if (!this.config.command) {
			this.config.command = {
				command: 'claude',
			};
		}
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
		return (
			this.config.command || {
				command: 'claude',
			}
		);
	}

	setCommandConfig(commandConfig: CommandConfig): void {
		this.config.command = commandConfig;
		this.saveConfig();
	}
}

export const configurationManager = new ConfigurationManager();
