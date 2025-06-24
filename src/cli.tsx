#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './components/App.js';
import {isWorktreeConfigEnabled} from './utils/worktreeConfig.js';

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

if (!isWorktreeConfigEnabled()) {
	console.error(`Error: ccmanager requires Git worktree config to be enabled.

This allows ccmanager to store branch-specific configuration for each worktree.

To enable it, run:
  git config extensions.worktreeConfig true

After enabling, restart ccmanager.

Note: This is a one-time setup per repository.`);
	process.exit(1);
}

render(<App />);
