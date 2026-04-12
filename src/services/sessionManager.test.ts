import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {Effect, Either} from 'effect';
import {ValidationError} from '../types/errors.js';
import {spawn, type IPty} from './bunTerminal.js';
import {EventEmitter} from 'events';
import {Session, DevcontainerConfig} from '../types/index.js';
import {spawn as childSpawn} from 'child_process';

// Helper to create a mock child process for child_process.spawn
function createMockChildProcess(exitCode = 0) {
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const proc = Object.assign(new EventEmitter(), {stdout, stderr});
	// Emit 'close' asynchronously so listeners can be attached
	process.nextTick(() => proc.emit('close', exitCode));
	return proc;
}

// Mock bunTerminal
vi.mock('./bunTerminal.js', () => ({
	spawn: vi.fn(function () {
		return null;
	}),
}));

// Mock child_process
vi.mock('child_process', () => ({
	spawn: vi.fn(function () {
		return createMockChildProcess(0);
	}),
	exec: vi.fn(),
	execFile: vi.fn(),
}));

// Mock configuration manager
vi.mock('./config/configReader.js', () => ({
	configReader: {
		getStatusHooks: vi.fn(() => ({})),
		getDefaultPreset: vi.fn(),
		getPresetByIdEffect: vi.fn(),
		isAutoApprovalEnabled: vi.fn(() => false),
		setAutoApprovalEnabled: vi.fn(),
	},
}));

vi.mock('@xterm/addon-serialize', () => ({
	SerializeAddon: vi.fn().mockImplementation(function () {
		return {
			serialize: vi.fn(() => ''),
			activate: vi.fn(),
			dispose: vi.fn(),
		};
	}),
}));

// Mock Terminal
vi.mock('@xterm/headless', () => ({
	default: {
		Terminal: vi.fn(function () {
			const normalBuffer = {
				type: 'normal',
				baseY: 0,
				cursorY: 0,
				cursorX: 0,
				length: 0,
				getLine: vi.fn(function () {
					return null;
				}),
			};
			return {
				rows: 24,
				cols: 80,
				buffer: {
					active: normalBuffer,
					normal: normalBuffer,
					alternate: {
						type: 'alternate',
						baseY: 0,
						cursorY: 0,
						cursorX: 0,
						length: 0,
						getLine: vi.fn(function () {
							return null;
						}),
					},
				},
				loadAddon: vi.fn(function () {
					return undefined;
				}),
				resize: vi.fn(function () {
					return undefined;
				}),
				write: vi.fn(function () {
					return undefined;
				}),
			};
		}),
	},
}));

