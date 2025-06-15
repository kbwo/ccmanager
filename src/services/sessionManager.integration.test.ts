import {describe, it, expect, beforeEach, vi} from 'vitest';
import {SessionManager} from './sessionManager.js';
import {spawn} from 'node-pty';

// Create mock pty process
const createMockPtyProcess = () => {
	const handlers = {
		data: [] as Array<(data: string) => void>,
		exit: [] as Array<(code: number) => void>,
	};

	return {
		write: vi.fn(),
		resize: vi.fn(),
		onData: vi.fn((handler: (data: string) => void) => {
			handlers.data.push(handler);
		}),
		onExit: vi.fn((handler: (code: number) => void) => {
			handlers.exit.push(handler);
		}),
		kill: vi.fn(),
		_emit: (event: 'data' | 'exit', ...args: unknown[]) => {
			if (event === 'data' && handlers.data.length > 0) {
				handlers.data.forEach(h => h(args[0] as string));
			} else if (event === 'exit' && handlers.exit.length > 0) {
				handlers.exit.forEach(h => h(args[0] as number));
			}
		},
	};
};

// Mock node-pty
vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));

// Mock @xterm/headless
vi.mock('@xterm/headless', () => ({
	default: {
		Terminal: vi.fn().mockImplementation(() => ({
			buffer: {
				active: {
					length: 10,
					cursorY: 0,
					cursorX: 0,
					getLine: vi.fn(),
				},
			},
			write: vi.fn(),
			resize: vi.fn(),
			clear: vi.fn(),
			onData: vi.fn(),
		})),
	},
}));

describe('SessionManager - Partial TUI Update Integration', () => {
	let sessionManager: SessionManager;
	const mockWorktreePath = '/test/worktree';

	beforeEach(() => {
		sessionManager = new SessionManager();
		vi.clearAllMocks();
	});

	it('should not accumulate duplicate content in output history', () => {
		// Create a mock PTY process
		const mockProcess = createMockPtyProcess();
		vi.mocked(spawn).mockReturnValue(mockProcess as any);

		// Create a session
		sessionManager.createSession(mockWorktreePath);
		const session = sessionManager.sessions.get(mockWorktreePath);
		expect(session).toBeDefined();

		// Simulate multiple partial updates from Claude Code
		const updates = [
			'+ Exploring... (10s ・ 53 tokens ・ esc to interrupt)\r',
			'\x1B[1A\x1B[K+ Exploring... (10s ・ 57 tokens ・ esc to interrupt)\r',
			'\x1B[1A\x1B[K+ Exploring... (10s ・ 76 tokens ・ esc to interrupt)\r',
			'\x1B[1A\x1B[K+ Exploring... (10s ・ 89 tokens ・ esc to interrupt)\r',
			'\x1B[1A\x1B[K+ Exploring... (10s ・ 102 tokens ・ esc to interrupt)\r',
		];

		// Process each update
		updates.forEach(update => {
			// Simulate PTY data event
			mockProcess._emit('data', update);
		});

		// Check that the virtual terminal received all updates
		expect(session!.terminal!.write).toHaveBeenCalledTimes(5);

		// The outputHistory should be empty since we removed that functionality
		expect(session!.outputHistory).toEqual([]);
	});

	it('should use virtual terminal buffer for session restoration', () => {
		// Create a mock PTY process
		const mockProcess = createMockPtyProcess();
		vi.mocked(spawn).mockReturnValue(mockProcess as any);

		sessionManager.createSession(mockWorktreePath);
		const session = sessionManager.sessions.get(mockWorktreePath);

		// Mock the terminal buffer to contain the final state
		const mockTerminal = session!.terminal as any;
		mockTerminal.buffer.active.getLine = vi.fn((index: number) => {
			const lines = [
				'Welcome to Claude Code',
				'+ Exploring... (10s ・ 218 tokens ・ esc to interrupt)',
				'',
				'Task completed successfully',
				'> ',
			];
			if (index < lines.length) {
				return {
					translateToString: () => lines[index],
				};
			}
			return null;
		});
		mockTerminal.buffer.active.length = 5;
		mockTerminal.buffer.active.cursorY = 4;
		mockTerminal.buffer.active.cursorX = 2;

		// Emit restore event
		sessionManager.emit('sessionRestore', session!);

		// The terminal buffer should be used for restoration, not output history
		// This prevents duplicate content issues
		expect(session!.outputHistory).toEqual([]);
	});

	it('should handle ANSI escape sequences correctly in virtual terminal', () => {
		// Create a mock PTY process
		const mockProcess = createMockPtyProcess();
		vi.mocked(spawn).mockReturnValue(mockProcess as any);

		sessionManager.createSession(mockWorktreePath);
		const session = sessionManager.sessions.get(mockWorktreePath);

		// Simulate data with ANSI escape sequences
		const dataWithEscapes = [
			'Line 1\n',
			'Line 2\n',
			'\x1B[1A\x1B[KReplaced Line 2\n', // Move up one line, clear line, write new text
			'\x1B[2J\x1B[H', // Clear screen and move to home
			'Fresh start\n',
		];

		dataWithEscapes.forEach(data => {
			mockProcess._emit('data', data);
		});

		// Virtual terminal should handle all the escape sequences
		expect(session!.terminal!.write).toHaveBeenCalledTimes(5);

		// No raw output should be stored
		expect(session!.outputHistory).toEqual([]);
	});

	it('should emit sessionData events for active sessions only', () => {
		// Create a mock PTY process
		const mockProcess = createMockPtyProcess();
		vi.mocked(spawn).mockReturnValue(mockProcess as any);

		const dataHandler = vi.fn();
		sessionManager.on('sessionData', dataHandler);

		sessionManager.createSession(mockWorktreePath);
		const session = sessionManager.sessions.get(mockWorktreePath);

		// Session is not active by default
		mockProcess._emit('data', 'Test data 1');

		// Should not emit data when inactive
		expect(dataHandler).not.toHaveBeenCalled();

		// Activate session
		sessionManager.setSessionActive(mockWorktreePath, true);

		// Now data should be emitted
		mockProcess._emit('data', 'Test data 2');
		expect(dataHandler).toHaveBeenCalledWith(session, 'Test data 2');
	});

	it('should restore session without replaying output history', () => {
		// Create a mock PTY process
		const mockProcess = createMockPtyProcess();
		vi.mocked(spawn).mockReturnValue(mockProcess as any);

		const restoreHandler = vi.fn();
		sessionManager.on('sessionRestore', restoreHandler);

		sessionManager.createSession(mockWorktreePath);
		const session = sessionManager.sessions.get(mockWorktreePath);

		// Add some data to the session
		mockProcess._emit('data', 'Old output that should not be replayed\n');
		mockProcess._emit('data', 'More old output\n');

		// Deactivate then reactivate session
		sessionManager.setSessionActive(mockWorktreePath, false);
		sessionManager.setSessionActive(mockWorktreePath, true);

		// Should emit restore event
		expect(restoreHandler).toHaveBeenCalledWith(session);

		// But should not have any output history to replay
		expect(session!.outputHistory).toEqual([]);
	});
});
