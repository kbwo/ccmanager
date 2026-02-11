import {SessionState, Terminal} from '../../types/index.js';
import {StateDetector} from './types.js';
import {getTerminalScreenContent} from '../../utils/screenCapture.js';

export abstract class BaseStateDetector implements StateDetector {
	abstract detectState(
		terminal: Terminal,
		currentState: SessionState,
	): SessionState;

	protected getTerminalLines(terminal: Terminal, maxLines: number): string[] {
		const content = getTerminalScreenContent(terminal, maxLines);
		return content.split('\n');
	}

	protected getTerminalContent(terminal: Terminal, maxLines: number): string {
		return getTerminalScreenContent(terminal, maxLines);
	}

	abstract detectBackgroundTask(terminal: Terminal): number;

	abstract detectTeamMembers(terminal: Terminal): number;
}
