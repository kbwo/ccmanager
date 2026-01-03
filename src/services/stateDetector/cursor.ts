import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

export class CursorStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for waiting prompts - Priority 1
		if (
			lowerContent.includes('(y) (enter)') ||
			lowerContent.includes('keep (n)') ||
			/auto .* \(shift\+tab\)/.test(lowerContent)
		) {
			return 'waiting_input';
		}

		// Check for busy state - Priority 2
		if (lowerContent.includes('ctrl+c to stop')) {
			return 'busy';
		}

		// Otherwise idle - Priority 3
		return 'idle';
	}
}
