import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

/**
 * State detector for MiniMax Code (MCode).
 * Command: mcode
 * Installation: npm install -g @minimax-ai/code
 */
export class MCodeStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal, 30);
		const lowerContent = content.toLowerCase();

		// MCode exposes pending interactive decisions in its runtime status and
		// renders the event marker in the transcript. These take precedence over
		// an active turn because the user must act before that turn can continue.
		if (
			lowerContent.includes('permission: pending') ||
			lowerContent.includes('[permission] permission.ask') ||
			lowerContent.includes('ask_user: pending') ||
			lowerContent.includes('[ask_user] questionnaire.ask')
		) {
			return 'waiting_input';
		}

		// Current releases include a turn id; the compact fallback is emitted
		// while a turn is starting. Match the status field rather than ordinary
		// assistant text so historical words such as "thinking" cannot look busy.
		if (/\bturn:\s+(?:\S+\s+)?running\b/i.test(content)) {
			return 'busy';
		}

		return 'idle';
	}

	detectBackgroundTask(_terminal: Terminal): number {
		return 0;
	}

	detectTeamMembers(_terminal: Terminal): number {
		return 0;
	}
}
