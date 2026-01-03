import {SessionState, Terminal} from '../../types/index.js';
import {StateDetector} from './types.js';

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
