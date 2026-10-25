#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './components/App.js';
import {worktreeConfigManager} from './services/worktreeConfigManager.js';
import {globalSessionOrchestrator} from './services/globalSessionOrchestrator.js';
import {logger} from './utils/logger.js';

// Version is injected at build time via --define flag
declare const CCMANAGER_VERSION: string;
const version =
	typeof CCMANAGER_VERSION !== 'undefined' ? CCMANAGER_VERSION : 'dev';

const cli = meow(
	`
	Usage
	  $ ccmanager

	Options
	  --help                Show help
	  --version             Show version
	  --multi-project       Enable multi-project mode
	  --devc-up-command     Command to start devcontainer
	  --devc-exec-command   Command to execute in devcontainer

	Examples
	  $ ccmanager
	  $ ccmanager --multi-project
	  $ ccmanager --devc-up-command "devcontainer up --workspace-folder ." --devc-exec-command "devcontainer exec --workspace-folder ."
`,
	{
		importMeta: import.meta,
		version: version,
		flags: {
			multiProject: {
				type: 'boolean',
				default: false,
			},
			devcUpCommand: {
				type: 'string',
			},
			devcExecCommand: {
				type: 'string',
			},
		},
	},
);

// Validate devcontainer arguments using XOR
if (!!cli.flags.devcUpCommand !== !!cli.flags.devcExecCommand) {
	console.error(
		'Error: Both --devc-up-command and --devc-exec-command must be provided together',
	);
	process.exit(1);
}

// Check if we're in a TTY environment
if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error(
		'Error: ccmanager must be run in an interactive terminal (TTY)',
	);
	process.exit(1);
}

// Check for CCMANAGER_MULTI_PROJECT_ROOT when using --multi-project
if (cli.flags.multiProject && !process.env['CCMANAGER_MULTI_PROJECT_ROOT']) {
	console.error(
		'Error: CCMANAGER_MULTI_PROJECT_ROOT environment variable must be set when using --multi-project',
	);
	console.error(
		'Please set it to the root directory containing your projects, e.g.:',
	);
	console.error('  export CCMANAGER_MULTI_PROJECT_ROOT=/path/to/projects');
	process.exit(1);
}

// Initialize worktree config manager
worktreeConfigManager.initialize();

// Prepare devcontainer config
const devcontainerConfig =
	cli.flags.devcUpCommand && cli.flags.devcExecCommand
		? {
				upCommand: cli.flags.devcUpCommand,
				execCommand: cli.flags.devcExecCommand,
			}
		: undefined;

// Pass config to App
const appProps = {
	...(devcontainerConfig ? {devcontainerConfig} : {}),
	multiProject: cli.flags.multiProject,
	version,
};

// Temporary: with CCMANAGER_PROFILE_MENU=1, log Ink's frame cost and whether
// each stdout write wipes the whole terminal (Ink does that when the frame is
// at least as tall as the terminal).
const profileMenu = !!process.env['CCMANAGER_PROFILE_MENU'];
if (profileMenu) {
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array, ...rest: never[]) => {
		const text = typeof chunk === 'string' ? chunk : '';
		const start = Date.now();
		const result = (originalWrite as (c: unknown, ...r: unknown[]) => boolean)(
			chunk,
			...rest,
		);
		logger.debug(
			`[menu-profile] stdout.write ${text.length} bytes, clearTerminal=${text.includes('\x1b[3J')}, rows=${process.stdout.rows}, took ${Date.now() - start}ms`,
		);
		return result;
	}) as typeof process.stdout.write;
}

if (profileMenu) {
	// A 50ms timer that fires late means the main thread was busy.
	let expected = Date.now() + 50;
	setInterval(() => {
		const lag = Date.now() - expected;
		if (lag > 50) {
			logger.debug(`[menu-profile] event loop lag ${lag}ms`);
		}
		expected = Date.now() + 50;
	}, 50).unref();
}

const app = render(<App {...appProps} />, {
	incrementalRendering: true,
	...(profileMenu
		? {
				onRender: ({renderTime}: {renderTime: number}) =>
					logger.debug(
						`[menu-profile] ink frame renderTime=${renderTime.toFixed(1)}ms`,
					),
			}
		: {}),
});

// Clean up sessions on exit
process.on('SIGINT', () => {
	globalSessionOrchestrator.destroyAllSessions();
	app.unmount();
	process.exit(0);
});

process.on('SIGTERM', () => {
	globalSessionOrchestrator.destroyAllSessions();
	app.unmount();
	process.exit(0);
});

// Export for testing
export const parsedArgs = cli;
