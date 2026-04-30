import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

// Spinner / activity-prefix characters (line must still match SPINNER_ACTIVITY_PATTERN: …ing + …)
// Includes: ornament spinners; · / • / ∙ / ⋅ bullets; ⏺ (record); ▸▹ triangles; ○● circles
const SPINNER_CHARS = '✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❇❈❉❊❋✢✣✤✥✦✧✨⊛⊕⊙◉◎◍⁂⁕※⍟☼★☆·•⏺▸▹∙⋅○●';

// Matches spinner activity labels like "✽ Tempering…", "✳ Simplifying…", or "· Misting…"
const SPINNER_ACTIVITY_PATTERN = new RegExp(
	`^[${SPINNER_CHARS}] \\S+ing.*\u2026`,
	'm',
);

// Session stats above the prompt, e.g. "(9m 21s · ↓ 13.7k tokens)" — requires parens, a digit, and "tokens"
const TOKEN_STATS_LINE_PATTERN = /\([^)]*\d[^)]*tokens\s*\)/i;

// Persistent footer hint Claude renders below the prompt box, e.g.
// "⏵⏵ accept edits on (shift+tab to cycle)". The redraw of this footer is
// what produces the most visible scrollback ghosts when chat content scrolls.
const PERSISTENT_FOOTER_PATTERN = /\(shift\+tab\s+to\s+cycle\)/i;

// Workaround: Claude Code sometimes appears idle in terminal output while
// still actively processing (busy). To mitigate false idle transitions,
// require terminal output to remain unchanged for this duration before
// confirming the idle state.
export const IDLE_DEBOUNCE_MS = 1500;

export class ClaudeStateDetector extends BaseStateDetector {
	private lastContentHash: string = '';
	private contentStableSince: number = 0;

	/**
	 * Debounce idle transitions: only return 'idle' when the terminal
	 * content has been unchanged for IDLE_DEBOUNCE_MS.
	 * Returns currentState if output is still changing.
	 *
	 * This is a workaround for Claude Code occasionally showing idle-like
	 * terminal output while still busy (e.g. during screen redraws).
	 */
	private debounceIdle(
		terminal: Terminal,
		currentState: SessionState,
		now: number = Date.now(),
	): SessionState {
		const content = this.getTerminalContent(terminal, 30);
		if (content !== this.lastContentHash) {
			this.lastContentHash = content;
			this.contentStableSince = now;
		}

		const stableDuration = now - this.contentStableSince;
		if (stableDuration >= IDLE_DEBOUNCE_MS) {
			return 'idle';
		}

		return currentState;
	}
	/**
	 * Extract content above the prompt box.
	 * The prompt box is delimited by ─ border lines:
	 *   content above prompt box
	 *   ─────────────── (top border)
	 *   ❯              (prompt line)
	 *   ─────────────── (bottom border)
	 *
	 * If no prompt box is found, returns all content as fallback.
	 */
	private getContentAbovePromptBox(
		terminal: Terminal,
		maxLines: number,
	): string {
		const lines = this.getTerminalLines(terminal, maxLines);

		let borderCount = 0;
		for (let i = lines.length - 1; i >= 0; i--) {
			const trimmed = lines[i]!.trim();
			if (trimmed.length > 0 && /^─+$/.test(trimmed)) {
				borderCount++;
				if (borderCount === 2) {
					return lines.slice(0, i).join('\n');
				}
			}
		}

		// No prompt box found, return all content
		return lines.join('\n');
	}

	/**
	 * Claude Code frequently redraws the lower pane using cursor-addressed updates.
	 * xterm's buffer can retain transient fragments from those redraws outside the
	 * latest visible content block, so busy detection should only inspect the most
	 * recent contiguous block directly above the prompt box.
	 */
	private getRecentContentAbovePromptBox(
		terminal: Terminal,
		maxLines: number,
	): string {
		const lines = this.getContentAbovePromptBox(terminal, maxLines).split('\n');

		while (lines.length > 0) {
			const trimmed = lines[lines.length - 1]!.trim();
			if (trimmed === '' || trimmed === '❯' || /^[-─\s]+$/.test(trimmed)) {
				lines.pop();
				continue;
			}
			break;
		}

		if (lines.length === 0) {
			return '';
		}

		let start = lines.length - 1;
		while (start >= 0) {
			const trimmed = lines[start]!.trim();
			if (trimmed === '' || /^[-─\s]+$/.test(trimmed)) {
				start++;
				break;
			}
			start--;
		}

		return lines.slice(Math.max(start, 0)).join('\n');
	}

