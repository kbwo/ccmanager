import {ShortcutKey, ShortcutConfig} from '../types/index.js';
import {Key} from 'ink';
import {configurationManager} from './configurationManager.js';

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

	public saveShortcuts(shortcuts: ShortcutConfig): boolean {
		// Validate all shortcuts
		const currentShortcuts = configurationManager.getShortcuts();
		const validated: ShortcutConfig = {
			returnToMenu:
				this.validateShortcut(shortcuts.returnToMenu) ||
				currentShortcuts.returnToMenu,
			cancel:
				this.validateShortcut(shortcuts.cancel) || currentShortcuts.cancel,
			toggleMode:
				this.validateShortcut(shortcuts.toggleMode) ||
				currentShortcuts.toggleMode,
		};

		configurationManager.setShortcuts(validated);
		return true;
	}

	public getShortcuts(): ShortcutConfig {
		return configurationManager.getShortcuts();
	}

	public matchesShortcut(
		shortcutName: keyof ShortcutConfig,
		input: string,
		key: Key,
	): boolean {
		const shortcuts = configurationManager.getShortcuts();
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
		const shortcuts = configurationManager.getShortcuts();
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
}

export const shortcutManager = new ShortcutManager();
