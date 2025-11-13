import {describe, it, expect, beforeEach} from 'vitest';
import {ClineStateDetector} from '../stateDetector.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

describe('ClineStateDetector', () => {
	let detector: ClineStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new ClineStateDetector();
	});

	it('should detect waiting_input when "Let Cline use this tool?" is present', () => {
		// Arrange
		terminal = createMockTerminal([
			'┃ [act mode] Let Cline use this tool?',
			'┃ >  Yes',
			"┃   Yes, and don't ask again for this task",
			'┃   No, with feedback',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect waiting_input when "let cline use this tool?" is present (case insensitive)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'LET CLINE USE THIS TOOL?',
			'>  Yes',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input');
	});

	it('should detect idle when "Cline is ready for your message" is present in act mode', () => {
		// Arrange
		terminal = createMockTerminal([
			'┃ [act mode] Cline is ready for your message...',
			'┃ /plan or /act to switch modes',
			'┃ ctrl+e to open editor',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle');
	});

	it('should detect idle when "Cline is ready for your message" is present in plan mode', () => {
		// Arrange
		terminal = createMockTerminal([
			'┃ [plan mode] Cline is ready for your message...',
			'┃ /plan or /act to switch modes',
			'┃ ctrl+e to open editor',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle');
	});

	it('should detect idle when "cline is ready" is present (case insensitive)', () => {
		// Arrange
		terminal = createMockTerminal([
			'Some output',
			'CLINE IS READY FOR YOUR MESSAGE',
			'Ready to go',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle');
	});

	it('should detect busy when no specific patterns are found', () => {
		// Arrange
		terminal = createMockTerminal([
			'Processing your request...',
			'Running analysis...',
			'Working on it...',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('should handle empty terminal as busy', () => {
		// Arrange
		terminal = createMockTerminal([]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('busy');
	});

	it('should prioritize waiting_input over idle', () => {
		// Arrange
		terminal = createMockTerminal([
			'┃ [act mode] Cline is ready for your message...',
			'┃ Let Cline use this tool?',
			'┃ >  Yes',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('waiting_input'); // waiting_input should take precedence
	});

	it('should prioritize idle over busy', () => {
		// Arrange
		terminal = createMockTerminal([
			'Processing...',
			'Working...',
			'┃ [act mode] Cline is ready for your message...',
		]);

		// Act
		const state = detector.detectState(terminal, 'idle');

		// Assert
		expect(state).toBe('idle'); // idle should take precedence over busy
	});
});
