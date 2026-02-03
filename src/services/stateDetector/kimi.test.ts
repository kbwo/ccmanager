import {describe, it, expect, beforeEach} from 'vitest';
import {KimiStateDetector} from './kimi.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

describe('KimiStateDetector', () => {
	let detector: KimiStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new KimiStateDetector();
	});

	describe('detectState', () => {
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

		it('should detect waiting_input when "Allow?" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Kimi wants to execute a command',
				'Allow?',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Confirm?" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'About to make changes to file.ts',
				'Confirm?',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Approve?" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Requesting permission to modify config',
				'Approve?',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Proceed?" prompt is present', () => {
			// Arrange
			terminal = createMockTerminal(['Ready to execute action', 'Proceed?']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "[y/n]" pattern is present', () => {
			// Arrange
			terminal = createMockTerminal(['Do you want to continue? [y/n]', '> ']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "(y/n)" pattern is present', () => {
			// Arrange
			terminal = createMockTerminal(['Apply changes? (y/n)', '> ']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect busy when "thinking" is present', () => {
			// Arrange
			terminal = createMockTerminal(['Processing your request...', 'thinking']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "processing" is present', () => {
			// Arrange
			terminal = createMockTerminal(['Analyzing code...', 'processing']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "generating" is present', () => {
			// Arrange
			terminal = createMockTerminal(['Working on solution...', 'generating']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "waiting for response" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Request sent',
				'waiting for response from API',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "ctrl+c to cancel" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Running task...',
				'Press ctrl+c to cancel',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "ctrl-c to cancel" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Executing command...',
				'ctrl-c to cancel',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "press ctrl+c" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Working...',
				'Press Ctrl+C to stop the operation',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect patterns case-insensitively', () => {
			// Arrange
			terminal = createMockTerminal(['THINKING about the problem...']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should prioritize waiting_input over busy when both patterns present', () => {
			// Arrange
			terminal = createMockTerminal(['Processing...', 'thinking', 'Allow?']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});
	});

	describe('detectBackgroundTask', () => {
		it('should return 0 as Kimi CLI does not support background tasks', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'More output',
				'Status bar',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(0);
		});

		it('should return 0 for empty terminal', () => {
			// Arrange
			terminal = createMockTerminal([]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(0);
		});
	});
});
