import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {SessionManager} from './sessionManager.js';
import {configurationManager} from './configurationManager.js';
import {shortcutManager} from './shortcutManager.js';
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
		getDefaultPreset: vi.fn(),
		getPresetById: vi.fn(),
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
			// Second spawn attempt (Bash) - succeeds
			const bashMockPty = new MockPty();
			// Third spawn attempt (Claude fallback) - succeeds
			const secondMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(firstMockPty as unknown as IPty)
				.mockReturnValueOnce(bashMockPty as unknown as IPty)
				.mockReturnValueOnce(secondMockPty as unknown as IPty);

			// Create session
			const session = await sessionManager.createSession('/test/worktree');

			// Verify initial spawn
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--invalid-flag'],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Simulate exit with code 1 on first attempt
			firstMockPty.emit('exit', {exitCode: 1});

			// Wait for fallback to occur
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify fallback spawn was called (Claude initial + Bash + Claude fallback)
			expect(spawn).toHaveBeenCalledTimes(3);
			expect(spawn).toHaveBeenNthCalledWith(
				3,
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

			// Verify spawn attempts (Claude + Bash PTYs)
			expect(spawn).toHaveBeenCalledTimes(2);
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
			// Spawn should only be called for first session (Claude + Bash PTYs)
			expect(spawn).toHaveBeenCalledTimes(2);
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

	describe('createSession with presets', () => {
		it('should use default preset when no preset ID specified', async () => {
			// Setup mock preset
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--preset-arg'],
			});

			// Setup spawn mock
			vi.mocked(spawn)
				.mockReturnValueOnce(mockPty as unknown as IPty)
				.mockReturnValueOnce(mockPty as unknown as IPty);

			// Create session with preset
			await sessionManager.createSessionWithPreset('/test/worktree');

			// Verify spawn was called with preset config for Claude
			expect(spawn).toHaveBeenCalledWith('claude', ['--preset-arg'], {
				name: 'xterm-color',
				cols: expect.any(Number),
				rows: expect.any(Number),
				cwd: '/test/worktree',
				env: process.env,
			});
			// Verify spawn was called for bash PTY
			expect(spawn).toHaveBeenCalledWith(
				process.env['SHELL'] || 'bash',
				[],
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
				fallbackArgs: ['--no-mcp'],
			});

			// Setup spawn mock
			vi.mocked(spawn)
				.mockReturnValueOnce(mockPty as unknown as IPty)
				.mockReturnValueOnce(mockPty as unknown as IPty);

			// Create session with specific preset
			await sessionManager.createSessionWithPreset('/test/worktree', '2');

			// Verify getPresetById was called with correct ID
			expect(configurationManager.getPresetById).toHaveBeenCalledWith('2');

			// Verify spawn was called with preset config
			expect(spawn).toHaveBeenCalledWith('claude', ['--resume', '--dev'], {
				name: 'xterm-color',
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
			vi.mocked(spawn)
				.mockReturnValueOnce(mockPty as unknown as IPty)
				.mockReturnValueOnce(mockPty as unknown as IPty);

			// Create session with non-existent preset
			await sessionManager.createSessionWithPreset('/test/worktree', 'invalid');

			// Verify fallback to default preset
			expect(configurationManager.getDefaultPreset).toHaveBeenCalled();
			expect(spawn).toHaveBeenCalledWith('claude', [], expect.any(Object));
		});

		it('should try fallback args with preset if main command fails', async () => {
			// Setup mock preset with fallback
			vi.mocked(configurationManager.getDefaultPreset).mockReturnValue({
				id: '1',
				name: 'Main',
				command: 'claude',
				args: ['--bad-flag'],
				fallbackArgs: ['--good-flag'],
			});

			// Mock spawn to fail first Claude command, succeed on second, then succeed for bash
			let callCount = 0;
			vi.mocked(spawn).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					throw new Error('Command failed');
				}
				return mockPty as unknown as IPty;
			});

			// Create session
			await sessionManager.createSessionWithPreset('/test/worktree');

			// Verify fallback attempt was made for Claude
			expect(spawn).toHaveBeenCalledTimes(3); // Claude (fail) + Claude (success) + Bash
			expect(spawn).toHaveBeenNthCalledWith(
				1,
				'claude',
				['--bad-flag'],
				expect.any(Object),
			);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				'claude',
				['--good-flag'],
				expect.any(Object),
			);
		});

		it('should maintain backward compatibility with createSession', async () => {
			// Setup legacy config
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
				args: ['--legacy'],
			});

			// Setup spawn mock
			vi.mocked(spawn)
				.mockReturnValueOnce(mockPty as unknown as IPty)
				.mockReturnValueOnce(mockPty as unknown as IPty);

			// Create session using legacy method
			await sessionManager.createSession('/test/worktree');

			// Verify legacy method still works
			expect(spawn).toHaveBeenCalledWith(
				'claude',
				['--legacy'],
				expect.any(Object),
			);
		});
	});

	describe('Dual Mode Bug Fixes', () => {
		it('should handle undefined shortcut in getShortcutCode without crashing', () => {
			// Test específico para el TypeError reportado por kbwo
			// Previene regresión del bug: Cannot read properties of undefined (reading 'ctrl')
			expect(() =>
				shortcutManager.getShortcutCode(undefined as any),
			).not.toThrow();
			expect(shortcutManager.getShortcutCode(undefined as any)).toBeNull();
		});

		it('should emit bashSessionData events when bash mode is active', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});

			// Create separate mock PTYs for proper testing
			const claudeMockPty = new MockPty();
			const bashMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(claudeMockPty as unknown as IPty)
				.mockReturnValueOnce(bashMockPty as unknown as IPty);

			// Create session
			const session = await sessionManager.createSession('/test/worktree');
			session.currentMode = 'bash';
			session.isActive = true;

			// Set up event listener spy
			const bashDataEventSpy = vi.fn();
			sessionManager.on('bashSessionData', bashDataEventSpy);

			// Simulate bash PTY sending data (trigger onData handler)
			const bashDataHandler = bashMockPty.onData.mock.calls[0]?.[0];
			if (bashDataHandler) {
				bashDataHandler('$ echo test\ntest\n$ ');
			}

			// Verify: bashSessionData event is emitted
			expect(bashDataEventSpy).toHaveBeenCalledWith(
				session,
				'$ echo test\ntest\n$ ',
			);
		});
	});

	describe('Dual Mode Integration', () => {
		it('should create both Claude and Bash PTYs during session creation', async () => {
			// Setup separate mock PTYs for Claude and Bash
			const claudeMockPty = new MockPty();
			const bashMockPty = new MockPty();

			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});

			vi.mocked(spawn)
				.mockReturnValueOnce(claudeMockPty as unknown as IPty)
				.mockReturnValueOnce(bashMockPty as unknown as IPty);

			// Create session
			const session = await sessionManager.createSession('/test/worktree');

			// Verify: Both PTYs are created and assigned correctly
			expect(session.process).toBe(claudeMockPty);
			expect(session.bashProcess).toBe(bashMockPty);

			// Verify: spawn called for both Claude and Bash
			expect(spawn).toHaveBeenCalledTimes(2);
			expect(spawn).toHaveBeenNthCalledWith(
				1,
				'claude',
				expect.any(Array),
				expect.objectContaining({cwd: '/test/worktree'}),
			);
			expect(spawn).toHaveBeenNthCalledWith(
				2,
				process.env['SHELL'] || 'bash',
				[],
				expect.objectContaining({cwd: '/test/worktree'}),
			);

			// Verify: Both terminals are created with allowProposedApi
			expect(session.terminal).toBeDefined();
			expect(session.bashProcess).toBeDefined();
		});

		it('should route bash events correctly when in bash mode', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});

			// Create separate mock PTYs for proper testing
			const claudeMockPty = new MockPty();
			const bashMockPty = new MockPty();

			vi.mocked(spawn)
				.mockReturnValueOnce(claudeMockPty as unknown as IPty)
				.mockReturnValueOnce(bashMockPty as unknown as IPty);

			// Create session and set bash mode
			const session = await sessionManager.createSession('/test/worktree');
			session.currentMode = 'bash';
			session.isActive = true;

			// Set up event listener spies
			const bashDataEventSpy = vi.fn();
			const claudeDataEventSpy = vi.fn();
			sessionManager.on('bashSessionData', bashDataEventSpy);
			sessionManager.on('sessionData', claudeDataEventSpy);

			// Simulate bash PTY data (should emit bashSessionData)
			const bashDataHandler = bashMockPty.onData.mock.calls[0]?.[0];
			if (bashDataHandler) {
				bashDataHandler('bash output');
			}

			// Simulate claude PTY data (should emit sessionData)
			const claudeDataHandler = claudeMockPty.onData.mock.calls[0]?.[0];
			if (claudeDataHandler) {
				claudeDataHandler('claude output');
			}

			// Verify: bash data routed to bashSessionData event
			expect(bashDataEventSpy).toHaveBeenCalledWith(session, 'bash output');

			// Verify: claude data routed to sessionData event (regardless of mode)
			expect(claudeDataEventSpy).toHaveBeenCalledWith(session, 'claude output');
		});
	});

	describe('Bash Session Restoration Events', () => {
		it('should emit bashSessionRestore event when bash session becomes active with history', async () => {
			// Setup mock configuration
			vi.mocked(configurationManager.getCommandConfig).mockReturnValue({
				command: 'claude',
			});
			vi.mocked(spawn).mockReturnValue(mockPty as unknown as IPty);

			// Create session with bash history
			const session = await sessionManager.createSession('/test/worktree');
			session.currentMode = 'bash';
			session.bashHistory = [Buffer.from('$ echo test\ntest\n$ ')];

			// Set up event listener spy
			const bashRestoreEventSpy = vi.fn();
			sessionManager.on('bashSessionRestore', bashRestoreEventSpy);

			// Test: Activate session
			sessionManager.setSessionActive('/test/worktree', true);

			// Verify: bashSessionRestore event is emitted
			expect(bashRestoreEventSpy).toHaveBeenCalledWith(session);
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
