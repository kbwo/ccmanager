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

	detectBackgroundTask(terminal: Terminal): boolean {
		const lines = this.getTerminalLines(terminal, 3);
		const content = lines.join('\n').toLowerCase();
		// Detect background task patterns:
		// - "N background task(s)" in status bar
		// - "(running)" in status bar for active background commands
		return content.includes('background task') || content.includes('(running)');
	}
}
