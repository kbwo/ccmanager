import {describe, it, expect, beforeEach} from 'vitest';
import {ClaudeStateDetector, GeminiStateDetector} from './stateDetector.js';
import type {Terminal} from '../types/index.js';

describe('ClaudeStateDetector', () => {
	let detector: ClaudeStateDetector;
	let terminal: Terminal;

	const createMockTerminal = (lines: string[]): Terminal => {
		const buffer = {
			length: lines.length,
			getLine: (index: number) => {
				if (index >= 0 && index < lines.length) {
					return {
						translateToString: () => lines[index],
					};
				}
				return null;
			},
		};

		return {
			buffer: {
				active: buffer,
			},
		} as unknown as Terminal;
	};

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
			const state = detector.detectState(terminal);

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
			const state = detector.detectState(terminal);

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
			const state = detector.detectState(terminal);

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
			const state = detector.detectState(terminal);

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
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('idle');
		});

		it('should handle empty terminal', () => {
			// Arrange
			terminal = createMockTerminal([]);

			// Act
			const state = detector.detectState(terminal);

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
			const state = detector.detectState(terminal);

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
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('waiting_input'); // waiting_input should take precedence
		});
	});
});

describe('GeminiStateDetector', () => {
	let detector: GeminiStateDetector;
	let terminal: Terminal;

	const createMockTerminal = (lines: string[]): Terminal => {
		const buffer = {
			length: lines.length,
			getLine: (index: number) => {
				if (index >= 0 && index < lines.length) {
					return {
						translateToString: () => lines[index],
					};
				}
				return null;
			},
		};

		return {
			buffer: {
				active: buffer,
			},
		} as unknown as Terminal;
	};

	beforeEach(() => {
		detector = new GeminiStateDetector();
	});

	describe('detectState', () => {
		it('should detect waiting_input when prompt ends with ">" ', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output from Gemini',
				'Ready for input',
				'> ',
			]);

			// Act
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when prompt contains "Enter your message"', () => {
			// Arrange
			terminal = createMockTerminal([
				'Gemini CLI v1.0',
				'Enter your message:',
				'',
			]);

			// Act
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect busy when "Processing..." is present', () => {
			// Arrange
			terminal = createMockTerminal(['Processing...', 'Please wait']);

			// Act
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "Generating response" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Your query: How to use TypeScript',
				'Generating response...',
			]);

			// Act
			const state = detector.detectState(terminal);

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
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('idle');
		});

		it('should handle empty terminal', () => {
			// Arrange
			terminal = createMockTerminal([]);

			// Act
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('idle');
		});

		it('should prioritize waiting_input over busy state', () => {
			// Arrange
			terminal = createMockTerminal([
				'Processing...',
				'Enter your message:',
				'> ',
			]);

			// Act
			const state = detector.detectState(terminal);

			// Assert
			expect(state).toBe('waiting_input'); // waiting_input should take precedence
		});
	});
});
