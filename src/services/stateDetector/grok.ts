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

// The permission prompt's reject option. Unlike the shortcuts bar hint, it
// stays on screen after Esc moves keyboard focus to the transcript.
// Source: crates/codegen/xai-grok-pager/src/views/permission_view.rs
const PERMISSION_REJECT_ROW_PATTERN =
	/\([○●]\) No, reject \(type to add feedback\)/;

// Headers of the panes listing background commands (`▾ Tasks 2`) and
// monitors / loops (`▾ Watchers 1`). `Subagents` is left out because it also
// lists subagents the running turn is waiting on.
// Source: `section_header` in crates/codegen/xai-grok-pager/src/views/dock/mod.rs
const BACKGROUND_PANE_HEADER_PATTERN = /^\s*[▾▸] (?:Tasks|Watchers) (\d+)/gm;

// Idle cue such as `1 command · 2 monitors still running`, read when no pane
// header is on screen.
// Source: `format_still_running` in
// crates/codegen/xai-grok-pager/src/views/turn_status.rs
const STILL_RUNNING_PATTERN = /((?:\d+ [a-z]+(?: · )?)+) still running/;

const sum = (counts: Iterable<string>): number =>
	[...counts].reduce((total, count) => total + Number(count), 0);

// The turn status row replaces the spinner with a diamond for these.
// Sources: `render_turn_status` in
// crates/codegen/xai-grok-pager/src/views/turn_status.rs and
// `plan_approval_status_label` in .../views/plan_approval_view.rs
const WAITING_STATUS_ROWS = [
	'◆ Waiting on answers for',
	'◆ Waiting on plan approval',
	'◆ No plan written',
];

// Folder trust question shown at startup, before any session exists.
// Source: crates/codegen/xai-grok-pager/src/views/welcome/mod.rs
const TRUST_QUESTION = 'Do you trust the contents of this directory';

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
			PERMISSION_REJECT_ROW_PATTERN.test(content) ||
			PROMPT_HINTS.some(hint => content.includes(hint)) ||
			WAITING_STATUS_ROWS.some(row => content.includes(row)) ||
			content.includes(TRUST_QUESTION)
		) {
			return 'waiting_input';
		}

		if (SPINNER_ROW_PATTERN.test(content)) {
			return 'busy';
		}

		return 'idle';
	}

	detectBackgroundTask(terminal: Terminal): number {
		const content = this.getTerminalContent(terminal, 30);
		const paneCounts = [...content.matchAll(BACKGROUND_PANE_HEADER_PATTERN)];
		if (paneCounts.length > 0) {
			return sum(paneCounts.map(match => match[1]!));
		}

		const cue = content.match(STILL_RUNNING_PATTERN)?.[1];
		return sum(cue?.match(/\d+/g) ?? []);
	}

	detectTeamMembers(_terminal: Terminal): number {
		return 0;
	}
}
