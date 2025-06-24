#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './components/App.js';
import {worktreeConfigManager} from './services/worktreeConfigManager.js';

meow(
	`
	Usage
	  $ ccmanager

	Options
	  --help     Show help
	  --version  Show version

	Examples
	  $ ccmanager
`,
	{
		importMeta: import.meta,
	},
);

// Check if we're in a TTY environment
if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error(
		'Error: ccmanager must be run in an interactive terminal (TTY)',
	);
	process.exit(1);
}

// Initialize worktree config manager
worktreeConfigManager.initialize();

render(<App />);
