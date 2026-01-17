import {ShortcutKey, ShortcutConfig} from '../types/index.js';
import {Key} from 'ink';
import {configReader} from './configReader.js';

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

		// Kitty/xterm extended keyboard sequences (CSI <code>;<mod>u)
		if (
			shortcut.ctrl &&
			!shortcut.alt &&
			!shortcut.shift &&
			shortcut.key.length === 1
		) {
			const lower = shortcut.key.toLowerCase();
			const upperCode = lower.toUpperCase().charCodeAt(0);
			const lowerCode = lower.charCodeAt(0);

			// Include the CSI u format (ESC[<code>;5u) used by Kitty/WezTerm for Ctrl+letters.
			if (upperCode >= 32 && upperCode <= 126) {
				codes.add(`\u001b[${upperCode};5u`);
			}
			if (lowerCode !== upperCode && lowerCode >= 32 && lowerCode <= 126) {
				codes.add(`\u001b[${lowerCode};5u`);
			}
			// Tmux/xterm with modifyOtherKeys emit ESC[27;5;<code>~ for the same shortcut.
			if (upperCode >= 32 && upperCode <= 126) {
				codes.add(`\u001b[27;5;${upperCode}~`);
			}
			if (lowerCode !== upperCode && lowerCode >= 32 && lowerCode <= 126) {
				codes.add(`\u001b[27;5;${lowerCode}~`);
			}
			// Some setups (issue #82/#107 repros) send ESC[1;5<letter>; include both upper/lower.
			const upperKey = lower.toUpperCase();
			codes.add(`\u001b[1;5${upperKey}`);
			if (upperKey !== lower) {
				codes.add(`\u001b[1;5${lower}`);
			}
		}

		return Array.from(codes);
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
		return codes.some(code => input === code || input.includes(code));
	}
}

export const shortcutManager = new ShortcutManager();
