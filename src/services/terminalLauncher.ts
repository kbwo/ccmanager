/**
 * Terminal launcher
 *
 * Spawns an external terminal window/tab at a given directory so the user
 * can inspect or run commands alongside a Claude Code session without
 * interrupting the agent's session.
 *
 * Detection order:
 * 1. CCMANAGER_TERMINAL env var (user override, full command string with {cwd} placeholder)
 * 2. Platform defaults (macOS, Linux, Windows)
 *
 * The spawned process is detached so closing ccmanager does not close the
 * terminal window, and vice versa.
 */
import {spawn} from 'child_process';
import {logger} from '../utils/logger.js';

export interface TerminalLaunchResult {
	success: boolean;
	command: string;
	error?: string;
}

interface TerminalCommand {
	command: string;
	args: string[];
}

const CWD_PLACEHOLDER = '{cwd}';

/**
 * Parse a user-supplied CCMANAGER_TERMINAL template by substituting {cwd}.
 * Splits on whitespace; simple and predictable. For more complex needs a
 * user can wrap their command in a shell (e.g. `sh -c "...{cwd}..."`).
 */
function parseCustomTemplate(
	template: string,
	cwd: string,
): TerminalCommand | null {
	const trimmed = template.trim();
	if (trimmed === '') return null;

	const tokens = trimmed.split(/\s+/);
	if (tokens.length === 0) return null;

	const substituted = tokens.map(token =>
		token.includes(CWD_PLACEHOLDER)
			? token.replaceAll(CWD_PLACEHOLDER, cwd)
			: token,
	);

	const [command, ...args] = substituted;
	if (command === undefined) return null;
	return {command, args};
}

/**
 * Resolve the terminal command for the current platform.
 * Returns null if the platform is unsupported and no override is set.
 */
function resolveTerminalCommand(cwd: string): TerminalCommand | null {
	const override = process.env['CCMANAGER_TERMINAL'];
	if (override !== undefined && override.trim() !== '') {
		const parsed = parseCustomTemplate(override, cwd);
		if (parsed !== null) return parsed;
	}

	switch (process.platform) {
		case 'darwin':
			return {
				command: 'open',
				args: ['-a', 'Terminal', cwd],
			};
		case 'win32':
			// `start` is a cmd.exe builtin; launch a new Windows Terminal or
			// fall back to cmd.exe in the target directory.
			return {
				command: 'cmd.exe',
				args: ['/c', 'start', '', 'cmd.exe', '/K', `cd /d ${cwd}`],
			};
		case 'linux':
			// x-terminal-emulator is the Debian/Ubuntu alternatives entry point;
			// most desktop environments ship a compatible wrapper.
			return {
				command: 'x-terminal-emulator',
				args: ['--working-directory', cwd],
			};
		default:
			return null;
	}
}

/**
 * Launch a terminal window at the given directory.
 * Non-blocking: the spawned process is detached and unref'd so it survives
 * independently of ccmanager.
 */
export function launchTerminal(cwd: string): TerminalLaunchResult {
	const resolved = resolveTerminalCommand(cwd);
	if (resolved === null) {
		const error = `No terminal launcher configured for platform '${process.platform}'. Set CCMANAGER_TERMINAL to a command template (use ${CWD_PLACEHOLDER} for the working directory).`;
		logger.warn(error);
		return {success: false, command: '', error};
	}

	const {command, args} = resolved;
	const displayCommand = [command, ...args].join(' ');

	try {
		const child = spawn(command, args, {
			cwd,
			detached: true,
			stdio: 'ignore',
			shell: false,
		});
		child.on('error', err => {
			logger.warn(
				`Terminal launch failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		});
		child.unref();
		logger.info(`Launched terminal: ${displayCommand}`);
		return {success: true, command: displayCommand};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(`Terminal launch threw: ${message}`);
		return {success: false, command: displayCommand, error: message};
	}
}
