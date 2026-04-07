import {SessionState, Terminal} from '../../types/index.js';
import {BaseStateDetector} from './base.js';

// Spinner characters used by Claude Code during active processing
const SPINNER_CHARS = '✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❇❈❉❊❋✢✣✤✥✦✧✨⊛⊕⊙◉◎◍⁂⁕※⍟☼★☆';

// Matches spinner activity labels like "✽ Tempering…" or "✳ Simplifying recompute_tangents…"
const SPINNER_ACTIVITY_PATTERN = new RegExp(
	`^[${SPINNER_CHARS}] \\S+ing.*\u2026`,
	'm',
);

const BUSY_LOOKBACK_LINES = 5;

export class ClaudeStateDetector extends BaseStateDetector {
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

		const recentBlock = lines.slice(Math.max(start, 0));
		return recentBlock.slice(-BUSY_LOOKBACK_LINES).join('\n');
	}

	detectState(terminal: Terminal, currentState: SessionState): SessionState {
		// Check for search prompt (⌕ Search…) within 200 lines - always idle
		const extendedContent = this.getTerminalContent(terminal, 200);
		if (extendedContent.includes('⌕ Search…')) {
			return 'idle';
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

		// Otherwise idle
		return 'idle';
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
