import {beforeEach, describe, expect, it} from 'vitest';
import type {Terminal} from '../../types/index.js';
import {createStateDetector} from './index.js';
import {MCodeStateDetector} from './mcode.js';
import {createMockTerminal} from './testUtils.js';

describe('MCodeStateDetector', () => {
	let detector: MCodeStateDetector;
	let terminal: Terminal;

	beforeEach(() => {
		detector = new MCodeStateDetector();
	});

	it('detects the published MCode ready footer as idle', () => {
		terminal = createMockTerminal([
			'╭─ v0.1.2                         ● Ready ─╮',
			'│ Start · @ file · / autocomplete        │',
			'╰─────────────────────────────────────────╯',
		]);

		expect(detector.detectState(terminal, 'busy')).toBe('idle');
	});

	it('is selected by the mcode strategy', () => {
		expect(createStateDetector('mcode')).toBeInstanceOf(MCodeStateDetector);
	});

	it('detects an active runtime turn as busy', () => {
		terminal = createMockTerminal([
			'session: mvs_abc | turn: turn_123 running 3s | local-runtime',
		]);

		expect(detector.detectState(terminal, 'idle')).toBe('busy');
	});

	it('detects the compact running status as busy', () => {
		terminal = createMockTerminal(['session: mvs_abc | turn: running']);

		expect(detector.detectState(terminal, 'idle')).toBe('busy');
	});

	it.each([
		'permission: pending',
		'[permission] permission.ask',
		'ask_user: pending',
		'[ask_user] questionnaire.ask',
	])('detects %s as waiting for input', marker => {
		terminal = createMockTerminal([
			'session: mvs_abc | turn: turn_123 running 3s',
			marker,
		]);

		expect(detector.detectState(terminal, 'busy')).toBe('waiting_input');
	});

	it('does not mistake historical thinking text for an active turn', () => {
		terminal = createMockTerminal([
			'Assistant: Thinking through the previous request...',
			'╭─ v0.1.2                         ● Ready ─╮',
		]);

		expect(detector.detectState(terminal, 'busy')).toBe('idle');
	});

	it('reports no background tasks or team members', () => {
		terminal = createMockTerminal([]);

		expect(detector.detectBackgroundTask(terminal)).toBe(0);
		expect(detector.detectTeamMembers(terminal)).toBe(0);
	});
});
