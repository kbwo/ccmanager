import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

export class ClaudeStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for ctrl+r toggle prompt - maintain current state
		if (lowerContent.includes('ctrl+r to toggle')) {
			return currentState;
		}

		// Check for "Do you want" or "Would you like" pattern with options
		// Handles both simple ("Do you want...\nYes") and complex (numbered options) formats
		if (
			/(?:do you want|would you like).+\n+[\s\S]*?(?:yes|❯)/.test(lowerContent)
		) {
			return 'waiting_input';
		}

		// Check for "esc to cancel" - indicates waiting for user input
		if (lowerContent.includes('esc to cancel')) {
			return 'waiting_input';
		}

		// Check for busy state
		if (
			lowerContent.includes('esc to interrupt') ||
			lowerContent.includes('ctrl+c to interrupt')
		) {
			return 'busy';
		}

		// Otherwise idle
		return 'idle';
	}

	detectBackgroundTask(terminal: Terminal): number {
		const lines = this.getTerminalLines(terminal, 3);
		const content = lines.join('\n').toLowerCase();

		// Check for "N background task(s)" pattern first (content already lowercased)
		const countMatch = content.match(
			/(\d+)\s+(?:background\s+task|local\s+agent)/,
		);
		if (countMatch?.[1]) {
			return parseInt(countMatch[1], 10);
		}

		// Check for "(running)" pattern - indicates at least 1 background task
		if (content.includes('(running)')) {
			return 1;
		}

		// No background task detected
		return 0;
	}
}
