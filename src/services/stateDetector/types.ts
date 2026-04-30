import {SessionState, Terminal} from '../../types/index.js';

export interface StateDetector {
	detectState(terminal: Terminal, currentState: SessionState): SessionState;
	detectBackgroundTask(terminal: Terminal): number;
	detectTeamMembers(terminal: Terminal): number;
	// True when the live viewport shows a footer (spinner/token-stats/persistent
	// status bar etc.) that the renderer keeps redrawing in place. Earlier
	// frames of that footer can be pushed into normal-buffer scrollback as the
	// chat scrolls, so callers (session restore) should avoid replaying that
	// scrollback to prevent duplicated footer rows.
	hasTransientRenderFooter(terminal: Terminal): boolean;
}
