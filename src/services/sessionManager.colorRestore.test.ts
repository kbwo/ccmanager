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

// Don't mock @xterm/headless - let it use the real implementation
// since we need actual terminal functionality for color testing

describe('SessionManager - Color Restoration', () => {
	let sessionManager: SessionManager;
	const mockWorktreePath = '/test/worktree';

	beforeEach(() => {
		sessionManager = new SessionManager();
		vi.clearAllMocks();
	});

	it('should preserve ANSI colors when switching between sessions', async () => {
		// Create a mock PTY process
		const mockProcess = createMockPtyProcess();
		vi.mocked(spawn).mockReturnValue(mockProcess as any);

		sessionManager.createSession(mockWorktreePath);
		const session = sessionManager.sessions.get(mockWorktreePath);
		expect(session).toBeDefined();

		// Simulate colorful output from Claude Code
		const colorfulData = [
			'\x1b[32m✓\x1b[0m File created successfully\n',
			'\x1b[1;34mRunning tests...\x1b[0m\n',
			'\x1b[38;5;196mError:\x1b[0m Test failed\n',
			'\x1b[38;2;255;165;0mWarning:\x1b[0m Deprecated API\n',
		];

		// Activate session first
		sessionManager.setSessionActive(mockWorktreePath, true);

		// Send colored data to the terminal
		for (const data of colorfulData) {
			mockProcess._emit('data', data);
			// Wait for terminal to process the data
			await new Promise(resolve => setTimeout(resolve, 10));
		}

		// Deactivate session
		sessionManager.setSessionActive(mockWorktreePath, false);

		// Set up listener to capture restore event
		let restoredContent: string | null = null;
		sessionManager.on('sessionRestore', restoredSession => {
			// In real usage, the Session component would use TerminalSerializer here
			// For this test, we'll verify the terminal buffer contains the data
			const terminal = restoredSession.terminal;
			if (terminal) {
				// Access the terminal buffer to verify colors are preserved
				const buffer = terminal.buffer.active;
				restoredContent = '';

				// Simple check: verify buffer has content
				for (let i = 0; i < buffer.length; i++) {
					const line = buffer.getLine(i);
					if (line) {
						// Check if line has colored cells
						for (let x = 0; x < terminal.cols; x++) {
							const cell = line.getCell(x);
							if (cell && cell.getChars()) {
								const fgColorMode = cell.getFgColorMode();
								const bgColorMode = cell.getBgColorMode();
								// If any cell has non-default color, we know colors are preserved
								if (fgColorMode !== 0 || bgColorMode !== 0) {
									restoredContent = 'has-colors';
									break;
								}
							}
						}
					}
				}
			}
		});

		// Reactivate session (simulating switching back)
		sessionManager.setSessionActive(mockWorktreePath, true);

		// Verify that colors were preserved in the terminal buffer
		expect(restoredContent).toBe('has-colors');
	});

	it('should handle complex color sequences during restoration', async () => {
		// Create a mock PTY process
		const mockProcess = createMockPtyProcess();
		vi.mocked(spawn).mockReturnValue(mockProcess as any);

		sessionManager.createSession(mockWorktreePath);
		const session = sessionManager.sessions.get(mockWorktreePath);

		// Activate session
		sessionManager.setSessionActive(mockWorktreePath, true);

		// Send a complex sequence with cursor movements and color changes
		const complexSequence = [
			'Line 1: Normal text\n',
			'\x1b[32mLine 2: Green text\x1b[0m\n',
			'\x1b[1A\x1b[K\x1b[31mLine 2: Now red text\x1b[0m\n', // Move up, clear line, write red
			'\x1b[1;33mLine 3: Bold yellow\x1b[0m\n',
			'\x1b[48;5;17m\x1b[38;5;231mWhite on dark blue background\x1b[0m\n',
		];

		for (const data of complexSequence) {
			mockProcess._emit('data', data);
			await new Promise(resolve => setTimeout(resolve, 10));
		}

		// Check terminal has processed the sequences correctly
		const terminal = session!.terminal;
		expect(terminal).toBeDefined();

		// Verify buffer contains content (actual color verification would require
		// checking individual cells, which is done in terminalSerializer.test.ts)
		const buffer = terminal!.buffer.active;
		let hasContent = false;
		for (let i = 0; i < buffer.length; i++) {
			const line = buffer.getLine(i);
			if (line) {
				const text = line.translateToString(true);
				if (text.trim()) {
					hasContent = true;
					break;
				}
			}
		}

		expect(hasContent).toBe(true);
	});
});
