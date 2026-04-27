import {spawn} from 'child_process';
import {logger} from '../utils/logger.js';
import {configReader} from './config/configReader.js';
import type {TerminalLauncherConfig} from '../types/index.js';

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

function substituteArgs(args: string[], cwd: string): string[] {
	return args.map(arg =>
		arg.includes(CWD_PLACEHOLDER)
			? arg.replaceAll(CWD_PLACEHOLDER, cwd)
			: arg,
	);
}

function fromConfig(
	config: TerminalLauncherConfig,
	cwd: string,
): TerminalCommand {
	return {
		command: config.command,
		args: substituteArgs(config.args ?? [], cwd),
	};
}

function fromEnvOverride(cwd: string): TerminalCommand | null {
	const override = process.env['CCMANAGER_TERMINAL'];
	if (override === undefined || override.trim() === '') return null;

	const tokens = override.trim().split(/\s+/);
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

function platformDefault(cwd: string): TerminalCommand | null {
	switch (process.platform) {
		case 'darwin':
			return {
				command: 'open',
				args: ['-a', 'Terminal', cwd],
			};
		case 'win32':
			return {
				command: 'cmd.exe',
				args: ['/c', 'start', '', 'cmd.exe', '/K', `cd /d ${cwd}`],
			};
		case 'linux':
			return {
				command: 'x-terminal-emulator',
				args: ['--working-directory', cwd],
			};
		default:
			return null;
	}
}

function resolveTerminalCommand(cwd: string): TerminalCommand | null {
	const config = configReader.getTerminalLauncher();
	if (config) return fromConfig(config, cwd);

	const envCmd = fromEnvOverride(cwd);
	if (envCmd) return envCmd;

	return platformDefault(cwd);
}

export function launchTerminal(cwd: string): TerminalLaunchResult {
	const resolved = resolveTerminalCommand(cwd);
	if (resolved === null) {
		const error = `No terminal launcher configured for platform '${process.platform}'. Set terminalLauncher in config or CCMANAGER_TERMINAL env var.`;
		logger.error(error);
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
			logger.error(
				`Terminal launch failed asynchronously: ${err instanceof Error ? err.message : String(err)}`,
			);
		});
		child.unref();
		logger.info(`Launched terminal: ${displayCommand}`);
		return {success: true, command: displayCommand};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(`Terminal launch threw: ${message}`);
		return {success: false, command: displayCommand, error: message};
	}
}
