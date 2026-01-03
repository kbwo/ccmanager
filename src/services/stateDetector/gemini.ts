import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

// https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx
export class GeminiStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for explicit user confirmation message - highest priority
		if (lowerContent.includes('waiting for user confirmation')) {
			return 'waiting_input';
		}

		// Check for waiting prompts with box character
		if (
			content.includes('│ Apply this change') ||
			content.includes('│ Allow execution') ||
			content.includes('│ Do you want to proceed')
		) {
			return 'waiting_input';
		}

		// Check for multiline confirmation prompts ending with "yes"
		if (
			/(allow execution|do you want to|apply this change)[\s\S]*?\n+[\s\S]*?\byes\b/.test(
				lowerContent,
			)
		) {
			return 'waiting_input';
		}

		// Check for busy state
		if (lowerContent.includes('esc to cancel')) {
			return 'busy';
		}

		// Otherwise idle
		return 'idle';
	}
}
