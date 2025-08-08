import {exec} from 'child_process';
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
 * Execute a hook command with the provided environment variables
 */
export function executeHook(
	command: string,
	cwd: string,
	environment: HookEnvironment,
): Promise<void> {
	return new Promise((resolve, reject) => {
		exec(
			command,
			{
				cwd,
				env: {
					...process.env,
					...environment,
				},
			},
			(error, _stdout, stderr) => {
				if (error) {
					console.error(`Hook execution failed: ${error.message}`);
					reject(error);
					return;
				}
				if (stderr) {
					console.error(`Hook stderr: ${stderr}`);
				}
				resolve();
			},
		);
	});
}

/**
 * Execute a worktree post-creation hook
 */
export async function executeWorktreePostCreationHook(
	command: string,
	worktree: Worktree,
	gitRoot: string,
	baseBranch?: string,
): Promise<void> {
	const environment: HookEnvironment = {
		CCMANAGER_WORKTREE_PATH: worktree.path,
		CCMANAGER_WORKTREE_BRANCH: worktree.branch || 'unknown',
		CCMANAGER_GIT_ROOT: gitRoot,
	};

	if (baseBranch) {
		environment.CCMANAGER_BASE_BRANCH = baseBranch;
	}

	try {
		await executeHook(command, worktree.path, environment);
	} catch (error) {
		// Log error but don't throw - hooks should not break the main flow
		console.error(
			`Failed to execute post-creation hook: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

/**
 * Execute a session status change hook
 */
export function executeStatusHook(
	oldState: SessionState,
	newState: SessionState,
	session: Session,
): void {
	const statusHooks = configurationManager.getStatusHooks();
	const hook = statusHooks[newState];

	if (hook && hook.enabled && hook.command) {
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

		// Execute the hook command in the session's worktree directory
		// Note: We don't await this as it's fire-and-forget for status hooks
		executeHook(hook.command, session.worktreePath, environment).catch(
			error => {
				console.error(
					`Failed to execute ${newState} hook: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			},
		);
	}
}
