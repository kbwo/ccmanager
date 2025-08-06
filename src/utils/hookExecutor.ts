import {exec} from 'child_process';
import {Worktree} from '../types/index.js';

export interface HookEnvironment {
	CCMANAGER_WORKTREE_PATH: string;
	CCMANAGER_WORKTREE_BRANCH: string;
	CCMANAGER_GIT_ROOT: string;
	CCMANAGER_BASE_BRANCH?: string;
	[key: string]: string | undefined;
}

export class HookExecutor {
	/**
	 * Execute a hook command with the provided environment variables
	 */
	static execute(
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
				(error, stdout, stderr) => {
					if (error) {
						console.error(`Hook execution failed: ${error.message}`);
						reject(error);
						return;
					}
					if (stderr) {
						console.error(`Hook stderr: ${stderr}`);
					}
					if (stdout) {
						console.log(`Hook output: ${stdout}`);
					}
					resolve();
				},
			);
		});
	}

	/**
	 * Execute a worktree post-creation hook
	 */
	static async executeWorktreePostCreationHook(
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
			await this.execute(command, worktree.path, environment);
		} catch (error) {
			// Log error but don't throw - hooks should not break the main flow
			console.error(
				`Failed to execute post-creation hook: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
}
