import {describe, expect, it} from 'vitest';
import {execFileSync, spawnSync} from 'child_process';
import {existsSync} from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

/**
 * End-to-end coverage for the "return to menu" shortcut (Ctrl+E by default).
 *
 * Each case boots the real CLI in a PTY through
 * `returnToMenuPtyHarness.ts` (a separate `bun` process, because the PTY
 * needs Bun's `Bun.Terminal` API while Vitest runs under node), attaches a
 * session, sends one byte sequence, and reports whether the menu came back.
 *
 * The sequences below are the different byte encodings a terminal can send for
 * the very same Ctrl+E keypress:
 *
 * - the ASCII control code, sent by terminals that do not use an extended
 *   keyboard protocol;
 * - the kitty keyboard protocol's CSI-u form `ESC [ <codepoint> ; <modifier> u`,
 *   where the modifier is a bit mask of `1 (base) + 4 (ctrl)`;
 * - the same CSI-u form with a lock-state bit added to the modifier mask
 *   (`+64` for Caps Lock, `+128` for Num Lock), which the kitty protocol
 *   includes whenever the corresponding lock happens to be on. This is the
 *   case reported in https://github.com/kbwo/ccmanager/issues/327.
 */
const SEQUENCES = {
	/** Ctrl+E as an ASCII control code. */
	controlCode: '\u0005',
	/** CSI-u, modifier 5 = 1 (base) + 4 (ctrl). */
	csiUCtrl: '\u001b[101;5u',
	/** CSI-u, modifier 133 = 1 (base) + 4 (ctrl) + 128 (num lock). */
	csiUCtrlNumLock: '\u001b[101;133u',
	/** CSI-u, modifier 69 = 1 (base) + 4 (ctrl) + 64 (caps lock). */
	csiUCtrlCapsLock: '\u001b[101;69u',
} as const;

interface HarnessResult {
	menuAppeared: boolean;
	sessionStarted: boolean;
	returnedToMenu: boolean;
	error?: string;
	tail?: string;
}

// `bun install` runs the build through the `prepare` script, so this test also
// runs from the compiled `dist/` tree, where the harness sits next to it as
// JavaScript rather than TypeScript.
const testDir = dirname(fileURLToPath(import.meta.url));
const harnessPath = existsSync(join(testDir, 'returnToMenuPtyHarness.ts'))
	? join(testDir, 'returnToMenuPtyHarness.ts')
	: join(testDir, 'returnToMenuPtyHarness.js');

/**
 * The harness needs the `bun` runtime (for the PTY) and a Unix pseudo terminal,
 * so skip everywhere that cannot provide both instead of failing.
 */
function canRunHarness(): boolean {
	if (process.platform === 'win32') return false;
	return spawnSync('bun', ['--version'], {stdio: 'ignore'}).status === 0;
}

function runHarness(sequence: string): HarnessResult {
	const stdout = execFileSync('bun', [harnessPath, JSON.stringify(sequence)], {
		encoding: 'utf8',
		timeout: 120_000,
	});
	const line = stdout
		.split('\n')
		.reverse()
		.find(candidate => candidate.startsWith('RESULT '));
	if (!line) {
		throw new Error(`harness printed no RESULT line:\n${stdout}`);
	}
	const result = JSON.parse(line.slice('RESULT '.length)) as HarnessResult;
	// A harness that never reached the session says nothing about the shortcut,
	// so surface that as a harness failure rather than a shortcut verdict.
	expect(
		{
			menuAppeared: result.menuAppeared,
			sessionStarted: result.sessionStarted,
			error: result.error,
			tail: result.tail,
		},
		'harness failed before it could test the shortcut',
	).toEqual({
		menuAppeared: true,
		sessionStarted: true,
		error: undefined,
		tail: undefined,
	});
	return result;
}

describe.skipIf(!canRunHarness())('return to menu shortcut (E2E)', () => {
	it(
		'returns to the menu on the plain Ctrl+E control code',
		{timeout: 150_000},
		() => {
			expect(runHarness(SEQUENCES.controlCode).returnedToMenu).toBe(true);
		},
	);

	it(
		'returns to the menu on the kitty CSI-u form with no lock bits set',
		{timeout: 150_000},
		() => {
			expect(runHarness(SEQUENCES.csiUCtrl).returnedToMenu).toBe(true);
		},
	);

	// https://github.com/kbwo/ccmanager/issues/327: the lock state is not part
	// of the keypress the user made, so Ctrl+E has to work exactly the same
	// whether or not Num Lock or Caps Lock happens to be on.
	it(
		'returns to the menu on the kitty CSI-u form with the Num Lock bit set (issue #327)',
		{timeout: 150_000},
		() => {
			expect(runHarness(SEQUENCES.csiUCtrlNumLock).returnedToMenu).toBe(true);
		},
	);

	it(
		'returns to the menu on the kitty CSI-u form with the Caps Lock bit set (issue #327)',
		{timeout: 150_000},
		() => {
			expect(runHarness(SEQUENCES.csiUCtrlCapsLock).returnedToMenu).toBe(true);
		},
	);
});