// Mock worktreeService
vi.mock('./worktreeService.js', () => ({
	WorktreeService: vi.fn(function () {
		return {};
	}),
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
	let configReader: typeof import('./config/configReader.js').configReader;

	beforeEach(async () => {
		vi.clearAllMocks();
		// Dynamically import after mocks are set up
		const sessionManagerModule = await import('./sessionManager.js');
		const configManagerModule = await import('./config/configReader.js');
		SessionManager = sessionManagerModule.SessionManager;
		configReader = configManagerModule.configReader;
		sessionManager = new SessionManager();
		mockPty = new MockPty();
	});

	afterEach(() => {
		sessionManager.destroy();
	});

	describe('createSessionWithPresetEffect', () => {
		it('should use default preset when no preset ID specified', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--preset-arg', '--teammate-mode', 'in-process'],
				{
					name: 'xterm-256color',
					cols: expect.any(Number),
					rows: expect.any(Number),
					cwd: '/test/worktree',
					env: process.env,
				},
			);
		});

		it('should use specific preset when ID provided', async () => {
			// Setup mock preset
			vi.mocked(configReader.getPresetByIdEffect).mockReturnValue(
				Either.right({
					id: '2',
					name: 'Development',
					command: 'claude',
					args: ['--resume', '--dev'],
					fallbackArgs: ['--no-mcp'],
				}),
			);

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with specific preset
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree', '2'),
			);

			// Verify getPresetByIdEffect was called with correct ID
			expect(configReader.getPresetByIdEffect).toHaveBeenCalledWith('2');

			// Verify spawn was called with preset config
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--resume', '--dev', '--teammate-mode', 'in-process'],
				{
					name: 'xterm-256color',
					cols: expect.any(Number),
					rows: expect.any(Number),
					cwd: '/test/worktree',
					env: process.env,
				},
			);
		});

		it('passes the initial prompt as the final argument for claude-compatible presets', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--resume'],
				detectionStrategy: 'claude',
			});

			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect(
					'/test/worktree',
					undefined,
					'implement prompt flow',
				),
			);

			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--resume', '--teammate-mode', 'in-process', 'implement prompt flow'],
				expect.any(Object),
			);
			expect(mockPty.write).not.toHaveBeenCalled();
		});

		it('passes the initial prompt with --prompt for opencode presets', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'OpenCode',
				command: 'opencode',
				args: ['run'],
				detectionStrategy: 'opencode',
			});

			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect(
					'/test/worktree',
					undefined,
					'implement prompt flow',
				),
			);

			expect(spawn).toHaveBeenCalledWith(
				'opencode',
				['run', '--prompt', 'implement prompt flow'],
				expect.any(Object),
			);
			expect(mockPty.write).not.toHaveBeenCalled();
		});

		it('should fall back to default preset if specified preset not found', async () => {
			// Setup mocks
			vi.mocked(configReader.getPresetByIdEffect).mockReturnValue(
				Either.left(
					new ValidationError({
						field: 'presetId',
						constraint: 'Preset not found',
						receivedValue: 'invalid',
					}),
				),
			);
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
			expect(configReader.getDefaultPreset).toHaveBeenCalled();
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--teammate-mode', 'in-process'],
				expect.any(Object),
			);
		});

		it('should throw error when spawn fails with preset', async () => {
			// Setup mock preset with fallback
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
				['--bad-flag', '--teammate-mode', 'in-process'],
				expect.any(Object),
			);
		});

		it('should create a new session each time for multi-session support', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session twice - multi-session API creates a new session each time
			const session1 = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			const session2 = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Should return different sessions for multi-session support
			expect(session1).not.toBe(session2);
			expect(session1.worktreePath).toBe(session2.worktreePath);
			// Spawn should be called once per session
			expect(spawn).toHaveBeenCalledTimes(2);
		});

		it('should throw error when spawn fails with fallback args', async () => {
			// Setup mock preset with fallback
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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

		it('should retry the configured command with fallback args when main command exits with code 1', async () => {
			// Setup mock preset with args
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--invalid-flag'],
				fallbackArgs: ['--safe-flag'],
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
				['--invalid-flag', '--teammate-mode', 'in-process'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called with the configured fallback args
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'claude',
				['--safe-flag', '--teammate-mode', 'in-process'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.command).toBe('claude');
			expect(session.fallbackArgs).toEqual(['--safe-flag']);
			expect(session.isPrimaryCommand).toBe(false);
		});

		it('should not use fallback if main command succeeds', async () => {
			// Setup mock preset with fallback
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
				['--resume', '--teammate-mode', 'in-process'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);
		});

		it('should use empty args as fallback when no fallback args specified', async () => {
			// Setup mock preset without fallback args
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
				['--invalid-flag', '--teammate-mode', 'in-process'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called with teammate-mode args
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'claude',
				['--teammate-mode', 'in-process'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.command).toBe('claude');
			expect(session.fallbackArgs).toBeUndefined();
			expect(session.isPrimaryCommand).toBe(false);
		});

		it('should cleanup and emit exit when fallback command also exits with code 1', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'opencode',
				args: ['run', '--bad-flag'],
				fallbackArgs: ['run', '--safe-mode'],
				detectionStrategy: 'opencode',
			});

			const firstMockPty = new MockPty();
			const secondMockPty = new MockPty();
			let exitedSession: Session | null = null;

			vi.mocked(spawn)
				.mockReturnValueOnce(firstMockPty as unknown as IPty)
				.mockReturnValueOnce(secondMockPty as unknown as IPty);

			sessionManager.on('sessionExit', (session: Session) => {
				exitedSession = session;
			});

			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			firstMockPty.emit('exit', {exitCode: 1});
			await new Promise(resolve => setTimeout(resolve, 50));
			secondMockPty.emit('exit', {exitCode: 1});
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'opencode',
				['run', '--safe-mode'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);
			expect(exitedSession).toBe(session);
			expect(
				sessionManager.getSessionsForWorktree('/test/worktree'),
			).toHaveLength(0);
		});

		it('should handle custom command configuration', async () => {
			// Setup mock preset with custom command
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create and destroy session
			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			sessionManager.destroySession(session.id);

			// Verify cleanup
			expect(mockPty.kill).toHaveBeenCalled();
			expect(
				sessionManager.getSessionsForWorktree('/test/worktree'),
			).toHaveLength(0);
		});

		it('should handle session exit event', async () => {
			// Setup
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
			expect(
				sessionManager.getSessionsForWorktree('/test/worktree'),
			).toHaveLength(0);
		});
	});

	describe('createSessionWithDevcontainerEffect', () => {
		beforeEach(() => {
			// Setup childSpawn mock to return a successful mock child process
			vi.mocked(childSpawn).mockImplementation(
				() => createMockChildProcess(0) as ReturnType<typeof childSpawn>,
			);
		});

		it('should execute devcontainer up command before creating session', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
				[
					'exec',
					'--workspace-folder',
					'.',
					'--',
					'claude',
					'--resume',
					'--teammate-mode',
					'in-process',
				],
				expect.objectContaining({cwd: '/test/worktree', rawMode: false}),
			);
		});

		it('should use specific preset when ID provided', async () => {
			// Setup mock preset
			vi.mocked(configReader.getPresetByIdEffect).mockReturnValue(
				Either.right({
					id: '2',
					name: 'Development',
					command: 'claude',
					args: ['--resume', '--dev'],
				}),
			);

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
			expect(configReader.getPresetByIdEffect).toHaveBeenCalledWith('2');
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				[
					'exec',
					'--',
					'claude',
					'--resume',
					'--dev',
					'--teammate-mode',
					'in-process',
				],
				expect.any(Object),
			);
		});

		it('should throw error when devcontainer up fails', async () => {
			// Setup childSpawn to return a process that exits with code 1
			vi.mocked(childSpawn).mockImplementation(
				() => createMockChildProcess(1) as ReturnType<typeof childSpawn>,
			);

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
				'Failed to start devcontainer: Command exited with code 1',
			);
		});

		it('should create a new session each time for multi-session support', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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

			// Create session twice - multi-session API creates a new session each time
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

			// Should return different sessions for multi-session support
			expect(session1).not.toBe(session2);
			expect(session1.worktreePath).toBe(session2.worktreePath);
			// spawn should be called once per session
			expect(spawn).toHaveBeenCalledTimes(2);
		});

		it('should handle complex exec commands with multiple arguments', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
					'--teammate-mode',
					'in-process',
				],
				expect.any(Object),
			);
		});

		it('should spawn process with devcontainer exec command', async () => {
			// Create a new session manager and reset mocks
			vi.clearAllMocks();
			sessionManager = new SessionManager();

			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: [],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			await Effect.runPromise(
				sessionManager.createSessionWithDevcontainerEffect('/test/worktree2', {
					upCommand: 'devcontainer up --workspace-folder .',
					execCommand: 'devcontainer exec --workspace-folder .',
				}),
			);

			// Should spawn with devcontainer exec command
			expect(spawn).toHaveBeenCalledWith(
				'devcontainer',
				[
					'exec',
					'--workspace-folder',
					'.',
					'--',
					'claude',
					'--teammate-mode',
					'in-process',
				],
				expect.objectContaining({
					cwd: '/test/worktree2',
					rawMode: false,
				}),
			);
		});

		it('should use preset with devcontainer', async () => {
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
			const sessions = sessionManager.getSessionsForWorktree('/test/worktree');
			expect(sessions).toHaveLength(1);
			const session = sessions[0];
			expect(session?.devcontainerConfig).toEqual({
				upCommand: 'devcontainer up --workspace-folder .',
				execCommand: 'devcontainer exec --workspace-folder .',
			});
		});

		it('should parse exec command and append preset command', async () => {
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
					'--teammate-mode',
					'in-process',
				],
				expect.any(Object),
			);
		});

		it('should handle preset with args in devcontainer', async () => {
			vi.mocked(configReader.getPresetByIdEffect).mockReturnValue(
				Either.right({
					id: 'claude-with-args',
					name: 'Claude with Args',
					command: 'claude',
					args: ['-m', 'claude-3-opus'],
				}),
			);

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
					'--teammate-mode',
					'in-process',
				],
				expect.any(Object),
			);
		});

		it('should use empty args as fallback in devcontainer when no fallback args specified', async () => {
			// Setup preset without fallback args
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
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
				[
					'exec',
					'--workspace-folder',
					'.',
					'--',
					'claude',
					'--invalid-flag',
					'--teammate-mode',
					'in-process',
				],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called with teammate-mode args
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'devcontainer',
				[
					'exec',
					'--workspace-folder',
					'.',
					'--',
					'claude',
					'--teammate-mode',
					'in-process',
				],
				expect.objectContaining({cwd: '/test/worktree', rawMode: false}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.isPrimaryCommand).toBe(false);
		});

		it('should retry the configured command with fallback args in devcontainer when primary command exits with code 1', async () => {
			// Setup preset with args
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--bad-flag'],
				fallbackArgs: ['--safe-flag'],
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
				[
					'exec',
					'--workspace-folder',
					'.',
					'--',
					'claude',
					'--bad-flag',
					'--teammate-mode',
					'in-process',
				],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called with the configured fallback args
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'devcontainer',
				[
					'exec',
					'--workspace-folder',
					'.',
					'--',
					'claude',
					'--safe-flag',
					'--teammate-mode',
					'in-process',
				],
				expect.objectContaining({cwd: '/test/worktree', rawMode: false}),
			);

			// Verify session process was replaced
			expect(session.process).toBe(secondMockPty);
			expect(session.isPrimaryCommand).toBe(false);
		});
	});

	describe('session restore snapshots', () => {
		it('should emit a bounded normal-buffer restore snapshot and restore the cursor position', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			const normalBuffer = session.terminal.buffer.normal as unknown as {
				baseY: number;
				length: number;
				cursorY: number;
				cursorX: number;
			};
			normalBuffer.baseY = 260;
			normalBuffer.length = 300;
			normalBuffer.cursorY = 7;
			normalBuffer.cursorX = 11;
			session.restoreScrollbackBaseLine = 120;
			const serializeMock = vi
				.spyOn(session.serializer, 'serialize')
				.mockReturnValue('\u001b[31mrestored\u001b[0m');
			const restoreHandler = vi.fn();
			sessionManager.on('sessionRestore', restoreHandler);

			sessionManager.setSessionActive(session.id, true);

			expect(serializeMock).toHaveBeenCalledWith({
				range: {
					start: 120,
					end: 299,
				},
				excludeAltBuffer: true,
			});
			expect(restoreHandler).toHaveBeenCalledWith(
				session,
				'\u001b[31mrestored\u001b[0m\u001b[8;12H',
			);
		});

		it('should keep viewport-only restore behavior for alternate screen sessions', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			(
				session.terminal.buffer as unknown as {
					active: typeof session.terminal.buffer.alternate;
				}
			).active = session.terminal.buffer.alternate;
			const serializeMock = vi
				.spyOn(session.serializer, 'serialize')
				.mockReturnValue('\u001b[31malt\u001b[0m');
			const restoreHandler = vi.fn();
			sessionManager.on('sessionRestore', restoreHandler);

			sessionManager.setSessionActive(session.id, true);

			expect(serializeMock).toHaveBeenCalledWith({scrollback: 0});
			expect(restoreHandler).toHaveBeenCalledWith(
				session,
				'\u001b[31malt\u001b[0m',
			);
		});

		it('should skip restore event when serialized output is empty', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			vi.spyOn(session.serializer, 'serialize').mockReturnValue('');
			const restoreHandler = vi.fn();
			sessionManager.on('sessionRestore', restoreHandler);

			sessionManager.setSessionActive(session.id, true);

			expect(restoreHandler).not.toHaveBeenCalled();
		});

		it('should reset restore scrollback baseline after a clear-screen sequence', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			(
				session.terminal.buffer.normal as unknown as {
					baseY: number;
				}
			).baseY = 17;

			mockPty.emit('data', '\x1b[2J\x1b[Hfresh');

			expect(session.restoreScrollbackBaseLine).toBe(17);
		});

		it('should flush live session data after the restore snapshot completes', async () => {
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);
			(
				session.terminal.buffer.normal as unknown as {
					length: number;
				}
			).length = 1;
			vi.spyOn(session.serializer, 'serialize').mockReturnValue('restored');
			const eventOrder: string[] = [];

			sessionManager.on('sessionRestore', restoredSession => {
				if (restoredSession.id === session.id) {
					eventOrder.push('restore');
					mockPty.emit('data', 'live-output');
				}
			});
			sessionManager.on('sessionData', activeSession => {
				if (activeSession.id === session.id) {
					eventOrder.push('data');
				}
			});

			sessionManager.setSessionActive(session.id, true);

			expect(eventOrder).toEqual(['restore', 'data']);
		});
	});

	describe('static methods', () => {
		describe('getSessionCounts', () => {
			// Helper to create mock session with stateMutex
			const createMockSession = (
				id: string,
				state: 'idle' | 'busy' | 'waiting_input' | 'pending_auto_approval',
				backgroundTaskCount: number = 0,
				teamMemberCount: number = 0,
			): Partial<Session> => ({
				id,
				stateMutex: {
					getSnapshot: () => ({state, backgroundTaskCount, teamMemberCount}),
				} as Session['stateMutex'],
			});

			it('should count sessions by state', () => {
				const sessions = [
					createMockSession('1', 'idle'),
					createMockSession('2', 'busy'),
					createMockSession('3', 'busy'),
					createMockSession('4', 'waiting_input'),
					createMockSession('5', 'idle'),
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
				const sessions = [
					createMockSession('1', 'busy'),
					createMockSession('2', 'busy'),
					createMockSession('3', 'busy'),
				];

				const counts = SessionManager.getSessionCounts(sessions as Session[]);

				expect(counts.idle).toBe(0);
				expect(counts.busy).toBe(3);
				expect(counts.waiting_input).toBe(0);
				expect(counts.total).toBe(3);
			});

			it('should sum background task counts across sessions', () => {
				const sessions = [
					createMockSession('1', 'idle', 0),
					createMockSession('2', 'busy', 2),
					createMockSession('3', 'busy', 3),
					createMockSession('4', 'waiting_input', 1),
				];

				const counts = SessionManager.getSessionCounts(sessions as Session[]);

				expect(counts.backgroundTasks).toBe(6);
			});

			it('should sum team member counts across sessions', () => {
				const sessions = [
					createMockSession('1', 'idle', 0, 0),
					createMockSession('2', 'busy', 0, 4),
					createMockSession('3', 'busy', 0, 2),
				];

				const counts = SessionManager.getSessionCounts(sessions as Session[]);

				expect(counts.teamMembers).toBe(6);
			});
		});

		describe('formatSessionCounts', () => {
			it('should format counts with all states', () => {
				const counts = {
					idle: 1,
					busy: 2,
					waiting_input: 1,
					pending_auto_approval: 0,
					total: 4,
					backgroundTasks: 0,
					teamMembers: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe(' (1 Idle / 2 Busy / 1 Waiting)');
			});

			it('should format counts with some states', () => {
				const counts = {
					idle: 2,
					busy: 0,
					waiting_input: 1,
					pending_auto_approval: 0,
					total: 3,
					backgroundTasks: 0,
					teamMembers: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe(' (2 Idle / 1 Waiting)');
			});

			it('should format counts with single state', () => {
				const counts = {
					idle: 0,
					busy: 3,
					waiting_input: 0,
					pending_auto_approval: 0,
					total: 3,
					backgroundTasks: 0,
					teamMembers: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe(' (3 Busy)');
			});

			it('should return empty string for zero sessions', () => {
				const counts = {
					idle: 0,
					busy: 0,
					waiting_input: 0,
					pending_auto_approval: 0,
					total: 0,
					backgroundTasks: 0,
					teamMembers: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toBe('');
			});

			it('should append [BG] tag when backgroundTasks is 1', () => {
				const counts = {
					idle: 1,
					busy: 1,
					waiting_input: 0,
					pending_auto_approval: 0,
					total: 2,
					backgroundTasks: 1,
					teamMembers: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toContain('[BG]');
				expect(formatted).toBe(' (1 Idle / 1 Busy \x1b[2m[BG]\x1b[0m)');
			});

			it('should append [BG:N] tag when backgroundTasks is 2+', () => {
				const counts = {
					idle: 1,
					busy: 1,
					waiting_input: 0,
					pending_auto_approval: 0,
					total: 2,
					backgroundTasks: 5,
					teamMembers: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toContain('[BG:5]');
				expect(formatted).toBe(' (1 Idle / 1 Busy \x1b[2m[BG:5]\x1b[0m)');
			});

			it('should not append BG tag when backgroundTasks is 0', () => {
				const counts = {
					idle: 1,
					busy: 1,
					waiting_input: 0,
					pending_auto_approval: 0,
					total: 2,
					backgroundTasks: 0,
					teamMembers: 0,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).not.toContain('[BG');
				expect(formatted).toBe(' (1 Idle / 1 Busy)');
			});

			it('should append [Team:N] tag when teamMembers > 0', () => {
				const counts = {
					idle: 1,
					busy: 1,
					waiting_input: 0,
					pending_auto_approval: 0,
					total: 2,
					backgroundTasks: 0,
					teamMembers: 4,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toContain('[Team:4]');
				expect(formatted).toBe(' (1 Idle / 1 Busy \x1b[2m[Team:4]\x1b[0m)');
			});

			it('should append both [BG] and [Team:N] tags', () => {
				const counts = {
					idle: 1,
					busy: 1,
					waiting_input: 0,
					pending_auto_approval: 0,
					total: 2,
					backgroundTasks: 1,
					teamMembers: 4,
				};

				const formatted = SessionManager.formatSessionCounts(counts);

				expect(formatted).toContain('[BG]');
				expect(formatted).toContain('[Team:4]');
				expect(formatted).toBe(
					' (1 Idle / 1 Busy \x1b[2m[BG]\x1b[0m \x1b[2m[Team:4]\x1b[0m)',
				);
			});
		});
	});
});