	detectState(terminal: Terminal, currentState: SessionState): SessionState {
		// Check for search prompt (⌕ Search…) within 200 lines - always idle (debounced)
		const extendedContent = this.getTerminalContent(terminal, 200);
		if (extendedContent.includes('⌕ Search…')) {
			return this.debounceIdle(terminal, currentState);
		}

		// Full content (including prompt box) for waiting_input detection
		const fullContent = this.getTerminalContent(terminal, 30);
		const fullLowerContent = fullContent.toLowerCase();

		// Check for ctrl+r toggle prompt - maintain current state
		if (fullLowerContent.includes('ctrl+r to toggle')) {
			return currentState;
		}

		// Check for "Do you want" or "Would you like" pattern with options
		// Handles both simple ("Do you want...\nYes") and complex (numbered options) formats
		if (
			/(?:do you want|would you like).+\n+[\s\S]*?(?:yes|❯)/.test(
				fullLowerContent,
			)
		) {
			return 'waiting_input';
		}

		// Check for "esc to cancel" - indicates waiting for user input
		if (fullLowerContent.includes('esc to cancel')) {
			return 'waiting_input';
		}

		// Content above the prompt box only for busy detection
		const abovePromptBox = this.getRecentContentAbovePromptBox(terminal, 30);
		const aboveLowerContent = abovePromptBox.toLowerCase();

		// Check for busy state
		if (
			aboveLowerContent.includes('esc to interrupt') ||
			aboveLowerContent.includes('ctrl+c to interrupt')
		) {
			return 'busy';
		}

		// Check for spinner activity label (e.g., "✽ Tempering…", "✳ Simplifying…")
		if (SPINNER_ACTIVITY_PATTERN.test(abovePromptBox)) {
			return 'busy';
		}

		// Usage/time + token count line (often shown above the prompt while a turn is active)
		if (TOKEN_STATS_LINE_PATTERN.test(abovePromptBox)) {
			return 'busy';
		}

		// Otherwise idle (debounced)
		return this.debounceIdle(terminal, currentState);
	}

	detectBackgroundTask(terminal: Terminal): number {
		const lines = this.getTerminalLines(terminal, 3);
		const content = lines.join('\n').toLowerCase();

		// Check for "N background task(s)" pattern first (content already lowercased)
		const countMatch = content.match(
			/(\d+)\s+(?:background\s+task|local\s+agent)/,
		);
		if (countMatch?.[1]) {
			return parseInt(countMatch[1], 10);
		}

		// Check for "(running)" pattern - indicates at least 1 background task
		if (content.includes('(running)')) {
			return 1;
		}

		// No background task detected
		return 0;
	}

	override hasTransientRenderFooter(terminal: Terminal): boolean {
		const viewport = this.getTerminalContent(terminal, terminal.rows);
		if (viewport.length === 0) {
			return false;
		}
		if (SPINNER_ACTIVITY_PATTERN.test(viewport)) {
			return true;
		}
		if (TOKEN_STATS_LINE_PATTERN.test(viewport)) {
			return true;
		}
		if (PERSISTENT_FOOTER_PATTERN.test(viewport)) {
			return true;
		}
		const lower = viewport.toLowerCase();
		if (
			lower.includes('esc to interrupt') ||
			lower.includes('ctrl+c to interrupt')
		) {
			return true;
		}
		return false;
	}

	detectTeamMembers(terminal: Terminal): number {
		const lines = this.getTerminalLines(terminal, 3);

		// Look for the team member line containing "shift+↑ to expand"
		const teamLine = lines.find(line => {
			const lower = line.toLowerCase();
			return (
				lower.includes('shift+↑ to expand') ||
				lower.includes('shift+up to expand')
			);
		});
		if (!teamLine) return 0;

		// Extract @name patterns
		const members = teamLine.match(/@[\w-]+/g);
		return members ? members.length : 0;
	}
}
