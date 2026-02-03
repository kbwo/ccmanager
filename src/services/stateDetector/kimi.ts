import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

/**
 * State detector for Kimi CLI (kimi-cli).
 * Kimi CLI is an AI coding assistant by Moonshot AI.
 * Command: kimi
 * Installation: uv tool install --python 3.13 kimi-cli
 */
export class KimiStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for permission/confirmation prompts - waiting_input state
		// Kimi CLI uses prompts like "Allow?", "Confirm?", "Yes/No" patterns
		if (
			lowerContent.includes('allow?') ||
			lowerContent.includes('confirm?') ||
			lowerContent.includes('approve?') ||
			lowerContent.includes('proceed?')
		) {
			return 'waiting_input';
		}

		// Check for Yes/No option patterns
		if (/\[y\/n\]/.test(lowerContent) || /\(y\/n\)/.test(lowerContent)) {
			return 'waiting_input';
		}

		// Check for busy state - processing indicators
		if (
			lowerContent.includes('thinking') ||
			lowerContent.includes('processing') ||
			lowerContent.includes('generating') ||
			lowerContent.includes('waiting for response')
		) {
			return 'busy';
		}

		// Check for common interrupt patterns
		if (
			lowerContent.includes('ctrl+c to cancel') ||
			lowerContent.includes('ctrl-c to cancel') ||
			lowerContent.includes('press ctrl+c')
		) {
			return 'busy';
		}

		// Otherwise idle
		return 'idle';
	}

	detectBackgroundTask(_terminal: Terminal): number {
		// Kimi CLI does not currently support background tasks
		return 0;
	}
}
