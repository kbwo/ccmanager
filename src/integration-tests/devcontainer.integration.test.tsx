import {describe, it, expect, vi, beforeEach} from 'vitest';
import {SessionManager} from '../services/sessionManager.js';
import {DevcontainerConfig} from '../types/index.js';
import {spawn, IPty} from 'node-pty';
import {exec, ExecException} from 'child_process';

// Mock modules
vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));
vi.mock('child_process', () => ({
	exec: vi.fn(),
	execFile: vi.fn(),
}));
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

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getDefaultPreset: vi.fn(() => ({
			id: 'claude',
			name: 'Claude',
			command: 'claude',
			args: [],
		})),
		getPresetById: vi.fn(),
	},
}));

vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);
const mockExec = vi.mocked(exec);

describe('Devcontainer Integration', () => {
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

	it('should execute devcontainer up command before creating session', async () => {
		const devcontainerConfig: DevcontainerConfig = {
			upCommand: 'devcontainer up --workspace-folder .',
			execCommand: 'devcontainer exec --workspace-folder .',
		};

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

	it('should handle devcontainer command execution with presets', async () => {
		const devcontainerConfig: DevcontainerConfig = {
			upCommand: 'devcontainer up --workspace-folder .',
			execCommand: 'devcontainer exec --workspace-folder .',
		};

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
});
