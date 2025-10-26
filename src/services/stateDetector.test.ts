import {describe, it, expect, beforeEach} from 'vitest';
import {
	ClaudeStateDetector,
	GeminiStateDetector,
	CodexStateDetector,
	CursorStateDetector,
	GitHubCopilotStateDetector,
} from './stateDetector.js';
import type {Terminal} from '../types/index.js';

const createMockTerminal = (lines: string[]): Terminal => {
	const buffer = {
		length: lines.length,
		active: {
			length: lines.length,
			getLine: (index: number) => {
				if (index >= 0 && index < lines.length) {
					return {
						translateToString: () => lines[index],
					};
				}
				return null;
			},
		},
	};

	return {buffer} as unknown as Terminal;
};

describe('ClaudeStateDetector', () => {
	let detector: ClaudeStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new ClaudeStateDetector();
	});

	describe('detectState', () => {
		it('should detect waiting_input when "Do you want" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some previous output',
				'│ Do you want to continue? (y/n)',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Would you like" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'│ Would you like to save changes?',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect busy when "ESC to interrupt" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Processing...',
				'Press ESC to interrupt',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "esc to interrupt" is present (case insensitive)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Running command...',
				'press esc to interrupt the process',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect idle when no specific patterns are found', () => {
			// Arrange
			terminal = createMockTerminal([
				'Command completed successfully',
				'Ready for next command',
				'> ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('idle');
		});

		it('should handle empty terminal', () => {
			// Arrange
			terminal = createMockTerminal([]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('idle');
		});

		it('should only consider last 30 lines', () => {
			// Arrange
			const lines = [];
			// Add more than 30 lines
			for (let i = 0; i < 40; i++) {
				lines.push(`Line ${i}`);
			}
			// The "Do you want" should be outside the 30 line window
			lines.push('│ Do you want to continue?');

			// Add 30 more lines to push it out
			for (let i = 0; i < 30; i++) {
				lines.push(`Recent line ${i}`);
			}

			terminal = createMockTerminal(lines);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('idle'); // Should not detect the old prompt
		});

		it('should prioritize waiting_input over busy state', () => {
			// Arrange
			terminal = createMockTerminal([
				'Press ESC to interrupt',
				'│ Do you want to continue?',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input'); // waiting_input should take precedence
		});

		it('should maintain current state when "ctrl+r to toggle" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'Press Ctrl+R to toggle history search',
				'More output',
			]);

			// Act - test with different current states
			const idleState = detector.detectState(terminal, 'idle');
			const busyState = detector.detectState(terminal, 'busy');
			const waitingState = detector.detectState(terminal, 'waiting_input');

			// Assert - should maintain whatever the current state was
			expect(idleState).toBe('idle');
			expect(busyState).toBe('busy');
			expect(waitingState).toBe('waiting_input');
		});

		it('should maintain current state for various "ctrl+r" patterns', () => {
			// Arrange - test different case variations
			const patterns = [
				'ctrl+r to toggle',
				'CTRL+R TO TOGGLE',
				'Ctrl+R to toggle history',
				'Press ctrl+r to toggle the search',
			];

			for (const pattern of patterns) {
				terminal = createMockTerminal(['Some output', pattern]);

				// Act
				const state = detector.detectState(terminal, 'busy');

				// Assert - should maintain the current state
				expect(state).toBe('busy');
			}
		});

		it('should detect waiting_input when "Do you want" with options prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some previous output',
				'Do you want to make this edit to test.txt?',
				'❯ 1. Yes',
				'2. Yes, allow all edits during this session (shift+tab)',
				'3. No, and tell Claude what to do differently (esc)',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Do you want" with options prompt is present (case insensitive)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'DO YOU WANT to make this edit?',
				'❯ 1. YES',
				'2. NO',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should prioritize "Do you want" with options over busy state', () => {
			// Arrange
			terminal = createMockTerminal([
				'Press ESC to interrupt',
				'Do you want to continue?',
				'❯ 1. Yes',
				'2. No',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input'); // waiting_input should take precedence
		});
	});
});

