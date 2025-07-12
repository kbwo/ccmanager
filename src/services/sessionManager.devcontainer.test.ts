import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {SessionManager} from './sessionManager.js';
import {spawn, IPty} from 'node-pty';
import {exec, ExecException} from 'child_process';
import {DevcontainerConfig} from '../types/index.js';
import {configurationManager} from './configurationManager.js';

// Mock modules
vi.mock('node-pty');
vi.mock('child_process');
type ExecCallback = (
	error: ExecException | null,
	stdout: string,
	stderr: string,
) => void;
type ExecFunction = (
	cmd: string,
	options: {cwd?: string},
	callback: ExecCallback,
) => void;

vi.mock('util', () => ({
	promisify: vi.fn((fn: ExecFunction) => {
		return (cmd: string, options: {cwd?: string}) => {
			return new Promise<{stdout: string; stderr: string}>(
				(resolve, reject) => {
					const callback: ExecCallback = (err, stdout, stderr) => {
						if (err) {
							reject(err);
						} else {
							resolve({stdout, stderr});
						}
					};
					// Call the original function with the promisified callback
					fn(cmd, options, callback);
				},
			);
		};
	}),
}));
vi.mock('./configurationManager.js', () => ({
	configurationManager: {
		getCommandConfig: vi.fn(() => ({
			command: 'claude',
			args: [],
		})),
		getDefaultPreset: vi.fn(() => ({
			id: 'claude',
			name: 'Claude',
			command: 'claude',
			args: [],
		})),
		getPresetById: vi.fn((id: string) => {
			if (id === 'claude-with-args') {
				return {
					id: 'claude-with-args',
					name: 'Claude with Args',
					command: 'claude',
					args: ['-m', 'claude-3-opus'],
				};
			}
			return null;
		}),
	},
}));

