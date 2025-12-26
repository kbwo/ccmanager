import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {Effect, Either} from 'effect';
import {spawn, IPty} from 'node-pty';
import {EventEmitter} from 'events';
import {DevcontainerConfig, CommandPreset} from '../types/index.js';

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

	describe('createSessionWithPreset returning Effect', () => {
		it('should return Effect that succeeds with Session', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
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
			// Setup mocks - both return null/undefined
			vi.mocked(configurationManager.getPresetById).mockReturnValue(undefined);
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue(
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
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
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

		it('should return existing session without creating new Effect', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session twice
			const effect1 =
				sessionManager.createSessionWithPresetEffect('/test/worktree');
			const session1 = await Effect.runPromise(effect1);

			const effect2 =
				sessionManager.createSessionWithPresetEffect('/test/worktree');
			const session2 = await Effect.runPromise(effect2);

			// Should return the same session
			expect(session1).toBe(session2);
			// Spawn should only be called once
			expect(spawn).toHaveBeenCalledTimes(1);
		});
	});

	describe('createSessionWithDevcontainer returning Effect', () => {
		it('should return Effect that succeeds with Session', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--resume'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Mock exec to succeed
			const {exec} = await import('child_process');
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
					}
					if (callback && typeof callback === 'function') {
						callback(null, 'Container started', '');
					}
					return {} as ReturnType<typeof exec>;
				},
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

			// Execute the Effect and verify it succeeds with a Session
			const session = await Effect.runPromise(effect);

			expect(session).toBeDefined();
			expect(session.worktreePath).toBe('/test/worktree');
			expect(session.devcontainerConfig).toEqual(devcontainerConfig);
		});

		it('should return Effect that fails with ProcessError when devcontainer up fails', async () => {
			// Mock exec to fail
			const {exec} = await import('child_process');
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
					}
					if (callback && typeof callback === 'function') {
						callback(new Error('Container failed to start'), '', '');
					}
					return {} as ReturnType<typeof exec>;
				},
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
					expect(result.left.message).toContain('Container failed');
				}
			}
		});

		it('should return Effect that fails with ConfigError when preset not found', async () => {
			// Setup mocks - both return null/undefined
			vi.mocked(configurationManager.getPresetById).mockReturnValue(undefined);
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue(
				undefined as unknown as CommandPreset,
			);

			// Mock exec to succeed (devcontainer up)
			const {exec} = await import('child_process');
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
					}
					if (callback && typeof callback === 'function') {
						callback(null, 'Container started', '');
					}
					return {} as ReturnType<typeof exec>;
				},
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
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Terminate session - should return Effect
			const effect = sessionManager.terminateSessionEffect('/test/worktree');

			// Execute the Effect and verify it succeeds
			await Effect.runPromise(effect);

			// Verify session was destroyed
			expect(sessionManager.getSession('/test/worktree')).toBeUndefined();
			expect(mockPty.kill).toHaveBeenCalled();
		});

		it('should return Effect that fails with ProcessError when session does not exist', async () => {
			// Terminate non-existent session - should return Effect
			const effect = sessionManager.terminateSessionEffect(
				'/nonexistent/worktree',
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
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
			});

			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await Effect.runPromise(
				sessionManager.createSessionWithPresetEffect('/test/worktree'),
			);

			// Mock kill to throw error
			mockPty.kill.mockImplementation(() => {
				throw new Error('Process already terminated');
			});

			// Terminate session - should still succeed
			const effect = sessionManager.terminateSessionEffect('/test/worktree');

			// Should not throw, gracefully handle kill failure
			await Effect.runPromise(effect);

			// Session should still be removed from map
			expect(sessionManager.getSession('/test/worktree')).toBeUndefined();
		});
	});
});
