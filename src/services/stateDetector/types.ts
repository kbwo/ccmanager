import {SessionState, Terminal} from '../../types/index.js';

export interface StateDetector {
	detectState(terminal: Terminal, currentState: SessionState): SessionState;
	detectBackgroundTask(terminal: Terminal): number;
}