vi.mock('./worktreeService.js', () => ({
	WorktreeService: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);
const mockExec = vi.mocked(exec);

describe('SessionManager - Devcontainer Integration', () => {
	let sessionManager: SessionManager;
	let mockPty: IPty;

	beforeEach(() => {
		vi.clearAllMocks();
		sessionManager = new SessionManager();

		// Mock PTY process
		mockPty = {
			onData: vi.fn(),
			onExit: vi.fn(),
			write: vi.fn(),
			resize: vi.fn(),
			kill: vi.fn(),
			pid: 12345,
			cols: 80,
			rows: 24,
			process: 'claude',
		} as unknown as IPty;

		mockSpawn.mockReturnValue(mockPty);
	});

	afterEach(() => {
		sessionManager.destroy();
	});

	describe('createSessionWithDevcontainer', () => {
		const devcontainerConfig: DevcontainerConfig = {
			upCommand: 'devcontainer up --workspace-folder .',
			execCommand: 'devcontainer exec --workspace-folder .',
		};

		it('should execute devcontainer up command before creating session', async () => {
			type MockExecParams = Parameters<typeof exec>;
			mockExec.mockImplementation(
				(
					cmd: MockExecParams[0],
					options: MockExecParams[1],
					callback?: MockExecParams[2],
				) => {
					if (typeof options === 'function') {
						callback = options as MockExecParams[2];
						options = undefined;
					}
					if (callback && typeof callback === 'function') {
						callback(null, 'Container started', '');
					}
					return {} as ReturnType<typeof exec>;
				},
			);

			await sessionManager.createSessionWithDevcontainer(
				'/test/worktree',
				devcontainerConfig,
			);

			expect(mockExec).toHaveBeenCalledWith(
				devcontainerConfig.upCommand,
				{cwd: '/test/worktree'},
				expect.any(Function),
			);
		});

		it('should spawn process with devcontainer exec command', async () => {
			type MockExecParams = Parameters<typeof exec>;
			mockExec.mockImplementation(
				(
					cmd: MockExecParams[0],
					options: MockExecParams[1],
					callback?: MockExecParams[2],
				) => {
					if (typeof options === 'function') {
						callback = options as MockExecParams[2];
						options = undefined;
					}
					if (callback && typeof callback === 'function') {
						callback(null, 'Container started', '');
					}
					return {} as ReturnType<typeof exec>;
				},
			);

			await sessionManager.createSessionWithDevcontainer(
				'/test/worktree',
				devcontainerConfig,
			);

			// Should spawn with devcontainer exec command
			expect(mockSpawn).toHaveBeenCalledWith(
				'devcontainer',
				['exec', '--workspace-folder', '.', '--', 'claude'],
				expect.objectContaining({
					cwd: '/test/worktree',
				}),
			);
		});

		it('should handle devcontainer up command failure', async () => {
			type MockExecParams = Parameters<typeof exec>;
			mockExec.mockImplementation(
				(
					cmd: MockExecParams[0],
					options: MockExecParams[1],
					callback?: MockExecParams[2],
				) => {
					if (typeof options === 'function') {
						callback = options as MockExecParams[2];
						options = undefined;
					}
					if (callback && typeof callback === 'function') {
						callback(
							new Error('Failed to start container'),
							'',
							'Container error',
						);
					}
					return {} as ReturnType<typeof exec>;
				},
			);

			await expect(
				sessionManager.createSessionWithDevcontainer(
					'/test/worktree',
					devcontainerConfig,
				),
			).rejects.toThrow(
				'Failed to start devcontainer: Failed to start container',
			);
		});

		it('should use preset with devcontainer', async () => {
			type MockExecParams = Parameters<typeof exec>;
			mockExec.mockImplementation(
				(
					cmd: MockExecParams[0],
					options: MockExecParams[1],
					callback?: MockExecParams[2],
				) => {
					if (typeof options === 'function') {
						callback = options as MockExecParams[2];
						options = undefined;
					}
					if (callback && typeof callback === 'function') {
						callback(null, 'Container started', '');
					}
					return {} as ReturnType<typeof exec>;
				},
			);

			await sessionManager.createSessionWithDevcontainer(
				'/test/worktree',
				devcontainerConfig,
				'custom-preset',
			);

			// Should call createSessionWithPreset internally
			const session = sessionManager.getSession('/test/worktree');
			expect(session).toBeDefined();
			expect(session?.devcontainerConfig).toEqual(devcontainerConfig);
		});

		it('should parse exec command and append preset command', async () => {
			type MockExecParams = Parameters<typeof exec>;
			mockExec.mockImplementation(
				(
					cmd: MockExecParams[0],
					options: MockExecParams[1],
					callback?: MockExecParams[2],
				) => {
					if (typeof options === 'function') {
						callback = options as MockExecParams[2];
						options = undefined;
					}
					if (callback && typeof callback === 'function') {
						callback(null, 'Container started', '');
					}
					return {} as ReturnType<typeof exec>;
				},
			);

			const config: DevcontainerConfig = {
				upCommand: 'devcontainer up --workspace-folder /path/to/project',
				execCommand:
					'devcontainer exec --workspace-folder /path/to/project --user vscode',
			};

			await sessionManager.createSessionWithDevcontainer(
				'/test/worktree',
				config,
			);

			expect(mockSpawn).toHaveBeenCalledWith(
				'devcontainer',
				[
					'exec',
					'--workspace-folder',
					'/path/to/project',
					'--user',
					'vscode',
					'--',
					'claude',
				],
				expect.any(Object),
			);
		});

		it('should handle preset with args in devcontainer', async () => {
			type MockExecParams = Parameters<typeof exec>;
			mockExec.mockImplementation(
				(
					cmd: MockExecParams[0],
					options: MockExecParams[1],
					callback?: MockExecParams[2],
				) => {
					if (typeof options === 'function') {
						callback = options as MockExecParams[2];
						options = undefined;
					}
					if (callback && typeof callback === 'function') {
						callback(null, 'Container started', '');
					}
					return {} as ReturnType<typeof exec>;
				},
			);

			vi.mocked(configurationManager.getPresetById).mockReturnValue({
				id: 'claude-with-args',
				name: 'Claude with Args',
				command: 'claude',
				args: ['-m', 'claude-3-opus'],
			});

			await sessionManager.createSessionWithDevcontainer(
				'/test/worktree',
				devcontainerConfig,
				'claude-with-args',
			);

			expect(mockSpawn).toHaveBeenCalledWith(
				'devcontainer',
				[
					'exec',
					'--workspace-folder',
					'.',
					'--',
					'claude',
					'-m',
					'claude-3-opus',
				],
				expect.any(Object),
			);
		});
	});
});
