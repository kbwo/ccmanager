import {describe, it, expect, beforeEach} from 'vitest';
import {ShellStateDetector} from './shell.js';
import {createMockTerminal} from './testUtils.js';

describe('ShellStateDetector', () => {
	let detector: ShellStateDetector;

	beforeEach(() => {
		detector = new ShellStateDetector();
	});

	it('always reports idle, regardless of terminal content', () => {
		const terminal = createMockTerminal([
			'user@host project % ls',
			'src  package.json  README.md',
			'user@host project % ',
		]);
		expect(detector.detectState(terminal, 'busy')).toBe('idle');
	});

	it('reports idle for an empty terminal', () => {
		const terminal = createMockTerminal([]);
		expect(detector.detectState(terminal, 'idle')).toBe('idle');
	});

	it('reports idle even when output resembles agent busy text', () => {
		const terminal = createMockTerminal(['esc to interrupt', 'Thinking...']);
		expect(detector.detectState(terminal, 'idle')).toBe('idle');
	});

	it('never reports background tasks or team members', () => {
		const terminal = createMockTerminal(['some output']);
		expect(detector.detectBackgroundTask(terminal)).toBe(0);
		expect(detector.detectTeamMembers(terminal)).toBe(0);
	});
});
