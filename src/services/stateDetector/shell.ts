import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

/**
 * State detector for plain shell sessions.
 *
 * A shell is not an agent, so there is no "thinking"/"waiting for approval"
 * output to parse. It is always considered idle; the worktree list simply
 * shows it as a running session without agent-style busy indicators.
 */
export class ShellStateDetector extends BaseStateDetector {
	detectState(_terminal: Terminal, _currentState: SessionState): SessionState {
		return 'idle';
	}

	detectBackgroundTask(_terminal: Terminal): number {
		return 0;
	}

	detectTeamMembers(_terminal: Terminal): number {
		return 0;
	}
}
