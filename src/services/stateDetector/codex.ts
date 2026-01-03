import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

export class CodexStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for confirmation prompt patterns - highest priority
		if (
			lowerContent.includes('press enter to confirm or esc to cancel') ||
			/confirm with .+ enter/i.test(content)
		) {
			return 'waiting_input';
		}

		// Check for waiting prompts
		if (
			lowerContent.includes('allow command?') ||
			lowerContent.includes('[y/n]') ||
			lowerContent.includes('yes (y)')
		) {
			return 'waiting_input';
		}

		if (
			/(do you want|would you like)[\s\S]*?\n+[\s\S]*?\byes\b/.test(
				lowerContent,
			)
		) {
			return 'waiting_input';
		}

		// Check for busy state
		if (/esc.*interrupt/i.test(lowerContent)) {
			return 'busy';
		}

		// Otherwise idle
		return 'idle';
	}
}
