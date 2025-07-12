#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './components/App.js';
import {worktreeConfigManager} from './services/worktreeConfigManager.js';

const cli = meow(
	`
	Usage
	  $ ccmanager

	Options
	  --help                Show help
	  --version             Show version
	  --devc-up-command     Command to start devcontainer
	  --devc-exec-command   Command to execute in devcontainer

	Examples
	  $ ccmanager
	  $ ccmanager --devc-up-command "devcontainer up --workspace-folder ." --devc-exec-command "devcontainer exec --workspace-folder ."
`,
	{
		importMeta: import.meta,
		flags: {
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
const appProps = devcontainerConfig ? {devcontainerConfig} : {};

render(<App {...appProps} />);

// Export for testing
export const parsedArgs = cli;
