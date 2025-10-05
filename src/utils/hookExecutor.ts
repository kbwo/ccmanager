import {spawn} from 'child_process';
import {Effect} from 'effect';
import {ProcessError} from '../types/errors.js';
import {Worktree, Session, SessionState} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import {configurationManager} from '../services/configurationManager.js';

export interface HookEnvironment {
	CCMANAGER_WORKTREE_PATH: string;
	CCMANAGER_WORKTREE_BRANCH: string;
	CCMANAGER_GIT_ROOT: string;
	CCMANAGER_BASE_BRANCH?: string;
	[key: string]: string | undefined;
}

/**
 * Execute a hook command with the provided environment variables using Effect
 */
export function executeHook(
	command: string,
	cwd: string,
	environment: HookEnvironment,
): Effect.Effect<void, ProcessError> {
	return Effect.async<void, ProcessError>(resume => {
		// Use spawn with shell to execute the command and wait for all child processes
		const child = spawn(command, [], {
			cwd,
			env: {
				...process.env,
				...environment,
			},
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stderr = '';

		// Collect stderr for logging
		child.stderr?.on('data', data => {
			stderr += data.toString();
		});

		// Wait for the process and all its children to exit
		child.on('exit', (code, signal) => {
			if (code !== 0 || signal) {
				const errorMessage = signal
					? `Hook terminated by signal ${signal}`
					: `Hook exited with code ${code}`;

				resume(
					Effect.fail(
						new ProcessError({
							command,
							exitCode: code ?? undefined,
							signal: signal ?? undefined,
							message: stderr
								? `${errorMessage}\nStderr: ${stderr}`
								: errorMessage,
						}),
					),
				);
				return;
			}
			// When exit code is 0, ignore stderr and resolve successfully
			resume(Effect.void);
		});

		// Handle errors in spawning the process
		child.on('error', error => {
			resume(
				Effect.fail(
					new ProcessError({
						command,
						message: error.message,
					}),
				),
			);
		});
	});
}

/**
 * Legacy Promise-based wrapper for executeHook
 * @deprecated Use executeHook with Effect instead
 * Converts Effect to Promise for backward compatibility
 */
export function executeHookLegacy(
	command: string,
	cwd: string,
	environment: HookEnvironment,
): Promise<void> {
	return Effect.runPromise(
		Effect.mapError(
			executeHook(command, cwd, environment),
			error => new Error(error.message),
		),
	);
}

/**
 * Execute a worktree post-creation hook using Effect
 * Errors are caught and logged but do not break the main flow
 */
export function executeWorktreePostCreationHook(
	command: string,
	worktree: Worktree,
	gitRoot: string,
	baseBranch?: string,
): Effect.Effect<void, never> {
	const environment: HookEnvironment = {
		CCMANAGER_WORKTREE_PATH: worktree.path,
		CCMANAGER_WORKTREE_BRANCH: worktree.branch || 'unknown',
		CCMANAGER_GIT_ROOT: gitRoot,
	};

	if (baseBranch) {
		environment.CCMANAGER_BASE_BRANCH = baseBranch;
	}

	return Effect.catchAll(
		executeHook(command, worktree.path, environment),
		error => {
			// Log error but don't throw - hooks should not break the main flow
			console.error(`Failed to execute post-creation hook: ${error.message}`);
			return Effect.void;
		},
	);
}

/**
 * Legacy Promise-based wrapper for executeWorktreePostCreationHook
 * @deprecated Use executeWorktreePostCreationHook with Effect instead
 */
export function executeWorktreePostCreationHookLegacy(
	command: string,
	worktree: Worktree,
	gitRoot: string,
	baseBranch?: string,
): Promise<void> {
	return Effect.runPromise(
		executeWorktreePostCreationHook(command, worktree, gitRoot, baseBranch),
	);
}

/**
 * Execute a session status change hook using Effect
 * Errors are caught and logged but do not break the main flow
 */
export function executeStatusHook(
	oldState: SessionState,
	newState: SessionState,
	session: Session,
): Effect.Effect<void, never> {
	const statusHooks = configurationManager.getStatusHooks();
	const hook = statusHooks[newState];

	if (!hook || !hook.enabled || !hook.command) {
		return Effect.void;
	}

	// Get branch information
	const worktreeService = new WorktreeService();
	const worktrees = worktreeService.getWorktrees();
	const worktree = worktrees.find(wt => wt.path === session.worktreePath);
	const branch = worktree?.branch || 'unknown';

	// Build environment for status hook
	const environment: HookEnvironment = {
		CCMANAGER_WORKTREE_PATH: session.worktreePath,
		CCMANAGER_WORKTREE_BRANCH: branch,
		CCMANAGER_GIT_ROOT: session.worktreePath, // For status hooks, we use worktree path as cwd
		CCMANAGER_OLD_STATE: oldState,
		CCMANAGER_NEW_STATE: newState,
		CCMANAGER_SESSION_ID: session.id,
	};

	return Effect.catchAll(
		executeHook(hook.command, session.worktreePath, environment),
		error => {
			// Log error but don't throw - hooks should not break the main flow
			console.error(`Failed to execute ${newState} hook: ${error.message}`);
			return Effect.void;
		},
	);
}

/**
 * Legacy Promise-based wrapper for executeStatusHook
 * @deprecated Use executeStatusHook with Effect instead
 */
export function executeStatusHookLegacy(
	oldState: SessionState,
	newState: SessionState,
	session: Session,
): Promise<void> {
	return Effect.runPromise(executeStatusHook(oldState, newState, session));
}
