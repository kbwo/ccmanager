import {describe, expect, it, beforeEach, afterEach, vi} from 'vitest';
import {shortcutManager} from './shortcutManager.js';
import {configReader} from './config/configReader.js';

describe('shortcutManager.matchesRawInput', () => {
	const shortcuts = {
		returnToMenu: {ctrl: true, key: 'e', alt: false, shift: false},
		cancel: {ctrl: true, key: 'c', alt: false, shift: false},
	};

	beforeEach(() => {
		vi.spyOn(configReader, 'getShortcuts').mockReturnValue(shortcuts);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('matches classic control code', () => {
		expect(shortcutManager.matchesRawInput('returnToMenu', '\u0005')).toBe(
			true,
		);
	});

	it('matches CSI u sequence', () => {
		expect(
			shortcutManager.matchesRawInput('returnToMenu', '\u001b[69;5u'),
		).toBe(true);
	});

	it('matches modifyOtherKeys sequence', () => {
		expect(
			shortcutManager.matchesRawInput('returnToMenu', '\u001b[27;5;69~'),
		).toBe(true);
	});

	it('matches CSI 1;5<key>', () => {
		expect(shortcutManager.matchesRawInput('returnToMenu', '\u001b[1;5E')).toBe(
			true,
		);
	});

	it('ignores unrelated input', () => {
		expect(shortcutManager.matchesRawInput('returnToMenu', 'hello')).toBe(
			false,
		);
	});

	/**
	 * The kitty keyboard protocol encodes the modifiers of a keypress as
	 * `1 + <bit mask>`, and that mask carries the *lock state* of the keyboard
	 * (64 for Caps Lock, 128 for Num Lock) alongside the modifiers the user is
	 * actually holding down (1 shift, 2 alt, 4 ctrl). A lock being on is not
	 * part of the keypress, so Ctrl+E must still be recognised as Ctrl+E.
	 *
	 * https://github.com/kbwo/ccmanager/issues/327
	 */
	describe('lock state in the modifier mask (issue #327)', () => {
		it('matches CSI u with the num lock bit set (1 + 4 + 128)', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[101;133u'),
			).toBe(true);
		});

		it('matches CSI u with the caps lock bit set (1 + 4 + 64)', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[101;69u'),
			).toBe(true);
		});

		it('matches CSI u with both lock bits set (1 + 4 + 64 + 128)', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[101;197u'),
			).toBe(true);
		});

		it('matches the uppercase code point with a lock bit set', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[69;133u'),
			).toBe(true);
		});

		it('matches modifyOtherKeys with a lock bit set', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[27;133;101~'),
			).toBe(true);
		});

		it('matches when the sequence is embedded in a larger chunk', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', 'ab\u001b[101;133ucd'),
			).toBe(true);
		});

		it('does not match a different key that carries a lock bit', () => {
			// Ctrl+F (code point 102) while Num Lock is on.
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[102;133u'),
			).toBe(false);
		});

		it('does not match when a real modifier is added (1 + 1 shift + 4 + 128)', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[101;134u'),
			).toBe(false);
		});

		it('does not match when ctrl is absent (1 + 128)', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[101;129u'),
			).toBe(false);
		});

		it('does not match alt instead of ctrl (1 + 2 alt + 128)', () => {
			expect(
				shortcutManager.matchesRawInput('returnToMenu', '\u001b[101;131u'),
			).toBe(false);
		});
	});
});
