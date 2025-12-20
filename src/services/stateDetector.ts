import {
	SessionState,
	Terminal,
	StateDetectionStrategy,
} from '../types/index.js';

export interface StateDetector {
	detectState(terminal: Terminal, currentState: SessionState): SessionState;
}

export function createStateDetector(
	strategy: StateDetectionStrategy = 'claude',
): StateDetector {
	switch (strategy) {
		case 'claude':
			return new ClaudeStateDetector();
		case 'gemini':
			return new GeminiStateDetector();
		case 'codex':
			return new CodexStateDetector();
		case 'cursor':
			return new CursorStateDetector();
		case 'github-copilot':
			return new GitHubCopilotStateDetector();
		case 'cline':
			return new ClineStateDetector();
		default:
			return new ClaudeStateDetector();
	}
}

export abstract class BaseStateDetector implements StateDetector {
	abstract detectState(
		terminal: Terminal,
		currentState: SessionState,
	): SessionState;

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
	detectState(terminal: Terminal, currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Check for ctrl+r toggle prompt - maintain current state
		if (lowerContent.includes('ctrl+r to toggle')) {
			return currentState;
		}

		// Check for "Do you want" or "Would you like" pattern with options
		// Handles both simple ("Do you want...\nYes") and complex (numbered options) formats
		if (
			/(?:do you want|would you like).+\n+[\s\S]*?(?:yes|❯)/.test(lowerContent)
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
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
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

export class CodexStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

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

export class GitHubCopilotStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal);
		const lowerContent = content.toLowerCase();

		// Waiting prompt has priority 1
		if (lowerContent.includes('│ do you want')) {
			return 'waiting_input';
		}

		// Busy state detection has priority 2
		if (lowerContent.includes('esc to cancel')) {
			return 'busy';
		}

		// Otherwise idle as priority 3
		return 'idle';
	}
}

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
