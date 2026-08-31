import {ShortcutKey, ShortcutConfig} from '../types/index.js';
import {Key} from 'ink';
import {configReader} from './config/configReader.js';

/**
 * Bits that extended keyboard protocols add to the modifier mask of a keypress
 * to report the *lock state* of the keyboard rather than a key the user is
 * holding down. Laptops commonly boot with Num Lock on internally even without
 * a numpad, so these bits show up on ordinary shortcuts and must be ignored
 * when deciding which shortcut a keypress belongs to.
 * https://github.com/kbwo/ccmanager/issues/327
 */
const CAPS_LOCK_BIT = 64;
const NUM_LOCK_BIT = 128;
const LOCK_STATE_BITS = CAPS_LOCK_BIT | NUM_LOCK_BIT;

/**
 * Kitty keyboard protocol (also used by WezTerm and Ghostty):
 * `ESC [ <code point> ; <modifiers> u`.
 * The code point may be followed by alternate key reports
 * (`code:shifted:base`), the modifiers by an event type (`modifiers:event`,
 * 1 press / 2 repeat / 3 release), and the whole sequence by a trailing field
 * carrying the associated text code points — all optional.
 * https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
const CSI_U_SEQUENCE =
	/\u001b\[(\d+)(?::\d+)*(?:;(\d+)(?::(\d+))?)?(?:;[\d:]+)?u/g;

/** tmux and xterm with modifyOtherKeys: `ESC [ 27 ; <modifiers> ; <code point> ~`. */
const MODIFY_OTHER_KEYS_SEQUENCE = /\u001b\[27;(\d+);(\d+)~/g;

/**
 * Reported by the setups in issues #82 and #107:
 * `ESC [ 1 ; <modifiers> <letter>`.
 */
const CSI_LETTER_SEQUENCE = /\u001b\[1;(\d+)([A-Za-z])/g;

/** Event types that mean the key went down; 3 (release) must not trigger. */
const KEY_DOWN_EVENT_TYPES = new Set(['1', '2']);

export class ShortcutManager {
	private reservedKeys: ShortcutKey[] = [
		{ctrl: true, key: 'c'},
		{ctrl: true, key: 'd'},
		{key: 'escape'}, // Ctrl+[ is equivalent to Escape
		{ctrl: true, key: '['},
	];

	constructor() {}

	private validateShortcut(shortcut: unknown): ShortcutKey | null {
		if (!shortcut || typeof shortcut !== 'object') {
			return null;
		}

		const s = shortcut as Record<string, unknown>;
		if (!s['key'] || typeof s['key'] !== 'string') {
			return null;
		}

		const validShortcut: ShortcutKey = {
			key: s['key'] as string,
			ctrl: !!s['ctrl'],
			alt: !!s['alt'],
			shift: !!s['shift'],
		};

		// Check if it's a reserved key
		if (this.isReservedKey(validShortcut)) {
			return null;
		}

		// Ensure at least one modifier key is used (except for special keys like escape)
		if (
			validShortcut.key !== 'escape' &&
			!validShortcut.ctrl &&
			!validShortcut.alt &&
			!validShortcut.shift
		) {
			return null;
		}

		return validShortcut;
	}

	private isReservedKey(shortcut: ShortcutKey): boolean {
		return this.reservedKeys.some(
			reserved =>
				reserved.key === shortcut.key &&
				reserved.ctrl === shortcut.ctrl &&
				reserved.alt === shortcut.alt &&
				reserved.shift === shortcut.shift,
		);
	}

	public getShortcuts(): ShortcutConfig {
		return configReader.getShortcuts();
	}

	private getRawShortcutCodes(shortcut: ShortcutKey): string[] {
		const codes = new Set<string>();

		// Direct control-code form (e.g. Ctrl+E -> \u0005)
		const controlCode = this.getShortcutCode(shortcut);
		if (controlCode) {
			codes.add(controlCode);
		}

		// Escape key in raw mode
		if (
			shortcut.key === 'escape' &&
			!shortcut.ctrl &&
			!shortcut.alt &&
			!shortcut.shift
		) {
			codes.add('\u001b');
		}

		// The extended keyboard sequences (CSI u, modifyOtherKeys, CSI 1;<mod><letter>)
		// are deliberately not listed here: their modifier field varies with the
		// keyboard's lock state, so they are matched by parsing the incoming bytes
		// in matchesExtendedKeySequence() instead of by string comparison.

		return Array.from(codes);
	}

	/**
	 * Modifier bit mask of a shortcut, in the encoding shared by the extended
	 * keyboard sequences: 1 shift, 2 alt, 4 ctrl.
	 */
	private getModifierMask(shortcut: ShortcutKey): number {
		return (
			(shortcut.shift ? 1 : 0) |
			(shortcut.alt ? 2 : 0) |
			(shortcut.ctrl ? 4 : 0)
		);
	}

	/**
	 * Read the modifier parameter of an extended keyboard sequence, which
	 * terminals report as `1 + <bit mask>`, and drop the keyboard's lock state
	 * from it. An absent parameter means "no modifiers"; anything unparseable
	 * yields null, which matches no shortcut.
	 */
	private parseModifiers(parameter: string | undefined): number | null {
		if (parameter === undefined || parameter === '') return 0;
		const reported = Number.parseInt(parameter, 10);
		if (!Number.isInteger(reported) || reported < 1) return null;
		return (reported - 1) & ~LOCK_STATE_BITS;
	}

	/**
	 * Match the extended keyboard sequences a terminal can send for a
	 * Ctrl+<letter> shortcut. They carry the modifiers as a number, so they are
	 * parsed instead of compared against pre-built strings: that number also
	 * reports the Caps Lock and Num Lock state, which is not part of the
	 * keypress and would otherwise keep the shortcut from ever matching
	 * (https://github.com/kbwo/ccmanager/issues/327).
	 */
	private matchesExtendedKeySequence(
		shortcut: ShortcutKey,
		input: string,
	): boolean {
		if (!shortcut.ctrl || shortcut.alt || shortcut.shift) return false;
		if (shortcut.key.length !== 1) return false;

		const expectedModifiers = this.getModifierMask(shortcut);
		const lowerKey = shortcut.key.toLowerCase();
		const upperKey = lowerKey.toUpperCase();
		// Terminals differ in whether they report the shifted or the unshifted
		// code point for a Ctrl+letter press, so accept either.
		const codePoints = new Set([
			lowerKey.charCodeAt(0),
			upperKey.charCodeAt(0),
		]);

		for (const match of input.matchAll(CSI_U_SEQUENCE)) {
			const eventType = match[3];
			if (eventType !== undefined && !KEY_DOWN_EVENT_TYPES.has(eventType)) {
				continue;
			}
			if (this.parseModifiers(match[2]) !== expectedModifiers) continue;
			if (codePoints.has(Number.parseInt(match[1]!, 10))) return true;
		}

		for (const match of input.matchAll(MODIFY_OTHER_KEYS_SEQUENCE)) {
			if (this.parseModifiers(match[1]) !== expectedModifiers) continue;
			if (codePoints.has(Number.parseInt(match[2]!, 10))) return true;
		}

		for (const match of input.matchAll(CSI_LETTER_SEQUENCE)) {
			if (this.parseModifiers(match[1]) !== expectedModifiers) continue;
			if (match[2]!.toLowerCase() === lowerKey) return true;
		}

		return false;
	}

	public matchesShortcut(
		shortcutName: keyof ShortcutConfig,
		input: string,
		key: Key,
	): boolean {
		const shortcuts = configReader.getShortcuts();
		const shortcut = shortcuts[shortcutName];
		if (!shortcut) return false;

		// Handle escape key specially
		if (shortcut.key === 'escape') {
			return key.escape === true;
		}

		// Check modifiers
		if (shortcut.ctrl !== key.ctrl) return false;
		// Note: ink's Key type doesn't support alt or shift modifiers
		// so we can't check them here. For now, we'll only support ctrl modifier
		if (shortcut.alt || shortcut.shift) return false;

		// Check key
		return input.toLowerCase() === shortcut.key.toLowerCase();
	}

	public getShortcutDisplay(shortcutName: keyof ShortcutConfig): string {
		const shortcuts = configReader.getShortcuts();
		const shortcut = shortcuts[shortcutName];
		if (!shortcut) return '';

		const parts: string[] = [];
		if (shortcut.ctrl) parts.push('Ctrl');
		if (shortcut.alt) parts.push('Alt');
		if (shortcut.shift) parts.push('Shift');

		// Format special keys
		let keyDisplay = shortcut.key;
		if (keyDisplay === 'escape') keyDisplay = 'Esc';
		else if (keyDisplay.length === 1) keyDisplay = keyDisplay.toUpperCase();

		parts.push(keyDisplay);
		return parts.join('+');
	}

	public getShortcutCode(shortcut: ShortcutKey): string | null {
		// Convert shortcut to terminal code for raw stdin handling
		if (!shortcut.ctrl || shortcut.alt || shortcut.shift) {
			return null; // Only support Ctrl+key for raw codes
		}

		const key = shortcut.key.toLowerCase();
		if (key.length !== 1) return null;

		// Convert Ctrl+letter to ASCII control code
		const code = key.charCodeAt(0) - 96; // 'a' = 1, 'b' = 2, etc.
		if (code >= 1 && code <= 26) {
			return String.fromCharCode(code);
		}

		return null;
	}

	public matchesRawInput(
		shortcutName: keyof ShortcutConfig,
		input: string,
	): boolean {
		const shortcuts = configReader.getShortcuts();
		const shortcut = shortcuts[shortcutName];
		if (!shortcut) return false;

		const codes = this.getRawShortcutCodes(shortcut);
		if (codes.some(code => input === code || input.includes(code))) {
			return true;
		}

		return this.matchesExtendedKeySequence(shortcut, input);
	}
}

export const shortcutManager = new ShortcutManager();
