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

		// Check for busy state
		if (lowerContent.includes('esc to interrupt')) {
			return 'busy';
		}

		// Otherwise idle
		return 'idle';
	}
}
