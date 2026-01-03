import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

// https://github.com/cline/cline/blob/580db36476b6b52def03c8aeda325aae1c817cde/cli/pkg/cli/task/input_handler.go
export class ClineStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for waiting prompts with tool permission - Priority 1
		// Pattern: [\[act|plan\] mode].*?\n.*yes (when mode indicator present)
		// Or simply: let cline use this tool (distinctive text)
		if (
			/\[(act|plan) mode\].*?\n.*yes/i.test(lowerContent) ||
			/let cline use this tool/i.test(lowerContent)
		) {
			return 'waiting_input';
		}

		// Check for idle state - Priority 2
		// Pattern: [\[act|plan\] mode].*Cline is ready for your message... (when mode indicator present)
		// Or simply: cline is ready for your message (distinctive text)
		if (
			/\[(act|plan) mode\].*cline is ready for your message/i.test(
				lowerContent,
			) ||
			/cline is ready for your message/i.test(lowerContent)
		) {
			return 'idle';
		}

		// Otherwise busy - Priority 3
		return 'busy';
	}
}
