#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './components/App.js';
import {ensureDefaultDirectories} from './utils/defaultPaths.js';

const cli = meow(
	`
	Usage
	  $ ccmanager [options]

	Options
	  --worktree, -w  Path to the worktree directory
	  --branch, -b    New branch name to create
	  --from-branch, -f  Base branch to fork from (defaults to main)
	  --help, -h      Show help
	  --version, -v   Show version

	Examples
	  $ ccmanager
	  $ ccmanager --worktree /path/to/worktree
	  $ ccmanager -w ../feature-branch
	  $ ccmanager --branch feature/new-feature
	  $ ccmanager -b feature/auth --from-branch develop
	  $ ccmanager -b hotfix/critical -f main
`,
	{
		importMeta: import.meta,
		flags: {
			worktree: {
				type: 'string',
				shortFlag: 'w',
			},
			branch: {
				type: 'string',
				shortFlag: 'b',
			},
			fromBranch: {
				type: 'string',
				shortFlag: 'f',
			},
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

// Ensure default directories exist
ensureDefaultDirectories();

// Extract options from CLI flags
const worktreePath = (cli.flags.worktree || cli.flags['w']) as
	| string
	| undefined;
const branchName = (cli.flags.branch || cli.flags['b']) as string | undefined;
const fromBranch = (cli.flags.fromBranch || cli.flags['f']) as string | undefined;

render(
	<App
		initialWorktreePath={worktreePath}
		initialBranchName={branchName}
		initialFromBranch={fromBranch}
	/>,
);
