import {describe, it, expect, beforeEach} from 'vitest';
import {GitHubCopilotStateDetector} from '../stateDetector.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

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
