import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

// Frames of the spinner that leads the turn status row while a turn runs.
// Source: `braille_spinner_frames` in
// crates/codegen/xai-grok-pager-render/src/glyphs.rs
const SPINNER_ROW_PATTERN = /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧] /m;

// While a prompt owns the keyboard, the bottom shortcuts bar lists that
// prompt's keys as `key:label`. `N/M:select` is shared by the permission
// prompt and the cancel-turn panel.
// Source: `shortcuts_bar_content` in
// crates/codegen/xai-grok-pager/src/app/agent_view/render.rs
const PROMPT_SELECT_HINT_PATTERN = /\d\/\d:select/;
const PROMPT_HINTS = [
	':next answer', // ask_user_question card
	':accept / toggle', // MCP elicitation card
];

// The turn status row replaces the spinner with a diamond for these.
// Sources: `render_turn_status` in
// crates/codegen/xai-grok-pager/src/views/turn_status.rs and
// `plan_approval_status_label` in .../views/plan_approval_view.rs
const WAITING_STATUS_ROWS = [
	'◆ Waiting on answers for',
	'◆ Waiting on plan approval',
	'◆ No plan written',
];

/**
 * State detector for Grok Build.
 * Command: grok
 * Source: https://github.com/xai-org/grok-build
 */
export class GrokStateDetector extends BaseStateDetector {
	detectState(terminal: Terminal, _currentState: SessionState): SessionState {
		const content = this.getTerminalContent(terminal, 30);

		// Checked before the spinner: a running subagent keeps its own spinner
		// on screen while the main turn is blocked on the user.
		if (
			PROMPT_SELECT_HINT_PATTERN.test(content) ||
			PROMPT_HINTS.some(hint => content.includes(hint)) ||
			WAITING_STATUS_ROWS.some(row => content.includes(row))
		) {
			return 'waiting_input';
		}

		if (SPINNER_ROW_PATTERN.test(content)) {
			return 'busy';
		}

		return 'idle';
	}

	detectBackgroundTask(_terminal: Terminal): number {
		return 0;
	}

	detectTeamMembers(_terminal: Terminal): number {
		return 0;
	}
}
