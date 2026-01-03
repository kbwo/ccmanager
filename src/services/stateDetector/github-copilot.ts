import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

export class GitHubCopilotStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for confirmation prompt pattern - highest priority
		if (/confirm with .+ enter/i.test(content)) {
			return 'waiting_input';
		}

		// Waiting prompt has priority 2
		if (lowerContent.includes('│ do you want')) {
			return 'waiting_input';
		}

		// Busy state detection has priority 3
		if (lowerContent.includes('esc to cancel')) {
			return 'busy';
		}

		// Otherwise idle as priority 4
		return 'idle';
	}
}
