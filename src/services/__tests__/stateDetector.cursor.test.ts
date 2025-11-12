import {describe, it, expect, beforeEach} from 'vitest';
import {CursorStateDetector} from '../stateDetector.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

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
