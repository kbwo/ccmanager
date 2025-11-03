import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {Effect} from 'effect';
import {spawn, IPty} from 'node-pty';
import {EventEmitter} from 'events';
import {Session, DevcontainerConfig} from '../types/index.js';
import {exec} from 'child_process';

// Mock node-pty
vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
	exec: vi.fn(),
	execFile: vi.fn(),
}));

// Mock configuration manager
vi.mock('./configurationManager.js', () => ({
	configurationManager: {
		getCommandConfig: vi.fn(),
		getStatusHooks: vi.fn(() => ({})),
		getDefaultPreset: vi.fn(),
		getPresetById: vi.fn(),
		setWorktreeLastOpened: vi.fn(),
		getWorktreeLastOpenedTime: vi.fn(),
		getWorktreeLastOpened: vi.fn(() => ({})),
	},
}));

// Mock Terminal
vi.mock('@xterm/headless', () => ({
	default: {
		Terminal: vi.fn().mockImplementation(() => ({
			buffer: {
				active: {
					length: 0,
					getLine: vi.fn(),
				},
			},
			write: vi.fn(),
		})),
	},
}));

// Mock worktreeService
vi.mock('./worktreeService.js', () => ({
	WorktreeService: vi.fn(),
}));

// Create a mock IPty class
class MockPty extends EventEmitter {
	kill = vi.fn();
	resize = vi.fn();
	write = vi.fn();
	onData = vi.fn((callback: (data: string) => void) => {
		this.on('data', callback);
	});
	onExit = vi.fn(
		(callback: (e: {exitCode: number; signal?: number}) => void) => {
			this.on('exit', callback);
		},
	);
}

