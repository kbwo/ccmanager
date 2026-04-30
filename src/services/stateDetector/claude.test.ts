import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {ClaudeStateDetector, IDLE_DEBOUNCE_MS} from './claude.js';
import type {Terminal} from '../../types/index.js';
import {createMockTerminal} from './testUtils.js';

describe('ClaudeStateDetector', () => {
	let detector: ClaudeStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		vi.useFakeTimers();
		detector = new ClaudeStateDetector();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * Helper: call detectState, advance time past IDLE_DEBOUNCE_MS,
	 * then call again with the same terminal to get the debounced result.
	 */
	const detectStateAfterDebounce = (
		det: ClaudeStateDetector,
		term: Terminal,
		currentState: 'idle' | 'busy' | 'waiting_input' = 'idle',
	) => {
		det.detectState(term, currentState);
		vi.advanceTimersByTime(IDLE_DEBOUNCE_MS);
		return det.detectState(term, currentState);
	};

	describe('detectState', () => {
		it('should detect busy when "ESC to interrupt" is above prompt box', () => {
			// Arrange
			terminal = createMockTerminal([
				'Processing...',
				'Press ESC to interrupt',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "esc to interrupt" is present (no prompt box fallback)', () => {
			// Arrange - no prompt box borders, falls back to all content
			terminal = createMockTerminal([
				'Running command...',
				'press esc to interrupt the process',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when "ctrl+c to interrupt" is above prompt box', () => {
			// Arrange
			terminal = createMockTerminal([
				'Googling. (ctrl+c to interrupt',
				'Searching for relevant information...',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect idle when no specific patterns are found (after debounce)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Command completed successfully',
				'Ready for next command',
				'> ',
			]);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'idle');

			// Assert
			expect(state).toBe('idle');
		});

		it('should handle empty terminal', () => {
			// Arrange
			terminal = createMockTerminal([]);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'idle');

			// Assert
			expect(state).toBe('idle');
		});

		it('should maintain current state when "ctrl+r to toggle" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'Press Ctrl+R to toggle history search',
				'More output',
			]);

			// Act - test with different current states
			const idleState = detector.detectState(terminal, 'idle');
			const busyState = detector.detectState(terminal, 'busy');
			const waitingState = detector.detectState(terminal, 'waiting_input');

			// Assert - should maintain whatever the current state was
			expect(idleState).toBe('idle');
			expect(busyState).toBe('busy');
			expect(waitingState).toBe('waiting_input');
		});

		it('should maintain current state for various "ctrl+r" patterns', () => {
			// Arrange - test different case variations
			const patterns = [
				'ctrl+r to toggle',
				'CTRL+R TO TOGGLE',
				'Ctrl+R to toggle history',
				'Press ctrl+r to toggle the search',
			];

			for (const pattern of patterns) {
				terminal = createMockTerminal(['Some output', pattern]);

				// Act
				const state = detector.detectState(terminal, 'busy');

				// Assert - should maintain the current state
				expect(state).toBe('busy');
			}
		});

		it('should detect waiting_input when "Do you want" with options is above prompt box', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some previous output',
				'Do you want to make this edit to test.txt?',
				'❯ 1. Yes',
				'2. Yes, allow all edits during this session (shift+tab)',
				'3. No, and tell Claude what to do differently (esc)',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Do you want" is present (no prompt box fallback)', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'DO YOU WANT to make this edit?',
				'❯ 1. YES',
				'2. NO',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should prioritize "Do you want" with options over busy state', () => {
			// Arrange
			terminal = createMockTerminal([
				'Press ESC to interrupt',
				'Do you want to continue?',
				'❯ 1. Yes',
				'2. No',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input'); // waiting_input should take precedence
		});

		it('should detect waiting_input with "Would you like" and multiple numbered options', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some previous output',
				'Would you like to proceed?',
				'',
				'❯ 1. Yes, and auto-accept edits',
				'  2. Yes, and manually approve edits',
				'  3. No, keep planning',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input with complex multi-line prompt and cursor indicator', () => {
			// Arrange
			terminal = createMockTerminal([
				'Processing complete.',
				'Would you like to apply these changes?',
				'',
				'❯ 1. Yes, apply all changes',
				'  2. Yes, review changes first',
				'  3. No, discard changes',
				'  4. Cancel operation',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when cursor indicator is present without explicit "yes" text', () => {
			// Arrange
			terminal = createMockTerminal([
				'Do you want to proceed?',
				'',
				'❯ 1. Apply all',
				'  2. Review first',
				'  3. Skip',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "Yes" has characters before it (e.g., "❯ 1. Yes")', () => {
			// Arrange
			terminal = createMockTerminal([
				'Do you want to continue?',
				'❯ 1. Yes',
				'  2. No',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "esc to cancel" is above prompt box', () => {
			// Arrange
			terminal = createMockTerminal([
				'Enter your message:',
				'Press esc to cancel',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect waiting_input when "esc to cancel" is present (no prompt box fallback)', () => {
			// Arrange
			terminal = createMockTerminal(['Waiting for input', 'ESC TO CANCEL']);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should prioritize "esc to cancel" over "esc to interrupt" when both above prompt box', () => {
			// Arrange
			terminal = createMockTerminal([
				'Press esc to interrupt',
				'Some input prompt',
				'Press esc to cancel',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('waiting_input');
		});

		it('should detect idle when scrolled past old busy state (baseY > 0)', () => {
			// Arrange - Simulate scrollback where "esc to interrupt" is in history
			// but the current viewport (baseY=5, rows=3) shows idle content
			// Buffer: [0]: "Old content", [1]: "esc to interrupt", [2]: "More busy output",
			//         [3]: "...", [4]: "...", [5]: "Ready", [6]: "Prompt >", [7]: "idle"
			// Viewport shows lines 5-7 (baseY=5, rows=3)
			terminal = createMockTerminal(
				[
					'Old content',
					'Previous output with esc to interrupt marker',
					'More old busy output',
					'Transition content',
					'Processing done',
					'Ready for input',
					'Prompt >',
					'idle state here',
				],
				{baseY: 5, rows: 3},
			);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'busy');

			// Assert - Should detect idle because viewport shows lines 5-7
			expect(state).toBe('idle');
		});

		it('should detect busy when scrolled to busy state (baseY shows busy content)', () => {
			// Arrange - Viewport shows busy content
			// Buffer has old idle content at top, busy content in viewport
			terminal = createMockTerminal(
				[
					'Old idle content',
					'Previous prompt',
					'User input',
					'Processing request...',
					'Press esc to interrupt',
					'Working...',
				],
				{baseY: 3, rows: 3},
			);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert - Should detect busy because viewport shows lines 3-5
			expect(state).toBe('busy');
		});

		it('should detect waiting_input when viewport shows prompt after scroll', () => {
			// Arrange - Scrollback has busy markers, but viewport shows waiting prompt
			terminal = createMockTerminal(
				[
					'Previous busy content',
					'esc to interrupt was here',
					'Old output',
					'Do you want to continue?',
					'❯ 1. Yes',
					'  2. No',
				],
				{baseY: 3, rows: 3},
			);

			// Act
			const state = detector.detectState(terminal, 'busy');

			// Assert - Should detect waiting_input from viewport
			expect(state).toBe('waiting_input');
		});

		it('should detect busy when spinner activity label "✽ Tempering…" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'✽ Tempering…',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy when spinner activity label "✳ Simplifying…" is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'✳ Simplifying recompute_tangents… (2m 18s · ↓ 4.8k tokens)',
				'  ⎿  ◻ task list items...',
				'──────────────────────────────',
				'❯',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert
			expect(state).toBe('busy');
		});

		it('should detect busy for middle-dot activity label "· …ing…" (e.g. · Misting…)', () => {
			terminal = createMockTerminal([
				'· Misting…',
				'   ⎿  Tip: Run /terminal-setup to enable convenient terminal integration',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			expect(detector.detectState(terminal, 'idle')).toBe('busy');
		});

		it('should detect busy when token stats line is above prompt box without interrupt or spinner', () => {
			terminal = createMockTerminal([
				'(9m 21s · ↓ 13.7k tokens)',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			expect(detector.detectState(terminal, 'idle')).toBe('busy');
		});

		it('should detect busy for token stats line with varied spacing and casing', () => {
			terminal = createMockTerminal([
				'  ( 1m · 500 TOKENS )  ',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			expect(detector.detectState(terminal, 'idle')).toBe('busy');
		});

		it('should not treat parenthetical text with "tokens" but no digit as busy', () => {
			terminal = createMockTerminal([
				'(see tokens in docs)',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			expect(detectStateAfterDebounce(detector, terminal, 'idle')).toBe('idle');
		});

		it('should detect busy with various spinner characters', () => {
			const spinnerChars = [
				'✱',
				'✲',
				'✳',
				'✴',
				'✵',
				'✶',
				'✷',
				'✸',
				'✹',
				'✺',
				'✻',
				'✼',
				'✽',
				'✾',
				'✿',
				'❀',
				'❁',
				'❂',
				'❃',
				'❇',
				'❈',
				'❉',
				'❊',
				'❋',
				'✢',
				'✣',
				'✤',
				'✥',
				'✦',
				'✧',
			];

			for (const char of spinnerChars) {
				terminal = createMockTerminal([`${char} Kneading…`, '❯']);
				const state = detector.detectState(terminal, 'idle');
				expect(state).toBe('busy');
			}
		});

		it('should not detect busy for spinner-like line without ing… suffix', () => {
			// Arrange - no "ing…" at end
			terminal = createMockTerminal(['✽ Some random text', '❯']);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'idle');

			// Assert
			expect(state).toBe('idle');
		});

		it('should detect idle when "⌕ Search…" is present even with spinner activity', () => {
			// Arrange
			terminal = createMockTerminal(['⌕ Search…', '✽ Tempering…']);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'busy');

			// Assert - Search prompt takes precedence
			expect(state).toBe('idle');
		});

		it('should detect idle when "⌕ Search…" is present', () => {
			// Arrange - Search prompt should always be idle
			terminal = createMockTerminal(['⌕ Search…', 'Some content']);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'busy');

			// Assert
			expect(state).toBe('idle');
		});

		it('should detect idle when "⌕ Search…" is present even with "esc to cancel"', () => {
			// Arrange
			terminal = createMockTerminal(['⌕ Search…', 'esc to cancel']);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'idle');

			// Assert - Should be idle because search prompt takes precedence
			expect(state).toBe('idle');
		});

		it('should detect idle when "⌕ Search…" is present even with "esc to interrupt"', () => {
			// Arrange
			terminal = createMockTerminal(['⌕ Search…', 'Press esc to interrupt']);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'idle');

			// Assert - Should be idle because search prompt takes precedence
			expect(state).toBe('idle');
		});

		it('should detect busy when spinner + token stats header is followed by a long TodoWrite checklist', () => {
			// Regression: the recent block contains a spinner/token header and
			// many checklist items with no internal blank line. All lines are
			// part of the same contiguous update and should be inspected.
			terminal = createMockTerminal([
				'✽ Add GitHub Actions workflow and commit… (50s · ↓ 794 tokens)',
				'  ⎿  ✔ Create docs/index.config.json',
				'     ✔ Reorganize existing docs into topic directories',
				'     ✔ Add frontmatter to existing docs',
				'     ✔ Create docs/INDEX.md, docs/README.md, templates, workflow',
				'     ✔ Create root AGENTS.md and README.md',
				'     ✔ Write manifest generation Go script',
				'     ✔ Add Makefile tasks and run first generation',
				'     ◼ Add GitHub Actions workflow and commit',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			const state = detector.detectState(terminal, 'idle');

			expect(state).toBe('busy');
		});

		it('should ignore stale spinner output outside the latest block above the prompt box', () => {
			terminal = createMockTerminal([
				'✻ Seasoning… (44s · ↓ 247 tokens)',
				'  ⎿ Tip: Use /btw to ask a quick side question',
				'',
				'⏺ 全て通過。',
				'',
				'  - lint: pass (0 errors)',
				'  - typecheck: pass',
				'  - tests: 56 files, 775 passed, 5 skipped',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			const state = detectStateAfterDebounce(detector, terminal, 'busy');

			expect(state).toBe('idle');
		});

		it('should ignore stale interrupt text outside the latest block above the prompt box', () => {
			terminal = createMockTerminal([
				'Press esc to interrupt',
				'Working...',
				'',
				'Command completed successfully',
				'Ready for next command',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			const state = detectStateAfterDebounce(detector, terminal, 'busy');

			expect(state).toBe('idle');
		});

		it('should ignore "esc to interrupt" inside prompt box', () => {
			// Arrange - "esc to interrupt" is inside the prompt box, not above it
			terminal = createMockTerminal([
				'Some idle output',
				'──────────────────────────────',
				'esc to interrupt',
				'──────────────────────────────',
			]);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'idle');

			// Assert - should be idle because "esc to interrupt" is inside prompt box
			expect(state).toBe('idle');
		});

		it('should detect "esc to cancel" inside prompt box as waiting_input', () => {
			// Arrange - waiting_input detection uses full content including prompt box
			terminal = createMockTerminal([
				'Some idle output',
				'──────────────────────────────',
				'esc to cancel',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert - waiting_input is not restricted to above prompt box
			expect(state).toBe('waiting_input');
		});

		it('should detect "Do you want" inside prompt box as waiting_input', () => {
			// Arrange - waiting_input detection uses full content including prompt box
			terminal = createMockTerminal([
				'Some idle output',
				'──────────────────────────────',
				'Do you want to proceed?',
				'❯ 1. Yes',
				'──────────────────────────────',
			]);

			// Act
			const state = detector.detectState(terminal, 'idle');

			// Assert - waiting_input is not restricted to above prompt box
			expect(state).toBe('waiting_input');
		});

		it('should ignore spinner activity label inside prompt box', () => {
			// Arrange - spinner label is inside the prompt box
			terminal = createMockTerminal([
				'Some idle output',
				'──────────────────────────────',
				'✽ Tempering…',
				'──────────────────────────────',
			]);

			// Act
			const state = detectStateAfterDebounce(detector, terminal, 'idle');

			// Assert - should be idle because spinner is inside prompt box
			expect(state).toBe('idle');
		});

		describe('idle debounce', () => {
			it('should not return idle immediately when output just appeared', () => {
				terminal = createMockTerminal(['Command completed successfully', '> ']);

				const state = detector.detectState(terminal, 'busy');

				// Should remain busy because debounce hasn't elapsed
				expect(state).toBe('busy');
			});

			it('should return idle after output is stable for IDLE_DEBOUNCE_MS', () => {
				terminal = createMockTerminal(['Command completed successfully', '> ']);

				// First call registers the content
				detector.detectState(terminal, 'busy');

				// Advance time past debounce threshold
				vi.advanceTimersByTime(IDLE_DEBOUNCE_MS);

				// Second call with same content should return idle
				const state = detector.detectState(terminal, 'busy');
				expect(state).toBe('idle');
			});

			it('should reset debounce timer when output changes', () => {
				terminal = createMockTerminal(['Output v1', '> ']);
				detector.detectState(terminal, 'busy');

				// Advance almost to threshold
				vi.advanceTimersByTime(IDLE_DEBOUNCE_MS - 100);

				// Output changes
				terminal = createMockTerminal(['Output v2', '> ']);
				const state1 = detector.detectState(terminal, 'busy');
				expect(state1).toBe('busy');

				// Advance past original threshold but not new one
				vi.advanceTimersByTime(200);
				const state2 = detector.detectState(terminal, 'busy');
				expect(state2).toBe('busy');

				// Advance to meet new threshold
				vi.advanceTimersByTime(IDLE_DEBOUNCE_MS);
				const state3 = detector.detectState(terminal, 'busy');
				expect(state3).toBe('idle');
			});

			it('should not debounce busy transitions', () => {
				terminal = createMockTerminal([
					'Processing...',
					'Press ESC to interrupt',
					'──────────────────────────────',
					'❯',
					'──────────────────────────────',
				]);

				// Busy should be detected immediately without debounce
				const state = detector.detectState(terminal, 'idle');
				expect(state).toBe('busy');
			});

			it('should not debounce waiting_input transitions', () => {
				terminal = createMockTerminal([
					'Do you want to continue?',
					'❯ 1. Yes',
					'  2. No',
				]);

				// waiting_input should be detected immediately
				const state = detector.detectState(terminal, 'idle');
				expect(state).toBe('waiting_input');
			});
		});
	});

	describe('detectBackgroundTask', () => {
		it('should return count 1 when "1 background task" is in status bar', () => {
			// Arrange
			terminal = createMockTerminal([
				'Previous conversation content',
				'More content',
				'> Some command output',
				'1 background task | api-call',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(1);
		});

		it('should return count 2 when "2 background tasks" is in status bar', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'More output',
				'2 background tasks running',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(2);
		});

		it('should return count 3 when "3 background tasks" is in status bar', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'More output',
				'3 background tasks | build, test, lint',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(3);
		});

		it('should detect background task count case-insensitively', () => {
			// Arrange
			terminal = createMockTerminal([
				'Output line 1',
				'Output line 2',
				'1 BACKGROUND TASK running',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(1);
		});

		it('should return 0 when no background task pattern in last 3 lines', () => {
			// Arrange
			terminal = createMockTerminal([
				'Command completed successfully',
				'Ready for next command',
				'> ',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(0);
		});

		it('should not detect background task when pattern is in conversation content (not status bar)', () => {
			// Arrange - "background task" mentioned earlier in conversation, but not in last 3 lines
			terminal = createMockTerminal([
				'User: Tell me about background task handling',
				'Assistant: Background task detection works by...',
				'The pattern "background task" appears in text but...',
				'This is the status bar area',
				'> idle',
				'Ready',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert - should only check last 3 lines, not the conversation content
			expect(count).toBe(0);
		});

		it('should return 0 for empty terminal', () => {
			// Arrange
			terminal = createMockTerminal([]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(0);
		});

		it('should handle terminal with fewer than 3 lines', () => {
			// Arrange
			terminal = createMockTerminal(['1 background task']);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(1);
		});

		it('should return 1 when "(running)" status bar indicator is present', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some conversation output',
				'More output',
				'bypass permissions on - uv run pytest tests/integration/e2e/tes... (running)',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(1);
		});

		it('should detect "(running)" case-insensitively', () => {
			// Arrange
			terminal = createMockTerminal(['Some output', 'command name (RUNNING)']);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(1);
		});

		it('should return count 3 when "3 local agents" is in status bar', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'More output',
				'bypass permissions on - 3 local agents',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(3);
		});

		it('should return count 1 when "1 local agent" is in status bar', () => {
			// Arrange
			terminal = createMockTerminal(['Some output', '1 local agent']);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(1);
		});

		it('should detect local agent count case-insensitively', () => {
			// Arrange
			terminal = createMockTerminal([
				'Output line 1',
				'Output line 2',
				'2 LOCAL AGENTS running',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(2);
		});

		it('should prioritize explicit count from "N local agents" over "(running)"', () => {
			// Arrange
			terminal = createMockTerminal([
				'Some output',
				'3 local agents | task1 (running)',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(3);
		});

		it('should prioritize count from "N background task" over "(running)"', () => {
			// Arrange - both patterns present, count should be from explicit pattern
			terminal = createMockTerminal([
				'Some output',
				'3 background tasks | task1, task2 (running)',
			]);

			// Act
			const count = detector.detectBackgroundTask(terminal);

			// Assert
			expect(count).toBe(3);
		});
	});

	describe('hasTransientRenderFooter', () => {
		it('returns true when viewport contains spinner activity label', () => {
			terminal = createMockTerminal([
				'✶ Befuddling… (1m 1s · ↓ 283 tokens)',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			expect(detector.hasTransientRenderFooter(terminal)).toBe(true);
		});

		it('returns true when viewport contains a token stats line', () => {
			terminal = createMockTerminal([
				'(9m 21s · ↓ 13.7k tokens)',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
			]);

			expect(detector.hasTransientRenderFooter(terminal)).toBe(true);
		});

		it('returns false for a steady idle viewport that only shows the persistent shift+tab footer', () => {
			// The "(shift+tab to cycle)" line is rendered even when nothing
			// is scrolling, so on its own it does not imply scrollback ghosts.
			terminal = createMockTerminal([
				'Some idle conversation',
				'──────────────────────────────',
				'❯',
				'──────────────────────────────',
				'⏵⏵ accept edits on (shift+tab to cycle)',
			]);

			expect(detector.hasTransientRenderFooter(terminal)).toBe(false);
		});

		it('returns true when viewport contains "esc to interrupt"', () => {
			terminal = createMockTerminal([
				'Working...',
				'Press esc to interrupt',
				'❯',
			]);

			expect(detector.hasTransientRenderFooter(terminal)).toBe(true);
		});

		it('returns true when viewport contains "ctrl+c to interrupt"', () => {
			terminal = createMockTerminal(['Searching… (ctrl+c to interrupt)', '❯']);

			expect(detector.hasTransientRenderFooter(terminal)).toBe(true);
		});

		it('returns false on a quiet idle viewport without footer markers', () => {
			terminal = createMockTerminal([
				'Some output',
				'Command completed successfully',
				'> ',
			]);

			expect(detector.hasTransientRenderFooter(terminal)).toBe(false);
		});

		it('returns false for an empty terminal', () => {
			terminal = createMockTerminal([]);

			expect(detector.hasTransientRenderFooter(terminal)).toBe(false);
		});
	});

	describe('detectTeamMembers', () => {
		it('should return 2 when two @name members are present with shift+↑ to expand', () => {
			terminal = createMockTerminal([
				'Some output',
				'@main @architect · shift+↑ to expand',
			]);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(2);
		});

		it('should return 4 when four @name members are present', () => {
			terminal = createMockTerminal([
				'Some output',
				'@main @architect @devils-advocate @ux-specialist · shift+↑ to expand',
			]);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(4);
		});

		it('should return 0 when no team line is present', () => {
			terminal = createMockTerminal([
				'Command completed successfully',
				'Ready for next command',
				'> ',
			]);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(0);
		});

		it('should return 0 when shift+↑ to expand is not present', () => {
			terminal = createMockTerminal([
				'Some output with @mention',
				'Normal text',
			]);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(0);
		});

		it('should not match other shift+ shortcuts', () => {
			terminal = createMockTerminal([
				'@main @architect · shift+tab to auto-approve',
			]);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(0);
		});

		it('should return 0 for empty terminal', () => {
			terminal = createMockTerminal([]);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(0);
		});

		it('should handle shift+up to expand variant', () => {
			terminal = createMockTerminal(['@main @architect · shift+up to expand']);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(2);
		});

		it('should handle case-insensitive shift+↑ to expand', () => {
			terminal = createMockTerminal(['@main @architect · SHIFT+↑ TO EXPAND']);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(2);
		});

		it('should handle @name patterns with hyphens', () => {
			terminal = createMockTerminal([
				'@team-lead @code-reviewer · shift+↑ to expand',
			]);

			const count = detector.detectTeamMembers(terminal);

			expect(count).toBe(2);
		});
	});
});
