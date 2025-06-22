import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {SessionManager} from './sessionManager.js';
import {configurationManager} from './configurationManager.js';
import {spawn, IPty} from 'node-pty';
import {EventEmitter} from 'events';
import {Session} from '../types/index.js';

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
	onExit = vi.fn(
		(callback: (e: {exitCode: number; signal?: number}) => void) => {
			this.on('exit', callback);
		},
	);
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
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await sessionManager.createSession('/test/worktree');

			// Verify spawn was called with correct arguments
			expect(spawn).toHaveBeenCalledWith('claude', [], {
				name: 'xterm-color',
				cols: expect.any(Number),
				rows: expect.any(Number),
				cwd: '/test/worktree',
				env: process.env,
			});

			// Session creation verified by spawn being called
		});

		it('should create session with configured arguments', async () => {
			// Setup mock configuration with args
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
				args: ['--resume', '--model', 'opus'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await sessionManager.createSession('/test/worktree');

			// Verify spawn was called with configured arguments
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--resume', '--model', 'opus'],
				expect.objectContaining({
					cwd: '/test/worktree',
				}),
			);

			// Session creation verified by spawn being called
		});

		it('should use fallback args when main command exits with code 1', async () => {
			// Setup mock configuration with fallback
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
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
			const session = await sessionManager.createSession('/test/worktree');

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
			).rejects.toThrow('spawn failed');
		});

		it('should handle custom command configuration', async () => {
			// Setup mock configuration with custom command
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'my-custom-claude',
				args: ['--config', '/path/to/config'],
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await sessionManager.createSession('/test/worktree');

			// Verify spawn was called with custom command
			expect(spawn).toHaveBeenCalledWith(
				'my-custom-claude',
				['--config', '/path/to/config'],
				expect.objectContaining({
					cwd: '/test/worktree',
				}),
			);

			// Session creation verified by spawn being called
		});

		it('should not use fallback if main command succeeds', async () => {
			// Setup mock configuration with fallback
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
				args: ['--resume'],
				fallbackArgs: ['--other-flag'],
			});

			// Setup spawn mock - process doesn't exit early
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session
			await sessionManager.createSession('/test/worktree');

			// Wait a bit to ensure no early exit
			await new Promise(resolve => setTimeout(resolve, 600));

			// Verify only one spawn attempt
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--resume'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Session creation verified by spawn being called
		});

		it('should return existing session if already created', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});

			// Setup spawn mock
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

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
		});
	});

	describe('session lifecycle', () => {
		it('should destroy session and clean up resources', async () => {
			// Setup
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create and destroy session
			await sessionManager.createSession('/test/worktree');
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
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Track session exit event
			let exitedSession: Session | null = null;
			sessionManager.on('sessionExit', (session: Session) => {
				exitedSession = session;
			});

			// Create session
			const createdSession =
				await sessionManager.createSession('/test/worktree');

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

	describe('Bash Session Restoration Events', () => {
		it('should emit bashSessionRestore event when bash session becomes active with history', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session and set up bash mode with history
			const session = await sessionManager.createSession('/test/worktree');
			session.currentMode = 'bash';
			session.bashHistory = [
				Buffer.from('$ ls\n'),
				Buffer.from('file1.txt file2.txt\n'),
				Buffer.from('$ pwd\n'),
			];

			// Set up event listener spy
			const bashRestoreEventSpy = vi.fn();
			sessionManager.on('bashSessionRestore', bashRestoreEventSpy);

			// Test: Activate session in bash mode
			sessionManager.setSessionActive('/test/worktree', true);

			// Verify: bashSessionRestore event is emitted
			expect(bashRestoreEventSpy).toHaveBeenCalledWith(session);
			expect(bashRestoreEventSpy).toHaveBeenCalledTimes(1);
		});

		it('should emit sessionRestore event when claude session becomes active with history', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session and set up claude mode with history
			const session = await sessionManager.createSession('/test/worktree');
			session.currentMode = 'claude';
			session.outputHistory = [
				Buffer.from('Claude response 1\n'),
				Buffer.from('Claude response 2\n'),
			];

			// Set up event listener spy
			const claudeRestoreEventSpy = vi.fn();
			sessionManager.on('sessionRestore', claudeRestoreEventSpy);

			// Test: Activate session in claude mode
			sessionManager.setSessionActive('/test/worktree', true);

			// Verify: sessionRestore event is emitted
			expect(claudeRestoreEventSpy).toHaveBeenCalledWith(session);
			expect(claudeRestoreEventSpy).toHaveBeenCalledTimes(1);
		});

		it('should not emit restore events when session has no history', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with empty histories
			const session = await sessionManager.createSession('/test/worktree');
			session.currentMode = 'bash';
			session.bashHistory = [];
			session.outputHistory = [];

			// Set up event listener spies
			const bashRestoreEventSpy = vi.fn();
			const claudeRestoreEventSpy = vi.fn();
			sessionManager.on('bashSessionRestore', bashRestoreEventSpy);
			sessionManager.on('sessionRestore', claudeRestoreEventSpy);

			// Test: Activate session with empty histories
			sessionManager.setSessionActive('/test/worktree', true);

			// Verify: No restore events are emitted
			expect(bashRestoreEventSpy).not.toHaveBeenCalled();
			expect(claudeRestoreEventSpy).not.toHaveBeenCalled();
		});
	});
});
