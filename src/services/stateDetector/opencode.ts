import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

export class OpenCodeStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);

		// Check for waiting input state - permission required prompt
		// The triangle symbol (△) indicates permission is required
		if (content.includes('△ Permission required')) {
			return 'waiting_input';
		}

		// Check for busy state - "esc interrupt" pattern indicates active processing
		if (/esc.*interrupt/i.test(content)) {
			return 'busy';
		}

		// Otherwise idle
		return 'idle';
	}
}