describe('SessionManager', () => {
	let sessionManager: import('./sessionManager.js').SessionManager;
	let mockPty: MockPty;
	let SessionManager: typeof import('./sessionManager.js').SessionManager;
	let configurationManager: typeof import('./configurationManager.js').configurationManager;

	beforeEach(async () => {
		vi.clearAllMocks();
		// Dynamically import after mocks are set up
		const sessionManagerModule = await import('./sessionManager.js');
		const configManagerModule = await import('./configurationManager.js');
		SessionManager = sessionManagerModule.SessionManager;
		configurationManager = configManagerModule.configurationManager;
		sessionManager = new SessionManager();
		mockPty = new MockPty();
	});

	afterEach(() => {
		sessionManager.destroy();
	});

	describe('createSessionWithPresetEffect', () => {
		it('should use default preset when no preset ID specified', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--preset-arg'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with preset
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Verify spawn was called with preset config
			expect(spawn).toHaveBeenCalledWith('claude', ['--preset-arg'], {
				name: 'xterm-256color',
				cols: expect.any(Number),
				rows: expect.any(Number),
				cwd: '/test/worktree',
				env: process.env,
			});
		});

		it('should use specific preset when ID provided', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getPresetById).mockReturnValue({
				id: '2',
				name: 'Development',
				command: 'claude',
				args: ['--resume', '--dev'],
				fallbackArgs: ['--no-mcp'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with specific preset
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree', '2'),
			);

			// Verify getPresetById was called with correct ID
			expect(configurationManager.getPresetById).toHaveBeenCalledWith('2');

			// Verify spawn was called with preset config
			expect(spawn).toHaveBeenCalledWith('claude', ['--resume', '--dev'], {
				name: 'xterm-256color',
				cols: expect.any(Number),
				rows: expect.any(Number),
				cwd: '/test/worktree',
				env: process.env,
			});
		});

		it('should fall back to default preset if specified preset not found', async () => {
			// Setup mocks
			vi.mocked(configurationManager.getPresetById).mockReturnValue(undefined);
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with non-existent preset
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect(
					'/test/worktree',
					'invalid',
				),
			);

			// Verify fallback to default preset
			expect(configurationManager.getDefaultPreset).toHaveBeenCalled();
			expect(spawn).toHaveBeenCalledWith('claude', [], expect.any(Object));
		});

		it('should throw error when spawn fails with preset', async () => {
			// Setup mock preset with fallback
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--bad-flag'],
				fallbackArgs: ['--good-flag'],
			});

			// Mock spawn to fail
			vi.mocked(spawn).mockImplementation(() => {
				throw new Error('Command failed');
			});

			// Expect createSessionWithPresetEffect to throw
			await expect(
				Effect.runPromise(
					sessionManager.createSessionWithPresetEffect('/test/worktree'),
				),
			).rejects.toThrow('Command failed');

			// Verify only one spawn attempt was made
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--bad-flag'],
				expect.any(Object),
			);
		});

		it('should return existing session if already created', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session twice
			const session1 = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			const session2 = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Should return the same session
			expect(session1).toBe(session2);
			// Spawn should only be called once
			expect(spawn).toHaveBeenCalledTimes(1);
		});

		it('should throw error when spawn fails with fallback args', async () => {
			// Setup mock preset with fallback
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'nonexistent-command',
				args: ['--flag1'],
				fallbackArgs: ['--flag2'],
			});

			// Mock spawn to always throw error
			vi.mocked(spawn).mockImplementation(() => {
				throw new Error('Command not found');
			});

			// Expect createSessionWithPresetEffect to throw the original error
			await expect(
				Effect.runPromise(
					sessionManager.createSessionWithPresetEffect('/test/worktree'),
				),
			).rejects.toThrow('Command not found');
		});

		it('should use fallback args when main command exits with code 1', async () => {
			// Setup mock preset with fallback
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--invalid-flag'],
				fallbackArgs: ['--resume'],
			});

			// First spawn attempt - will exit with code 1
			const firstMockPty = new MockPty();
			// Second spawn attempt - succeeds
			const secondMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(firstMockPty as unknown as IPty)
				.mockReturnValueOnce(secondMockPty as unknown as IPty);

			// Create session
			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Verify initial spawn
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--invalid-flag'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'claude',
				['--resume'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.isPrimaryCommand).toBe(false);
		});

		it('should not use fallback if main command succeeds', async () => {
			// Setup mock preset with fallback
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--resume'],
				fallbackArgs: ['--other-flag'],
			});

			// Setup spawn mock - process doesn't exit early
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Wait a bit to ensure no early exit
			await new Promise(resolve => setTimeout(resolve, 600));

			// Verify only one spawn attempt
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--resume'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);
		});

		it('should use empty args as fallback when no fallback args specified', async () => {
			// Setup mock preset without fallback args
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--invalid-flag'],
				// No fallbackArgs
			});

			// First spawn attempt - will exit with code 1
			const firstMockPty = new MockPty();
			// Second spawn attempt - succeeds
			const secondMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(firstMockPty as unknown as IPty)
				.mockReturnValueOnce(secondMockPty as unknown as IPty);

			// Create session
			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Verify initial spawn
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--invalid-flag'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called with empty args
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'claude',
				[], // Empty args
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.isPrimaryCommand).toBe(false);
		});

		it('should handle custom command configuration', async () => {
			// Setup mock preset with custom command
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'my-custom-claude',
				args: ['--config', '/path/to/config'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Verify spawn was called with custom command
			expect(spawn).toHaveBeenCalledWith(
				'my-custom-claude',
				['--config', '/path/to/config'],
				expect.objectContaining({
					cwd: '/test/worktree',
				}),
			);
		});

		it('should throw error when spawn fails and no fallback configured', async () => {
			// Setup mock preset without fallback
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--invalid-flag'],
			});

			// Mock spawn to throw error
			vi.mocked(spawn).mockImplementation(() => {
				throw new Error('spawn failed');
			});

			// Expect createSessionWithPreset to throw
			await expect(
				Effect.runPromise(
					sessionManager.createSessionWithPresetEffect('/test/worktree'),
				),
			).rejects.toThrow('spawn failed');
		});
	});

	describe('session lifecycle', () => {
		it('should destroy session and clean up resources', async () => {
			// Setup
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create and destroy session
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			sessionManager.destroySession('/test/worktree');

			// Verify cleanup
			expect(mockPty.kill).toHaveBeenCalled();
			expect(sessionManager.getSession('/test/worktree')).toBeUndefined();
		});

		it('should handle session exit event', async () => {
			// Setup
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Track session exit event
			let exitedSession: Session | null = null;
			sessionManager.on('sessionExit', (session: Session) => {
				exitedSession = session;
			});

			// Create session
			const createdSession = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Simulate process exit after successful creation
			setTimeout(() => {
				mockPty.emit('exit', {exitCode: 0});
			}, 600); // After early exit timeout

			// Wait for exit event
			await new Promise(resolve => setTimeout(resolve, 700));

			expect(exitedSession).toBe(createdSession);
			expect(sessionManager.getSession('/test/worktree')).toBeUndefined();
		});
	});

	describe('createSessionWithDevcontainerEffect', () => {
		beforeEach(() => {
			// Reset shouldFail flag
			const mockExec = vi.mocked(exec) as ReturnType<typeof vi.fn> & {
				shouldFail?: boolean;
			};
			mockExec.shouldFail = false;

			// Setup exec mock to work with promisify
			mockExec.mockImplementation(((...args: unknown[]) => {
				const [command, , callback] = args as [
					string,
					unknown,
					((err: Error | null, stdout?: string, stderr?: string) => void)?,
				];
				if (callback) {
					// Handle callback style
					if (command.includes('devcontainer up')) {
						if (mockExec.shouldFail) {
							callback(new Error('Container startup failed'));
						} else {
							callback(null, '', '');
						}
					}
				}
			}) as Parameters<typeof mockExec.mockImplementation>[0]);
		});

		it('should execute devcontainer up command before creating session', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--resume'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with devcontainer
			const devcontainerConfig = {
				upCommand: 'devcontainer up --workspace-folder .',
				execCommand: 'devcontainer exec --workspace-folder .',
			};

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					devcontainerConfig,
				),
			);

			// Verify spawn was called correctly which proves devcontainer up succeeded

			// Verify spawn was called with devcontainer exec
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				['exec', '--workspace-folder', '.', '--', 'claude', '--resume'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);
		});

		it('should use specific preset when ID provided', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getPresetById).mockReturnValue({
				id: '2',
				name: 'Development',
				command: 'claude',
				args: ['--resume', '--dev'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with devcontainer and specific preset
			const devcontainerConfig = {
				upCommand: 'devcontainer up',
				execCommand: 'devcontainer exec',
			};

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					devcontainerConfig,
					'2',
				),
			);

			// Verify correct preset was used
			expect(configurationManager.getPresetById).toHaveBeenCalledWith('2');
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				['exec', '--', 'claude', '--resume', '--dev'],
				expect.any(Object),
			);
		});

		it('should throw error when devcontainer up fails', async () => {
			// Setup exec to fail
			const mockExec = vi.mocked(exec) as ReturnType<typeof vi.fn> & {
				shouldFail?: boolean;
			};
			mockExec.shouldFail = true;

			// Create session with devcontainer
			const devcontainerConfig = {
				upCommand: 'devcontainer up',
				execCommand: 'devcontainer exec',
			};

			await expect(
				Effect.runPromise(
					sessionManager.createSessionWithDevcontainerEffect(
						'/test/worktree',
						devcontainerConfig,
					),
				),
			).rejects.toThrow(
				'Failed to start devcontainer: Container startup failed',
			);
		});

		it('should return existing session if already created', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			const devcontainerConfig = {
				upCommand: 'devcontainer up',
				execCommand: 'devcontainer exec',
			};

			// Create session twice
			const session1 = await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					devcontainerConfig,
				),
			);
			const session2 = await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					devcontainerConfig,
				),
			);

			// Should return the same session
			expect(session1).toBe(session2);
			// spawn should only be called once
			expect(spawn).toHaveBeenCalledTimes(1);
		});

		it('should handle complex exec commands with multiple arguments', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--model', 'opus'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with complex exec command
			const devcontainerConfig = {
				upCommand: 'devcontainer up --workspace-folder . --log-level debug',
				execCommand:
					'devcontainer exec --workspace-folder . --container-name mycontainer',
			};

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					devcontainerConfig,
				),
			);

			// Verify spawn was called with properly parsed exec command
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				[
					'exec',
					'--workspace-folder',
					'.',
					'--container-name',
					'mycontainer',
					'--',
					'claude',
					'--model',
					'opus',
				],
				expect.any(Object),
			);
		});

		it('should spawn process with devcontainer exec command', async () => {
			// Create a new session manager and reset mocks
			vi.clearAllMocks();
			sessionManager = new SessionManager();

			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: [],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			type MockExecParams = Parameters<typeof exec>;
			const mockExec = vi.mocked(exec);
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

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect('/test/worktree2', {
					upCommand: 'devcontainer up --workspace-folder .',
					execCommand: 'devcontainer exec --workspace-folder .',
				}),
			);

			// Should spawn with devcontainer exec command
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				['exec', '--workspace-folder', '.', '--', 'claude'],
				expect.objectContaining({
					cwd: '/test/worktree2',
				}),
			);
		});

		it('should use preset with devcontainer', async () => {
			type MockExecParams = Parameters<typeof exec>;
			const mockExec = vi.mocked(exec);
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

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					{
						upCommand: 'devcontainer up --workspace-folder .',
						execCommand: 'devcontainer exec --workspace-folder .',
					},
					'custom-preset',
				),
			);

			// Should call createSessionWithPreset internally
			const session = sessionManager.getSession('/test/worktree');
			expect(session).toBeDefined();
			expect(session?.devcontainerConfig).toEqual({
				upCommand: 'devcontainer up --workspace-folder .',
				execCommand: 'devcontainer exec --workspace-folder .',
			});
		});

		it('should parse exec command and append preset command', async () => {
			type MockExecParams = Parameters<typeof exec>;
			const mockExec = vi.mocked(exec);
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

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					config,
				),
			);

			expect(spawn).toHaveBeenCalledWith(
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
			const mockExec = vi.mocked(exec);
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

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect(
					'/test/worktree',
					{
						upCommand: 'devcontainer up --workspace-folder .',
						execCommand: 'devcontainer exec --workspace-folder .',
					},
					'claude-with-args',
				),
			);

			expect(spawn).toHaveBeenCalledWith(
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

		it('should use empty args as fallback in devcontainer when no fallback args specified', async () => {
			// Setup exec mock for devcontainer up
			type MockExecParams = Parameters<typeof exec>;
			const mockExec = vi.mocked(exec);
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

			// Setup preset without fallback args
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--invalid-flag'],
				// No fallbackArgs
			});

			// First spawn attempt - will exit with code 1
			const firstMockPty = new MockPty();
			// Second spawn attempt - succeeds
			const secondMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(firstMockPty as unknown as IPty)
				.mockReturnValueOnce(secondMockPty as unknown as IPty);

			const session = await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect('/test/worktree', {
					upCommand: 'devcontainer up --workspace-folder .',
					execCommand: 'devcontainer exec --workspace-folder .',
				}),
			);

			// Verify initial spawn
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				['exec', '--workspace-folder', '.', '--', 'claude', '--invalid-flag'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called with empty args
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'devcontainer',
				['exec', '--workspace-folder', '.', '--', 'claude'], // No args after claude
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.isPrimaryCommand).toBe(false);
		});

		it('should use fallback args in devcontainer when primary command exits with code 1', async () => {
			// Setup exec mock for devcontainer up
			type MockExecParams = Parameters<typeof exec>;
			const mockExec = vi.mocked(exec);
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

			// Setup preset with fallback
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--bad-flag'],
				fallbackArgs: ['--good-flag'],
			});

			// First spawn attempt - will exit with code 1
			const firstMockPty = new MockPty();
			// Second spawn attempt - succeeds
			const secondMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(firstMockPty as unknown as IPty)
				.mockReturnValueOnce(secondMockPty as unknown as IPty);

			const session = await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect('/test/worktree', {
					upCommand: 'devcontainer up --workspace-folder .',
					execCommand: 'devcontainer exec --workspace-folder .',
				}),
			);

			// Verify initial spawn
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				['exec', '--workspace-folder', '.', '--', 'claude', '--bad-flag'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'devcontainer',
				['exec', '--workspace-folder', '.', '--', 'claude', '--good-flag'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.isPrimaryCommand).toBe(false);
		});
	});

	describe('static methods', () => {
		describe('getSessionCounts', () => {
			it('should count sessions by state', () => {
				const sessions: Partial<Session>[] = [
					{id: '1', state: 'idle'},
					{id: '2', state: 'busy'},
					{id: '3', state: 'busy'},
					{id: '4', state: 'waiting_input'},
					{id: '5', state: 'idle'},
				];

				const counts = SessionManager.getSessionCounts(sessions as Session[]);

				expect(counts.idle).toBe(2);
				expect(counts.busy).toBe(2);
				expect(counts.waiting_input).toBe(1);
				expect(counts.total).toBe(5);
			});

			it('should handle empty sessions array', () => {
				const counts = SessionManager.getSessionCounts([]);

				expect(counts.idle).toBe(0);
				expect(counts.busy).toBe(0);
				expect(counts.waiting_input).toBe(0);
				expect(counts.total).toBe(0);
			});

			it('should handle sessions with single state', () => {
				const sessions: Partial<Session>[] = [
					{id: '1', state: 'busy'},
					{id: '2', state: 'busy'},
					{id: '3', state: 'busy'},
				];

				const counts = SessionManager.getSessionCounts(sessions as Session[]);

				expect(counts.idle).toBe(0);
				expect(counts.busy).toBe(3);
				expect(counts.waiting_input).toBe(0);
				expect(counts.total).toBe(3);
			});
		});

		describe('formatSessionCounts', () => {
			it('should format counts with all states', () => {
				const counts = {
					idle: 1,
					busy: 2,
					waiting_input: 1,
					total: 4,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe(' (1 Idle / 2 Busy / 1 Waiting)');
			});

			it('should format counts with some states', () => {
				const counts = {
					idle: 2,
					busy: 0,
					waiting_input: 1,
					total: 3,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe(' (2 Idle / 1 Waiting)');
			});

			it('should format counts with single state', () => {
				const counts = {
					idle: 0,
					busy: 3,
					waiting_input: 0,
					total: 3,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe(' (3 Busy)');
			});

			it('should return empty string for zero sessions', () => {
				const counts = {
					idle: 0,
					busy: 0,
					waiting_input: 0,
					total: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe('');
			});
		});
	});
});
