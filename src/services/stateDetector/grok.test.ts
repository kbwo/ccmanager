import {beforeEach, describe, expect, it} from 'vitest';
import {createStateDetector} from './index.js';
import {GrokStateDetector} from './grok.js';
import {createMockTerminal} from './testUtils.js';

describe('GrokStateDetector', () => {
	let detector: GrokStateDetector;

	beforeEach(() => {
		detector = new GrokStateDetector();
	});

	it('is selected by the grok strategy', () => {
		expect(createStateDetector('grok')).toBeInstanceOf(GrokStateDetector);
	});

	it.each([
		'⠧ Thinking… 0.2s                         1m20s ⇣12k [stop]',
		'⠋ Run cargo test 3.1s                              12s [stop]',
		'  ⠼ Starting session… 0.4s',
	])('detects the turn status row "%s" as busy', row => {
		const terminal = createMockTerminal(['◆ Read src/main.rs', row, '> ']);

		expect(detector.detectState(terminal, 'idle')).toBe('busy');
	});

	it.each([
		// permission prompt
		'1/5:select  │  Tab:next option  │  ←/→:scope  │  e:edit pattern  │  Ctrl+o:always-approve  │  Ctrl+c:cancel',
		// cancel-turn panel
		'1/4:select  │  Tab:next choice  │  Enter:confirm  │  Esc:keep running',
		// ask_user_question card
		'Tab:next answer  │  Esc:back  │  x:dismiss',
		// MCP elicitation card
		'Enter:accept / toggle  │  d:decline  │  Ctrl+c:cancel  │  Tab:next field',
		'◆ Waiting on answers for Which database?',
		'◆ Waiting on plan approval',
		'◆ No plan written: approve or request changes',
		'      Do you trust the contents of this directory?',
		// permission prompt after Esc: only its option rows remain
		'  4 (○) No, reject (type to add feedback)',
		'  4 (●) No, reject (type to add feedback)',
	])('detects "%s" as waiting_input', line => {
		const terminal = createMockTerminal(['◆ Run rm -rf build', line]);

		expect(detector.detectState(terminal, 'busy')).toBe('waiting_input');
	});

	it('prefers waiting_input over a subagent spinner', () => {
		const terminal = createMockTerminal([
			'⠧ subagent: explore',
			'◆ Run git push',
			'1/2:select  │  Tab:next option  │  Esc:back',
		]);

		expect(detector.detectState(terminal, 'busy')).toBe('waiting_input');
	});

	it.each([
		// finished transcript: the diamond is the ordinary entry bullet
		['◆ Read src/main.rs', '◆ Done. All tests pass.', '> '],
		// background work left running after the turn ended
		['◆ Started the dev server', '○ 1 command still running', '> '],
		// turn parked on a wait that any message interrupts
		['◎ waiting · send a message to interrupt', '> '],
	])('detects a screen without a turn spinner as idle', (...lines) => {
		const terminal = createMockTerminal(lines);

		expect(detector.detectState(terminal, 'busy')).toBe('idle');
	});

	it.each([
		['   ▾ Tasks 1', 1],
		['   ▸ Watchers 12', 12],
		['   ▾ Subagents 2', 0],
		['   ▾ Queued 1', 0],
		['◎ 1 command still running', 1],
		['◎ 1 command · 2 monitors · 1 loop · 3 subagents still running', 7],
		['◎ 2 commands still running · send a message to interrupt', 2],
		['◎ waiting · send a message to interrupt', 0],
		['◆ Ran 3 tests, 2 still running', 0],
	])('counts background work in "%s"', (line, expected) => {
		const terminal = createMockTerminal(['◆ Started the dev server', line]);

		expect(detector.detectBackgroundTask(terminal)).toBe(expected);
	});
});
