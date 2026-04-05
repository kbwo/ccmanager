import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {Effect, Either} from 'effect';
import {spawn, type IPty} from './bunTerminal.js';
import {EventEmitter} from 'events';
import {DevcontainerConfig, CommandPreset} from '../types/index.js';
import {ValidationError} from '../types/errors.js';

// Mock bunTerminal
vi.mock('./bunTerminal.js', () => ({
	spawn: vi.fn(function () {
		return null;
	}),
}));

// Helper to create a mock child process for child_process.spawn
function createMockChildProcess(exitCode = 0) {
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const proc = Object.assign(new EventEmitter(), {stdout, stderr});
	process.nextTick(() => proc.emit('close', exitCode));
	return proc;
}

// Mock child_process
vi.mock('child_process', () => ({
	spawn: vi.fn(() => createMockChildProcess(0)),
	exec: vi.fn(),
	execFile: vi.fn(),
}));

// Mock configuration manager
vi.mock('./config/configReader.js', () => ({
	configReader: {
		getDefaultPreset: vi.fn(),
		getPresetByIdEffect: vi.fn(),
		isAutoApprovalEnabled: vi.fn(() => false),
		setAutoApprovalEnabled: vi.fn(),
		getStatusHooks: vi.fn(() => ({})),
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
		Terminal: vi.fn().mockImplementation(function () {
			return {
				rows: 24,
				cols: 80,
				buffer: {
					active: {
						type: 'normal',
						baseY: 0,
						length: 0,
						getLine: vi.fn(),
					},
				},
				loadAddon: vi.fn(),
				resize: vi.fn(),
				write: vi.fn(),
			};
		}),
	},
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

describe('SessionManager Effect-based Operations', () => {
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

	describe('createSessionWithPreset returning Effect', () => {
		it('should return Effect that succeeds with Session', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--preset-arg'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with preset - should return Effect
			const effect =
				sessionManager.createSessionWithPresetEffect('/test/worktree');

			// Execute the Effect and verify it succeeds with a Session
			const session = await Effect.runPromise(effect);

			expect(session).toBeDefined();
			expect(session.worktreePath).toBe('/test/worktree');
			expect(session.stateMutex.getSnapshot().state).toBe('busy');
		});

		it('should return Effect that fails with ConfigError when preset not found', async () => {
			// Setup mocks - getPresetByIdEffect returns Left, getDefaultPreset returns undefined
			vi.mocked(configReader.getPresetByIdEffect).mockReturnValue(
				Either.left(
					new ValidationError({
						field: 'presetId',
						constraint: 'Preset not found',
						receivedValue: 'invalid-preset',
					}),
				),
			);
			vi.mocked(configReader.getDefaultPreset).mockReturnValue(
				undefined as unknown as CommandPreset,
			);

			// Create session with non-existent preset - should return Effect
			const effect = sessionManager.createSessionWithPresetEffect(
				'/test/worktree',
				'invalid-preset',
			);

			// Execute the Effect and expect it to fail with ConfigError
			const result = await Effect.runPromise(Effect.either(effect));

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ConfigError');
				if (result.left._tag === 'ConfigError') {
					expect(result.left.reason).toBe('validation');
					expect(result.left.details).toContain('preset');
				}
			}
		});

		it('should return Effect that fails with ProcessError when spawn fails', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'invalid-command',
				args: ['--arg'],
			});

			// Mock spawn to throw error
			vi.mocked(spawn).mockImplementation(() => {
				throw new Error('spawn ENOENT: command not found');
			});

			// Create session - should return Effect
			const effect =
				sessionManager.createSessionWithPresetEffect('/test/worktree');

			// Execute the Effect and expect it to fail with ProcessError
			const result = await Effect.runPromise(Effect.either(effect));

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ProcessError');
				if (result.left._tag === 'ProcessError') {
					expect(result.left.command).toContain('createSessionWithPreset');
					expect(result.left.message).toContain('spawn');
				}
			}
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
			const effect1 =
				sessionManager.createSessionWithPresetEffect('/test/worktree');
			const session1 = await Effect.runPromise(effect1);

			const effect2 =
				sessionManager.createSessionWithPresetEffect('/test/worktree');
			const session2 = await Effect.runPromise(effect2);

			// Should return different sessions for multi-session support
			expect(session1).not.toBe(session2);
			expect(session1.worktreePath).toBe(session2.worktreePath);
			// Spawn should be called once per session
			expect(spawn).toHaveBeenCalledTimes(2);
		});
	});

	describe('createSessionWithDevcontainer returning Effect', () => {
		it('should return Effect that succeeds with Session', async () => {
			// Setup mock preset
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--resume'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			const devcontainerConfig: DevcontainerConfig = {
				upCommand: 'devcontainer up --workspace-folder .',
				execCommand: 'devcontainer exec --workspace-folder .',
			};

			// Create session with devcontainer - should return Effect
			const effect = sessionManager.createSessionWithDevcontainerEffect(
				'/test/worktree',
				devcontainerConfig,
			);

			// Execute the Effect and verify it succeeds with a Session
			const session = await Effect.runPromise(effect);

			expect(session).toBeDefined();
			expect(session.worktreePath).toBe('/test/worktree');
			expect(session.devcontainerConfig).toEqual(devcontainerConfig);
		});

		it('should return Effect that fails with ProcessError when devcontainer up fails', async () => {
			// Mock spawn to return a process that exits with code 1
			const {spawn: childSpawn} = await import('child_process');
			vi.mocked(childSpawn).mockImplementation(
				() => createMockChildProcess(1) as ReturnType<typeof childSpawn>,
			);

			const devcontainerConfig: DevcontainerConfig = {
				upCommand: 'devcontainer up --workspace-folder .',
				execCommand: 'devcontainer exec --workspace-folder .',
			};

			// Create session with devcontainer - should return Effect
			const effect = sessionManager.createSessionWithDevcontainerEffect(
				'/test/worktree',
				devcontainerConfig,
			);

			// Execute the Effect and expect it to fail with ProcessError
			const result = await Effect.runPromise(Effect.either(effect));

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ProcessError');
				if (result.left._tag === 'ProcessError') {
					expect(result.left.command).toContain('devcontainer up');
					expect(result.left.message).toContain('Command exited with code 1');
				}
			}
		});

		it('should return Effect that fails with ConfigError when preset not found', async () => {
			// Reset childSpawn mock to succeed (devcontainer up should pass)
			const {spawn: childSpawn} = await import('child_process');
			vi.mocked(childSpawn).mockImplementation(
				() => createMockChildProcess(0) as ReturnType<typeof childSpawn>,
			);

			// Setup mocks - getPresetByIdEffect returns Left, getDefaultPreset returns undefined
			vi.mocked(configReader.getPresetByIdEffect).mockReturnValue(
				Either.left(
					new ValidationError({
						field: 'presetId',
						constraint: 'Preset not found',
						receivedValue: 'invalid-preset',
					}),
				),
			);
			vi.mocked(configReader.getDefaultPreset).mockReturnValue(
				undefined as unknown as CommandPreset,
			);

			const devcontainerConfig: DevcontainerConfig = {
				upCommand: 'devcontainer up',
				execCommand: 'devcontainer exec',
			};

			// Create session with invalid preset
			const effect = sessionManager.createSessionWithDevcontainerEffect(
				'/test/worktree',
				devcontainerConfig,
				'invalid-preset',
			);

			// Execute the Effect and expect it to fail with ConfigError
			const result = await Effect.runPromise(Effect.either(effect));

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ConfigError');
			}
		});
	});

	describe('terminateSession returning Effect', () => {
		it('should return Effect that succeeds when session exists', async () => {
			// Setup mock preset and create a session first
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Terminate session - should return Effect
			const effect = sessionManager.terminateSessionEffect(session.id);

			// Execute the Effect and verify it succeeds
			await Effect.runPromise(effect);

			// Verify session was destroyed
			expect(
				sessionManager.getSessionsForWorktree('/test/worktree'),
			).toHaveLength(0);
			expect(mockPty.kill).toHaveBeenCalled();
		});

		it('should return Effect that fails with ProcessError when session does not exist', async () => {
			// Terminate non-existent session - should return Effect
			const effect = sessionManager.terminateSessionEffect(
				'nonexistent-session-id',
			);

			// Execute the Effect and expect it to fail with ProcessError
			const result = await Effect.runPromise(Effect.either(effect));

			expect(Either.isLeft(result)).toBe(true);
			if (Either.isLeft(result)) {
				expect(result.left._tag).toBe('ProcessError');
				expect(result.left.message).toContain('Session not found');
			}
		});

		it('should return Effect that succeeds even when process kill fails', async () => {
			// Setup mock preset and create a session
			vi.mocked(configReader.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			const session = await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Mock kill to throw error
			mockPty.kill.mockImplementation(() => {
				throw new Error('Process already terminated');
			});

			// Terminate session - should still succeed
			const effect = sessionManager.terminateSessionEffect(session.id);

			// Should not throw, gracefully handle kill failure
			await Effect.runPromise(effect);

			// Session should still be removed from map
			expect(
				sessionManager.getSessionsForWorktree('/test/worktree'),
			).toHaveLength(0);
		});
	});
});
