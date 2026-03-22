import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

// Spinner symbols used by Cursor during active processing
const CURSOR_SPINNER_CHARS = '⬡⬢';

// Like Claude's spinner activity: "<symbol> <word>ing…"; Cursor often uses ASCII dots (.. or …)
const SPINNER_ACTIVITY_PATTERN = new RegExp(
	`^\\s*[${CURSOR_SPINNER_CHARS}] \\S+ing(?:.*\u2026|.*\\.{2,})`,
	'm',
);

export class CursorStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal, 30);
		const lowerContent = content.toLowerCase();

		// Check for waiting prompts - Priority 1
		if (
			lowerContent.includes('(y) (enter)') ||
			lowerContent.includes('keep (n)') ||
			/auto .* \(shift\+tab\)/.test(lowerContent) ||
			/allow .+ \(y\)/.test(lowerContent) ||
			/run .+ \(y\)/.test(lowerContent) ||
			lowerContent.includes('skip (esc or n)')
		) {
			return 'waiting_input';
		}

		// Check for busy state - Priority 2
		if (lowerContent.includes('ctrl+c to stop')) {
			return 'busy';
		}

		// Spinner activity (e.g. "⬡ Grepping..", "⬢ Reading…") — case-sensitive on original buffer
		if (SPINNER_ACTIVITY_PATTERN.test(content)) {
			return 'busy';
		}

		// Otherwise idle - Priority 3
		return 'idle';
	}

	detectBackgroundTask(_terminal: Terminal): number {
		return 0;
	}

	detectTeamMembers(_terminal: Terminal): number {
		return 0;
	}
}
