import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, mkdirSync, readFileSync, writeFileSync, statSync} from 'fs';
import {execSync} from 'child_process';
import {ConfigurationManager} from './configurationManager.js';
import type {ConfigurationData} from '../types/index.js';
import {Effect} from 'effect';

// Mock fs module
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	statSync: vi.fn(),
}));

// Mock os module
vi.mock('os', () => ({
	homedir: vi.fn(() => '/home/test'),
}));

// Mock child_process module
vi.mock('child_process', () => ({
	execSync: vi.fn(),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
	default: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

describe('ConfigurationManager - Per-Project Config Merge', () => {
	let configManager: ConfigurationManager;
	let globalConfig: ConfigurationData;
	const mockGitRoot = '/path/to/repo';

	beforeEach(() => {
		vi.clearAllMocks();

		// Default global config
		globalConfig = {
			shortcuts: {
				returnToMenu: {ctrl: true, key: 'e'},
				cancel: {key: 'escape'},
			},
			worktree: {
				autoDirectory: false,
				copySessionData: true,
				sortByLastSession: false,
			},
			worktreeHooks: {
				post_creation: {
					command: 'echo "global post-creation"',
					enabled: true,
				},
			},
			statusHooks: {
				waiting_input: {
					command: 'echo "global waiting"',
					enabled: true,
				},
			},
			command: {
				command: 'claude',
				args: ['--global'],
			},
			autoApproval: {
				enabled: false,
				timeout: 30,
			},
		};

		// Mock global config file
		(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				return path.includes('config.json') && !path.includes('.ccmanager.json');
			},
		);

		(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => {
				if (path.includes('config.json') && !path.includes('.ccmanager.json')) {
					return JSON.stringify(globalConfig);
				}
				return '{}';
			},
		);

		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});

		configManager = new ConfigurationManager();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('getMergedConfig', () => {
		it('should return global config when no gitRoot provided', async () => {
			const result = await Effect.runPromise(configManager.getMergedConfig());

			expect(result.worktree?.autoDirectory).toBe(false);
			expect(result.command?.command).toBe('claude');
		});

		it('should return global config when no project config exists', async () => {
			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) return false;
					return path.includes('config.json');
				},
			);

			const result = await Effect.runPromise(
				configManager.getMergedConfig(mockGitRoot),
			);

			expect(result.worktree?.autoDirectory).toBe(false);
			expect(result.command?.command).toBe('claude');
		});

		it('should merge project worktree config with global config', async () => {
			const projectConfig: ConfigurationData = {
				worktree: {
					autoDirectory: true, // Override
					// copySessionData and sortByLastSession not specified - use global
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					return true;
				},
			);

			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const result = await Effect.runPromise(
				configManager.getMergedConfig(mockGitRoot),
			);

			expect(result.worktree?.autoDirectory).toBe(true); // From project
			expect(result.worktree?.copySessionData).toBe(true); // From global
			expect(result.worktree?.sortByLastSession).toBe(false); // From global
		});

		it('should merge worktree hooks from both global and project', async () => {
			const projectConfig: ConfigurationData = {
				worktreeHooks: {
					post_creation: {
						command: 'npm install', // Override global
						enabled: true,
					},
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const result = await Effect.runPromise(
				configManager.getMergedConfig(mockGitRoot),
			);

			expect(result.worktreeHooks?.post_creation?.command).toBe('npm install'); // From project
		});

		it('should merge status hooks from both global and project', async () => {
			const projectConfig: ConfigurationData = {
				statusHooks: {
					busy: {
						command: 'echo "project busy"',
						enabled: true,
					},
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const result = await Effect.runPromise(
				configManager.getMergedConfig(mockGitRoot),
			);

			expect(result.statusHooks?.busy?.command).toBe('echo "project busy"'); // From project
			expect(result.statusHooks?.waiting_input?.command).toBe(
				'echo "global waiting"',
			); // From global
		});

		it('should use project command config when present', async () => {
			const projectConfig: ConfigurationData = {
				command: {
					command: 'claude-dev',
					args: ['--project'],
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const result = await Effect.runPromise(
				configManager.getMergedConfig(mockGitRoot),
			);

			expect(result.command?.command).toBe('claude-dev'); // From project
			expect(result.command?.args).toEqual(['--project']); // From project
		});

		it('should merge auto-approval config', async () => {
			const projectConfig: ConfigurationData = {
				autoApproval: {
					enabled: true, // Override global
					// timeout not specified - use global
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const result = await Effect.runPromise(
				configManager.getMergedConfig(mockGitRoot),
			);

			expect(result.autoApproval?.enabled).toBe(true); // From project
			expect(result.autoApproval?.timeout).toBe(30); // From global
		});
	});

	describe('getWorktreeHooksWithContext', () => {
		it('should return global hooks when no gitRoot provided', () => {
			const hooks = configManager.getWorktreeHooksWithContext();

			expect(hooks.post_creation?.command).toBe('echo "global post-creation"');
		});

		it('should return merged hooks when gitRoot provided', () => {
			const projectConfig: ConfigurationData = {
				worktreeHooks: {
					post_creation: {
						command: 'npm install',
						enabled: true,
					},
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const hooks = configManager.getWorktreeHooksWithContext(mockGitRoot);

			expect(hooks.post_creation?.command).toBe('npm install');
		});
	});

	describe('getWorktreeConfigWithContext', () => {
		it('should return global config when no gitRoot provided', () => {
			const config = configManager.getWorktreeConfigWithContext();

			expect(config.autoDirectory).toBe(false);
		});

		it('should return merged config when gitRoot provided', () => {
			const projectConfig: ConfigurationData = {
				worktree: {
					autoDirectory: true,
					sortByLastSession: true,
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const config = configManager.getWorktreeConfigWithContext(mockGitRoot);

			expect(config.autoDirectory).toBe(true); // From project
			expect(config.sortByLastSession).toBe(true); // From project
			expect(config.copySessionData).toBe(true); // From global
		});
	});

	describe('getStatusHooksWithContext', () => {
		it('should return merged status hooks when gitRoot provided', () => {
			const projectConfig: ConfigurationData = {
				statusHooks: {
					idle: {
						command: 'echo "project idle"',
						enabled: true,
					},
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const hooks = configManager.getStatusHooksWithContext(mockGitRoot);

			expect(hooks.idle?.command).toBe('echo "project idle"'); // From project
			expect(hooks.waiting_input?.command).toBe('echo "global waiting"'); // From global
		});
	});

	describe('getAutoApprovalConfigWithContext', () => {
		it('should return merged auto-approval config when gitRoot provided', () => {
			const projectConfig: ConfigurationData = {
				autoApproval: {
					enabled: true,
					customCommand: 'my-verify',
				},
			};

			(existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => true);
			(statSync as ReturnType<typeof vi.fn>).mockReturnValue({
				mtimeMs: 1234567890,
			});

			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
				(path: string) => {
					if (path.includes('.ccmanager.json')) {
						return JSON.stringify(projectConfig);
					}
					return JSON.stringify(globalConfig);
				},
			);

			const config = configManager.getAutoApprovalConfigWithContext(mockGitRoot);

			expect(config.enabled).toBe(true); // From project
			expect(config.customCommand).toBe('my-verify'); // From project
			expect(config.timeout).toBe(30); // From global
		});
	});
});
