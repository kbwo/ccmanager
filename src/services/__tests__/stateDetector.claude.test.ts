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
	});
});
