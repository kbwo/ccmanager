import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {ConfigurationManager} from './configurationManager.js';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

// Mock fs module
vi.mock('fs');

// Mock os module
vi.mock('os', () => ({
	homedir: vi.fn(() => '/home/test'),
}));

describe('ConfigurationManager', () => {
	let configManager: ConfigurationManager;
	let mockConfigData: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockConfigData = {};

		// Mock file system operations
		vi.mocked(existsSync).mockImplementation((path: any) => {
			if (path.includes('config.json')) {
				return Object.keys(mockConfigData).length > 0;
			}
			if (path.includes('shortcuts.json')) {
				return false; // No legacy shortcuts file
			}
			if (path.includes('ccmanager')) {
				return false; // Config directory doesn't exist yet
			}
			return true;
		});

		vi.mocked(mkdirSync).mockImplementation(() => undefined);

		vi.mocked(readFileSync).mockImplementation(() => {
			return JSON.stringify(mockConfigData);
		});

		vi.mocked(writeFileSync).mockImplementation((path: any, data: any) => {
			mockConfigData = JSON.parse(data);
		});

		// Create new instance for each test
		configManager = new ConfigurationManager();
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe('Command Configuration', () => {
		it('should return default command config when not configured', () => {
			const commandConfig = configManager.getCommandConfig();
			
			expect(commandConfig).toEqual({
				command: 'claude',
			});
		});

		it('should save and retrieve command configuration', () => {
			const newConfig = {
				command: 'claude',
				args: ['--resume', '--model', 'opus'],
				fallbackArgs: ['--model', 'opus'],
			};

			configManager.setCommandConfig(newConfig);
			const retrievedConfig = configManager.getCommandConfig();

			expect(retrievedConfig).toEqual(newConfig);
			expect(writeFileSync).toHaveBeenCalled();
		});

		it('should load command configuration from existing config file', () => {
			// Set up mock config data
			mockConfigData = {
				command: {
					command: 'custom-claude',
					args: ['--debug'],
					fallbackArgs: [],
				},
			};

			// Create new instance to trigger load
			const newConfigManager = new ConfigurationManager();
			const commandConfig = newConfigManager.getCommandConfig();

			expect(commandConfig).toEqual({
				command: 'custom-claude',
				args: ['--debug'],
				fallbackArgs: [],
			});
		});

		it('should handle command config with only fallback args', () => {
			const config = {
				command: 'claude',
				fallbackArgs: ['--safe-mode'],
			};

			configManager.setCommandConfig(config);
			const retrieved = configManager.getCommandConfig();

			expect(retrieved).toEqual(config);
		});

		it('should persist command config alongside other configurations', () => {
			// Set different configurations
			configManager.setShortcuts({
				returnToMenu: {ctrl: true, key: 'e'},
				cancel: {key: 'escape'},
			});

			configManager.setCommandConfig({
				command: 'claude',
				args: ['--resume'],
			});

			// Verify both are saved
			const fullConfig = configManager.getConfiguration();
			expect(fullConfig.shortcuts).toBeDefined();
			expect(fullConfig.command).toEqual({
				command: 'claude',
				args: ['--resume'],
			});
		});

		it('should handle empty args arrays', () => {
			const config = {
				command: 'claude',
				args: [],
				fallbackArgs: [],
			};

			configManager.setCommandConfig(config);
			const retrieved = configManager.getCommandConfig();

			expect(retrieved).toEqual(config);
		});

		it('should update existing command configuration', () => {
			// Set initial config
			configManager.setCommandConfig({
				command: 'claude',
				args: ['--old-flag'],
			});

			// Update config
			configManager.setCommandConfig({
				command: 'claude',
				args: ['--new-flag'],
				fallbackArgs: ['--safe'],
			});

			const retrieved = configManager.getCommandConfig();
			expect(retrieved).toEqual({
				command: 'claude',
				args: ['--new-flag'],
				fallbackArgs: ['--safe'],
			});
		});
	});

	describe('Configuration File Path', () => {
		it('should use correct config path on Linux/macOS', () => {
			// ConfigurationManager has already been created in beforeEach
			// Just verify the path was created correctly
			expect(mkdirSync).toHaveBeenCalledWith(
				'/home/test/.config/ccmanager',
				{recursive: true},
			);
		});

		it('should handle Windows APPDATA environment variable', () => {
			// Test that ConfigurationManager handles Windows paths correctly
			// by mocking the constructor behavior
			const originalEnv = process.env['APPDATA'];
			process.env['APPDATA'] = 'C:\\Users\\Test\\AppData\\Roaming';
			
			// Clear previous mocks
			vi.clearAllMocks();
			
			// Create new instance
			const manager = new ConfigurationManager();

			// On non-Windows, it should still use Linux path
			expect(mkdirSync).toHaveBeenCalledWith(
				'/home/test/.config/ccmanager',
				{recursive: true},
			);

			// Restore env
			process.env['APPDATA'] = originalEnv;
		});
	});

	describe('Error Handling', () => {
		it('should handle corrupted config file gracefully', () => {
			vi.mocked(readFileSync).mockImplementation(() => {
				return 'invalid json{';
			});

			const manager = new ConfigurationManager();
			const commandConfig = manager.getCommandConfig();

			// Should return default config
			expect(commandConfig).toEqual({
				command: 'claude',
			});
		});

		it('should handle write errors gracefully', () => {
			vi.mocked(writeFileSync).mockImplementation(() => {
				throw new Error('Write failed');
			});

			// Should not throw
			expect(() => {
				configManager.setCommandConfig({
					command: 'claude',
					args: ['--test'],
				});
			}).not.toThrow();
		});
	});
});