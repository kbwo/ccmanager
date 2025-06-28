import {
	SessionState,
	Terminal,
	StateDetectionStrategy,
} from '../types/index.js';

export interface StateDetector {
	detectState(terminal: Terminal): SessionState;
}

export function createStateDetector(
	strategy: StateDetectionStrategy = 'claude',
): StateDetector {
	switch (strategy) {
		case 'claude':
			return new ClaudeStateDetector();
		case 'gemini':
			return new GeminiStateDetector();
		default:
			return new ClaudeStateDetector();
	}
}

export abstract class BaseStateDetector implements StateDetector {
	abstract detectState(terminal: Terminal): SessionState;

	protected getTerminalLines(
		terminal: Terminal,
		maxLines: number = 30,
	): string[] {
		const buffer = terminal.buffer.active;
		const lines: string[] = [];

		// Start from the bottom and work our way up
		for (let i = buffer.length - 1; i >= 0 && lines.length < maxLines; i--) {
			const line = buffer.getLine(i);
			if (line) {
				const text = line.translateToString(true);
				// Skip empty lines at the bottom
				if (lines.length > 0 || text.trim() !== '') {
					lines.unshift(text);
				}
			}
		}

		return lines;
	}

	protected getTerminalContent(
		terminal: Terminal,
		maxLines: number = 30,
	): string {
		return this.getTerminalLines(terminal, maxLines).join('\n');
	}
}

export class ClaudeStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for waiting prompts with box character
		if (
			content.includes('│ Do you want') ||
			content.includes('│ Would you like')
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

// https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx
export class GeminiStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for waiting prompts with box character
		if (
			content.includes('│ Apply this change?') ||
			content.includes('│ Allow execution?') ||
			content.includes('│ Do you want to proceed?')
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
