#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './components/App.js';

const cli = meow(
	`
	Usage
	  $ ccmanager [worktree-path]

	Options
	  --help     Show help
	  --version  Show version

	Examples
	  $ ccmanager
	  $ ccmanager /path/to/worktree
	  $ ccmanager ../feature-branch
`,
	{
		importMeta: import.meta,
		flags: {
			help: {
				type: 'boolean',
				shortFlag: 'h',
			},
			version: {
				type: 'boolean',
				shortFlag: 'v',
			},
		},
	},
);

// Check if we're in a TTY environment
if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error(
		'Error: ccmanager must be run in an interactive terminal (TTY)',
	);
	process.exit(1);
}

// Extract worktree path from arguments
const worktreePath = cli.input[0];

render(<App initialWorktreePath={worktreePath} />);
