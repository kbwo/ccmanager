import {describe, it, expect, beforeEach} from 'vitest';
import {OpenCodeStateDetector} from './opencode.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

describe('OpenCodeStateDetector', () => {
	let detector: OpenCodeStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new OpenCodeStateDetector();
	});

	it('should detect waiting_input state for "△ Permission required" pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'△ Permission required',
			'Press Enter to allow',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect busy state for "esc interrupt" pattern', () => {
		// Arrange
		terminal = createMockTerminal([
			'Processing...',
			'Press esc to interrupt',
			'Working...',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('should detect busy state for "ESC INTERRUPT" (uppercase)', () => {
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

	it('should detect busy state for "Esc to interrupt" pattern', () => {
		// Arrange
		terminal = createMockTerminal(['Processing...', 'Esc to interrupt']);

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

	it('should prioritize waiting_input over busy when both patterns present', () => {
		// Arrange
		terminal = createMockTerminal([
			'esc to interrupt',
			'△ Permission required',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input with full permission prompt', () => {
		// Arrange
		terminal = createMockTerminal([
			'opencode v0.1.0',
			'',
			'△ Permission required',
			'The AI wants to execute a shell command',
			'',
			'Press Enter to allow, Esc to deny',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});
});