describe('GeminiStateDetector', () => {
	let detector: GeminiStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new GeminiStateDetector();
	});

	describe('detectState', () => {
		it('should detect waiting_input when "Apply this change?" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output from Gemini',
				'│ Apply this change?',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Allow execution?" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Command found: npm install',
				'│ Allow execution?',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Do you want to proceed?" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Changes detected',
				'│ Do you want to proceed?',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect busy when "esc to cancel" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Processing your request...',
				'Press ESC to cancel',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "ESC to cancel" is present (case insensitive)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Running command...',
				'Press Esc to cancel the operation',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect idle when no specific patterns are found', () => {
			// Arrange
			terminal = createMockTerminal([
				'Welcome to Gemini CLI',
				'Type your message below',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('idle');
		});

		it('should handle empty terminal', () => {
			// Arrange
			terminal = createMockTerminal([]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('idle');
		});

		it('should prioritize waiting_input over busy state', () => {
			// Arrange
			terminal = createMockTerminal([
				'Press ESC to cancel',
				'│ Apply this change?',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input'); // waiting_input should take precedence
		});
	});
});

describe('CodexStateDetector', () => {
	let detector: CodexStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new CodexStateDetector();
	});

	it('should detect waiting_input state for Allow command? pattern', () => {
		// Arrange
		terminal = createMockTerminal(['Some output', 'Allow command?', '│ > ']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for [y/n] pattern', () => {
		// Arrange
		terminal = createMockTerminal(['Some output', 'Continue? [y/n]', '> ']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for yes (y) pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'Apply changes? yes (y) / no (n)',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect busy state for Esc to interrupt pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Processing...',
			'Esc to interrupt',
			'Working...',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('should detect busy state for ESC INTERRUPT (uppercase)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Processing...',
			'PRESS ESC TO INTERRUPT',
			'Working...',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('should detect idle state when no patterns match', () => {
		// Arrange
		terminal = createMockTerminal(['Normal output', 'Some message', 'Ready']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle');
	});

	it('should prioritize waiting_input over busy', () => {
		// Arrange
		terminal = createMockTerminal(['press esc to interrupt', '[y/n]']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});
});

describe('CursorStateDetector', () => {
	let detector: CursorStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new CursorStateDetector();
	});

	it('should detect waiting_input state for (y) (enter) pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'Apply changes? (y) (enter)',
			'> ',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for (Y) (ENTER) pattern (case insensitive)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'Continue? (Y) (ENTER)',
			'> ',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for Keep (n) pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Changes detected',
			'Keep (n) or replace?',
			'> ',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for KEEP (N) pattern (case insensitive)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'KEEP (N) current version?',
			'> ',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for Auto pattern with shift+tab', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'Auto apply changes (shift+tab)',
			'> ',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for AUTO with SHIFT+TAB (case insensitive)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'AUTO COMPLETE (SHIFT+TAB)',
			'> ',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect busy state for ctrl+c to stop pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Processing...',
			'Press ctrl+c to stop',
			'Working...',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('should detect busy state for CTRL+C TO STOP (case insensitive)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Running...',
			'PRESS CTRL+C TO STOP',
			'Processing...',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('should detect idle state when no patterns match', () => {
		// Arrange
		terminal = createMockTerminal(['Normal output', 'Some message', 'Ready']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle');
	});

	it('should prioritize waiting_input over busy (Priority 1)', () => {
		// Arrange
		terminal = createMockTerminal(['ctrl+c to stop', '(y) (enter)']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input'); // waiting_input should take precedence
	});

	it('should handle empty terminal', () => {
		// Arrange
		terminal = createMockTerminal([]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle');
	});
});

describe('GitHubCopilotStateDetector', () => {
	let detector: GitHubCopilotStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new GitHubCopilotStateDetector();
	});

	it('detects waiting_input when prompt asks "Do you want" (case insensitive)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Running GitHub Copilot CLI...',
			'│ DO YOU WANT to run this command?',
			'│ > ',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('detects busy when "Esc to cancel" is present', () => {
		// Arrange
		terminal = createMockTerminal([
			'Executing request...',
			'Press Esc to cancel',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('prioritizes waiting_input over busy when both patterns exist', () => {
		// Arrange
		terminal = createMockTerminal([
			'Press Esc to cancel',
			'│ Do you want to continue?',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('returns idle when no patterns match', () => {
		// Arrange
		terminal = createMockTerminal([
			'GitHub Copilot CLI ready.',
			'Type a command to begin.',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle');
	});
});
