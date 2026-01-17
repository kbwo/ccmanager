import {describe, expect, it, beforeEach, afterEach, vi} from 'vitest';
import {shortcutManager} from './shortcutManager.js';
import {configReader} from './configReader.js';

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
});
