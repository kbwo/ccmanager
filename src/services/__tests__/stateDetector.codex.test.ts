import {describe, it, expect, beforeEach} from 'vitest';
import {CodexStateDetector} from '../stateDetector.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

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

	it('should detect waiting_input state for multiline do you want prompt with yes', () => {
		// Arrange
		terminal = createMockTerminal([
			'Would you like to run the following command?',
			'',
			'Reason: Need to write to .git/worktrees metadata to stage changes for the requested commi',
			'',
			'$ git add test.ts',
			'',
			'› 1. Yes, proceed (y)',
			"  2. Yes, and don't ask again for this command (a)",
			'  3. No, and tell Codex what to do differently (esc)',
			'',
			'Press enter to confirm or esc to cancel',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input state for "Press enter to confirm or esc to cancel" pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'Press enter to confirm or esc to cancel',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should prioritize "Press enter to confirm" over busy state with esc interrupt', () => {
		// Arrange
		terminal = createMockTerminal([
			'esc to interrupt',
			'Press enter to confirm or esc to cancel',
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

	it('should detect waiting_input state for "Confirm with ... Enter" pattern', () => {
		// Arrange
		terminal = createMockTerminal(['Some output', 'Confirm with Y Enter']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input for "Confirm with" pattern with longer text', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'Confirm with Shift + Y Enter',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should prioritize "Confirm with ... Enter" over busy state', () => {
		// Arrange
		terminal = createMockTerminal(['Esc to interrupt', 'Confirm with Y Enter']);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});
});
