import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {SessionManager} from './sessionManager.js';
import {configurationManager} from './configurationManager.js';
import {spawn} from 'node-pty';
import {EventEmitter} from 'events';

// Mock node-pty
vi.mock('node-pty');

// Mock configuration manager
vi.mock('./configurationManager.js', () => ({
	configurationManager: {
		getCommandConfig: vi.fn(),
		getStatusHooks: vi.fn(() => ({})),
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
	onExit = vi.fn((callback: () => void) => {
		this.on('exit', callback);
	});
}

describe('SessionManager', () => {
	let sessionManager: SessionManager;
	let mockPty: MockPty;

	beforeEach(() => {
		vi.clearAllMocks();
		sessionManager = new SessionManager();
		mockPty = new MockPty();
	});

	afterEach(() => {
		sessionManager.destroy();
	});

	describe('createSession with command configuration', () => {
		it('should create session with default command when no args configured', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as any);

			// Create session
			const session = await sessionManager.createSession('/test/worktree');

			// Verify spawn was called with correct arguments
			expect(spawn).toHaveBeenCalledWith('claude', [], {
				name: 'xterm-color',
				cols: expect.any(Number),
				rows: expect.any(Number),
				cwd: '/test/worktree',
				env: process.env,
			});

			expect(session).toBeDefined();
			expect(session.worktreePath).toBe('/test/worktree');
		});

		it('should create session with configured arguments', async () => {
			// Setup mock configuration with args
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
				args: ['--resume', '--model', 'opus'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as any);

			// Create session
			const session = await sessionManager.createSession('/test/worktree');

			// Verify spawn was called with configured arguments
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--resume', '--model', 'opus'],
				expect.objectContaining({
					cwd: '/test/worktree',
				}),
			);

			expect(session).toBeDefined();
		});

		it('should use fallback args when main command exits early', async () => {
			// Setup mock configuration with fallback
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
				args: ['--invalid-flag'],
				fallbackArgs: ['--resume'],
			});

			// First spawn attempt - exits early
			const firstMockPty = new MockPty();
			// Second spawn attempt - succeeds
			const secondMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(firstMockPty as any)
				.mockReturnValueOnce(secondMockPty as any);

			// Start creating session
			const sessionPromise = sessionManager.createSession('/test/worktree');

			// Simulate early exit on first attempt
			setTimeout(() => {
				firstMockPty.emit('exit');
			}, 100);

			// Wait for session creation
			const session = await sessionPromise;

			// Verify both spawn attempts
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				1,
				'claude',
				['--invalid-flag'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'claude',
				['--resume'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			expect(session).toBeDefined();
			expect(firstMockPty.kill).toHaveBeenCalled();
		});

		it('should throw error when spawn fails and no fallback configured', async () => {
			// Setup mock configuration without fallback
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
				args: ['--invalid-flag'],
			});

			// Mock spawn to throw error
			vi.mocked(spawn).mockImplementation(() => {
				throw new Error('spawn failed');
			});

			// Expect createSession to throw
			await expect(
				sessionManager.createSession('/test/worktree'),
			).rejects.toThrow('Failed to spawn claude');
		});

		it('should handle custom command configuration', async () => {
			// Setup mock configuration with custom command
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'my-custom-claude',
				args: ['--config', '/path/to/config'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as any);

			// Create session
			const session = await sessionManager.createSession('/test/worktree');

			// Verify spawn was called with custom command
			expect(spawn).toHaveBeenCalledWith(
				'my-custom-claude',
				['--config', '/path/to/config'],
				expect.objectContaining({
					cwd: '/test/worktree',
				}),
			);

			expect(session).toBeDefined();
		});

		it('should not use fallback if main command succeeds', async () => {
			// Setup mock configuration with fallback
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
				args: ['--resume'],
				fallbackArgs: ['--other-flag'],
			});

			// Setup spawn mock - process doesn't exit early
			vi.mocked(spawn).mockReturnValue(mockPty as any);

			// Create session
			const session = await sessionManager.createSession('/test/worktree');

			// Wait a bit to ensure no early exit
			await new Promise(resolve => setTimeout(resolve, 600));

			// Verify only one spawn attempt
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--resume'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			expect(session).toBeDefined();
		});

		it('should return existing session if already created', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as any);

			// Create session twice
			const session1 = await sessionManager.createSession('/test/worktree');
			const session2 = await sessionManager.createSession('/test/worktree');

			// Should return the same session
			expect(session1).toBe(session2);
			// Spawn should only be called once
			expect(spawn).toHaveBeenCalledTimes(1);
		});

		it('should throw error when spawn fails with fallback args', async () => {
			// Setup mock configuration with fallback
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'nonexistent-command',
				args: ['--flag1'],
				fallbackArgs: ['--flag2'],
			});

			// Mock spawn to always throw error
			vi.mocked(spawn).mockImplementation(() => {
				throw new Error('Command not found');
			});

			// Expect createSession to throw the original error
			await expect(
				sessionManager.createSession('/test/worktree'),
			).rejects.toThrow('Command not found');

			// Verify spawn was attempted with fallback (first attempt caught in try-catch)
			expect(spawn).toHaveBeenCalledTimes(2);
		});
	});

	describe('session lifecycle', () => {
		it('should destroy session and clean up resources', async () => {
			// Setup
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as any);

			// Create and destroy session
			const session = await sessionManager.createSession('/test/worktree');
			sessionManager.destroySession('/test/worktree');

			// Verify cleanup
			expect(mockPty.kill).toHaveBeenCalled();
			expect(sessionManager.getSession('/test/worktree')).toBeUndefined();
		});

		it('should handle session exit event', async () => {
			// Setup
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as any);

			// Track session exit event
			let exitedSession: any = null;
			sessionManager.on('sessionExit', session => {
				exitedSession = session;
			});

			// Create session
			const session = await sessionManager.createSession('/test/worktree');

			// Simulate process exit after successful creation
			setTimeout(() => {
				mockPty.emit('exit');
			}, 600); // After early exit timeout

			// Wait for exit event
			await new Promise(resolve => setTimeout(resolve, 700));

			expect(exitedSession).toBe(session);
			expect(sessionManager.getSession('/test/worktree')).toBeUndefined();
		});
	});
});