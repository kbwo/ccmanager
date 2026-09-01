/**
 * PTY harness for the return-to-menu shortcut end-to-end test.
 *
 * It runs the real ccmanager CLI inside a pseudo terminal (PTY) against a
 * throwaway git repository, selects the first worktree so a session is
 * attached, writes one key sequence into the PTY, and reports whether
 * ccmanager went back to the menu.
 *
 * This lives in its own process because the PTY is created through Bun's
 * `Bun.Terminal` API (see `src/services/bunTerminal.ts`), which only exists
 * when the code runs under `bun`, while the Vitest suite runs under node.
 * `returnToMenu.test.ts` spawns this file with `bun` and reads the single
 * `RESULT <json>` line printed on stdout.
 *
 * Usage: bun returnToMenuPtyHarness.ts '<JSON-encoded key sequence>'
 */
import {execFileSync} from 'child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {spawn} from '../services/bunTerminal.js';

/** Text rendered by `Menu.tsx`; its presence means the menu is on screen. */
const MENU_MARKER = 'CCManager - Claude Code Worktree Manager';
/** Text printed by the fake session command once it is running. */
const SESSION_MARKER = 'CCMANAGER_E2E_SESSION_READY';

const PTY_COLS = 120;
const PTY_ROWS = 40;

const MENU_TIMEOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 30_000;
/**
 * How long to wait for the menu to come back after the key sequence is sent.
 * A working shortcut re-renders the menu in well under a second; this only has
 * to be long enough that a slow machine is not mistaken for a swallowed key.
 */
const RETURN_TIMEOUT_MS = 5_000;

interface HarnessResult {
	/** The menu rendered, so the CLI started up correctly. */
	menuAppeared: boolean;
	/** The fake session command is running and its output reaches the screen. */
	sessionStarted: boolean;
	/** The menu rendered again after the key sequence was written to the PTY. */
	returnedToMenu: boolean;
	/** Set when the harness itself could not complete the scenario. */
	error?: string;
	/** Last chunk of PTY output, to make a harness failure diagnosable. */
	tail?: string;
}

const sequence = JSON.parse(process.argv[2] ?? '""') as string;

const harnessDir = dirname(fileURLToPath(import.meta.url));
// Running from `src/` (how the test invokes it) the entry point is the TSX
// source; from a compiled `dist/` tree it is the emitted JS next to it.
const cliEntry = existsSync(join(harnessDir, '../cli.tsx'))
	? join(harnessDir, '../cli.tsx')
	: join(harnessDir, '../cli.js');

const root = mkdtempSync(join(tmpdir(), 'ccmanager-e2e-'));
const home = join(root, 'home');
const repoDir = join(root, 'repo');
mkdirSync(join(home, '.config', 'ccmanager'), {recursive: true});
mkdirSync(repoDir, {recursive: true});

// ccmanager reads its global config from $HOME/.config/ccmanager/config.json,
// so pointing HOME at the throwaway directory both isolates the run from the
// developer's own config and lets us replace `claude` with a fake command.
//
// The fake command prints its readiness marker in a loop instead of once: a
// single line printed at spawn time was observed never to reach the host
// terminal (neither live nor through the restore snapshot), which left the
// harness waiting forever. Repeating it guarantees a marker arrives after the
// session view has attached. `cat` runs in the foreground so it holds the
// session open and echoes back whatever ccmanager forwards to the child.
writeFileSync(
	join(home, '.config', 'ccmanager', 'config.json'),
	JSON.stringify({
		shortcuts: {returnToMenu: {ctrl: true, key: 'e'}, cancel: {key: 'escape'}},
		commandPresets: {
			presets: [
				{
					id: '1',
					name: 'E2E',
					command: 'sh',
					args: [
						'-c',
						`while :; do echo ${SESSION_MARKER}; sleep 0.5; done & cat`,
					],
				},
			],
			defaultPresetId: '1',
		},
	}),
);

const git = (...args: string[]) =>
	execFileSync('git', args, {cwd: repoDir, encoding: 'utf8'});
git('init', '-b', 'main');
git('config', 'user.email', 'e2e@example.com');
git('config', 'user.name', 'ccmanager e2e');
writeFileSync(join(repoDir, 'README.md'), '# ccmanager e2e fixture\n');
git('add', '.');
git('commit', '-m', 'initial commit');

const env: Record<string, string | undefined> = {
	...process.env,
	HOME: home,
	TERM: 'xterm-256color',
	// Keep the run from writing into the developer's real log file.
	CCMANAGER_LOG_FILE: join(root, 'ccmanager.log'),
};
delete env['CCMANAGER_MULTI_PROJECT_ROOT'];
// Ink stops painting frames to stdout when it believes it runs in CI: it keeps
// the frame in memory and only writes it on unmount (`isInCi` branch in
// `ink/build/ink.js`, fed by the `is-in-ci` package, which checks exactly these
// two variables). This harness drives a real pseudo terminal and has to see the
// menu as a user would, so the child must not inherit them from a CI runner.
delete env['CI'];
delete env['CONTINUOUS_INTEGRATION'];

let output = '';
const pty = spawn('bun', [cliEntry], {
	name: 'xterm-256color',
	cols: PTY_COLS,
	rows: PTY_ROWS,
	cwd: repoDir,
	env,
});
pty.onData(data => {
	output += data;
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(marker: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (output.includes(marker)) return true;
		await sleep(50);
	}
	return false;
}

const result: HarnessResult = {
	menuAppeared: false,
	sessionStarted: false,
	returnedToMenu: false,
};

try {
	result.menuAppeared = await waitFor(MENU_MARKER, MENU_TIMEOUT_MS);
	if (!result.menuAppeared) throw new Error('menu never rendered');

	// The header renders before the worktree list is populated, so wait for a
	// list entry and let the initial git status refresh settle before selecting.
	await waitFor('New Worktree', MENU_TIMEOUT_MS);
	await sleep(2_000);
	pty.write('\r');

	result.sessionStarted = await waitFor(SESSION_MARKER, SESSION_TIMEOUT_MS);
	if (!result.sessionStarted) throw new Error('session never started');

	await sleep(500);
	// Drop the session output collected so far, so the menu can only be
	// detected from what is rendered after the key sequence is sent.
	output = '';
	pty.write(sequence);
	result.returnedToMenu = await waitFor(MENU_MARKER, RETURN_TIMEOUT_MS);
} catch (error) {
	result.error = error instanceof Error ? error.message : String(error);
	result.tail = JSON.stringify(output.slice(-2_000));
} finally {
	pty.kill();
	rmSync(root, {recursive: true, force: true});
}

console.log(`RESULT ${JSON.stringify(result)}`);
process.exit(0);
