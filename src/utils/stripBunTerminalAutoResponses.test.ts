import {describe, it, expect} from 'vitest';
import {
	stripBunTerminalAutoResponses,
	createBunTerminalOutputSanitizer,
} from './stripBunTerminalAutoResponses.js';

describe('stripBunTerminalAutoResponses', () => {
	it('removes libvterm DCS identify and Primary DA response', () => {
		const raw = 'prompt\x1bP>|libvterm(0.3)\x1b\\\x1b[?1;2ctail';
		expect(stripBunTerminalAutoResponses(raw)).toBe('prompttail');
	});

	it('removes Secondary DA-style response', () => {
		const raw = 'x\x1b[>65;320;1c\n';
		expect(stripBunTerminalAutoResponses(raw)).toBe('x\n');
	});

	it('preserves normal SGR and cursor sequences', () => {
		const raw = '\x1b[31mred\x1b[0m\x1b[2J';
		expect(stripBunTerminalAutoResponses(raw)).toBe(raw);
	});

	it('handles BEL-terminated DCS', () => {
		const raw = 'a\x1bP>|libvterm(0.3)\x07b';
		expect(stripBunTerminalAutoResponses(raw)).toBe('ab');
	});
});

describe('createBunTerminalOutputSanitizer', () => {
	it('strips auto-responses split across chunks', () => {
		const s = createBunTerminalOutputSanitizer();
		expect(s.push('pre\x1bP>|lib')).toBe('pre');
		expect(s.push('vterm(0.3)\x1b\\\x1b[?1;2c')).toBe('');
		expect(s.push('ok')).toBe('ok');
	});

	it('holds trailing ESC until continuation arrives', () => {
		const s = createBunTerminalOutputSanitizer();
		expect(s.push('ok\x1b')).toBe('ok');
		expect(s.push('[?1;2c')).toBe('');
		expect(s.push('.')).toBe('.');
	});

	it('flush emits carry after strip', () => {
		const s = createBunTerminalOutputSanitizer();
		expect(s.push('z\x1b')).toBe('z');
		expect(s.flush()).toBe('\x1b');
	});
});
