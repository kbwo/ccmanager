import {describe, it, expect, beforeEach} from 'vitest';
import {GeminiStateDetector} from '../stateDetector.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

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

		it('should detect waiting_input when "Apply this change" prompt is present (without ?)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output from Gemini',
				'│ Apply this change',
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

		it('should detect waiting_input when "Allow execution" prompt is present (without ?)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Command found: npm install',
				'│ Allow execution',
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

		it('should detect waiting_input when "Do you want to proceed" prompt is present (without ?)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Changes detected',
				'│ Do you want to proceed',
				'│ > ',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Waiting for user confirmation..." is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Processing...',
				'Waiting for user confirmation...',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should prioritize "Waiting for user confirmation" over busy state', () => {
			// Arrange
			terminal = createMockTerminal([
				'Press ESC to cancel',
				'Waiting for user confirmation...',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input for multiline confirmation ending with "yes"', () => {
			// Arrange
			terminal = createMockTerminal([
				'Apply this change to the workspace?',
				'The operation will modify several files.',
				'   yes',
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
