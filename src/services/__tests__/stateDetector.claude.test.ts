import {describe, it, expect, beforeEach} from 'vitest';
import {ClaudeStateDetector} from '../stateDetector.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

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

		it('should detect waiting_input with "Would you like" and multiple numbered options', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some previous output',
				'Would you like to proceed?',
				'',
				'❯ 1. Yes, and auto-accept edits',
				'  2. Yes, and manually approve edits',
				'  3. No, keep planning',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input with complex multi-line prompt and cursor indicator', () => {
			// Arrange
			terminal = createMockTerminal([
				'Processing complete.',
				'Would you like to apply these changes?',
				'',
				'❯ 1. Yes, apply all changes',
				'  2. Yes, review changes first',
				'  3. No, discard changes',
				'  4. Cancel operation',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when cursor indicator is present without explicit "yes" text', () => {
			// Arrange
			terminal = createMockTerminal([
				'Do you want to proceed?',
				'',
				'❯ 1. Apply all',
				'  2. Review first',
				'  3. Skip',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "enter to select" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Select an option:',
				'',
				'❯ Option 1',
				'  Option 2',
				'',
				'Enter to select',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "tab/arrow keys to navigate" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Choose your action:',
				'',
				'❯ Continue',
				'  Skip',
				'',
				'Tab/arrow keys to navigate',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "esc to cancel" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Interactive selection:',
				'',
				'❯ Yes',
				'  No',
				'',
				'Esc to cancel',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "ready to submit your answers?" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Review your selections:',
				'',
				'Choice 1: Yes',
				'Choice 2: No',
				'',
				'Ready to submit your answers?',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input with mixed case interactive patterns', () => {
			// Arrange
			terminal = createMockTerminal([
				'Select options:',
				'',
				'ENTER TO SELECT',
				'TAB/ARROW KEYS TO NAVIGATE',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should prioritize interactive patterns over busy state', () => {
			// Arrange
			terminal = createMockTerminal([
				'Press ESC to interrupt',
				'',
				'Select an option:',
				'Enter to select',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input'); // Interactive pattern should take precedence
		});
	});
});
