import {promisify} from 'util';
import {execSync, execFile} from 'child_process';
import {Effect} from 'effect';
import {GitError} from '../types/errors.js';
import {worktreeConfigManager} from '../services/worktreeConfigManager.js';

const execFileAsync = promisify(execFile);

export function isWorktreeConfigEnabled(gitPath?: string): boolean {
	try {
		const result = execSync('git config extensions.worktreeConfig', {
			cwd: gitPath || process.cwd(),
			encoding: 'utf8',
		}).trim();
		return result === 'true';
	} catch {
		return false;
	}
}

/**
 * Get parent branch for worktree using Effect
 * Returns null if config doesn't exist or worktree config is not available
 *
 * @param {string} worktreePath - Path to the worktree directory
 * @returns {Effect.Effect<string | null, never>} Effect containing parent branch name or null
 *
 * @example
 * ```typescript
 * import {Effect} from 'effect';
 * import {getWorktreeParentBranch} from './utils/worktreeConfig.js';
 *
 * // This function never fails - returns null on error
 * const parentBranch = await Effect.runPromise(
 *   getWorktreeParentBranch('/path/to/worktree')
 * );
 *
 * if (parentBranch) {
 *   console.log(`Parent branch: ${parentBranch}`);
 * } else {
 *   console.log('No parent branch configured');
 * }
 *
 * // Use with Effect.flatMap for chaining
 * const status = await Effect.runPromise(
 *   Effect.flatMap(
 *     getWorktreeParentBranch('/path/to/worktree'),
 *     (branch) => branch
 *       ? Effect.succeed(`Tracking ${branch}`)
 *       : Effect.succeed('No tracking')
 *   )
 * );
 * ```
 */
export function getWorktreeParentBranch(
	worktreePath: string,
): Effect.Effect<string | null, never> {
	// Return null if worktree config extension is not available
	if (!worktreeConfigManager.isAvailable()) {
		return Effect.succeed(null);
	}

	return Effect.catchAll(
		Effect.tryPromise({
			try: signal =>
				execFileAsync(
					'git',
					['config', '--worktree', 'ccmanager.parentBranch'],
					{
						cwd: worktreePath,
						encoding: 'utf8',
						signal,
					},
				).then(result => result.stdout.trim() || null),
			catch: error => error,
		}),
		error => {
			// Abort errors should interrupt
			if (isAbortError(error)) {
				return Effect.interrupt;
			}
			// Config not existing is not an error, return null
			return Effect.succeed<string | null>(null);
		},
	);
}

/**
 * Set parent branch for worktree using Effect
 * Succeeds silently if worktree config is not available
 *
 * @param {string} worktreePath - Path to the worktree directory
 * @param {string} parentBranch - Name of the parent branch to track
 * @returns {Effect.Effect<void, GitError>} Effect that succeeds or fails with GitError
 *
 * @example
 * ```typescript
 * import {Effect} from 'effect';
 * import {setWorktreeParentBranch} from './utils/worktreeConfig.js';
 *
 * // Set parent branch with error handling
 * await Effect.runPromise(
 *   Effect.catchTag(
 *     setWorktreeParentBranch('/path/to/worktree', 'main'),
 *     'GitError',
 *     (error) => {
 *       console.error(`Failed to set parent branch: ${error.stderr}`);
 *       return Effect.void; // Continue despite error
 *     }
 *   )
 * );
 *
 * // Or use Effect.orElse for fallback
 * await Effect.runPromise(
 *   Effect.orElse(
 *     setWorktreeParentBranch('/path/to/worktree', 'develop'),
 *     () => {
 *       console.log('Using fallback - no parent tracking');
 *       return Effect.void;
 *     }
 *   )
 * );
 * ```
 *
 * @throws {GitError} When git config command fails
 */
export function setWorktreeParentBranch(
	worktreePath: string,
	parentBranch: string,
): Effect.Effect<void, GitError> {
	// Skip if worktree config extension is not available
	if (!worktreeConfigManager.isAvailable()) {
		return Effect.void;
	}

	const command = `git config --worktree ccmanager.parentBranch ${parentBranch}`;
	return Effect.catchAll(
		Effect.tryPromise({
			try: signal =>
				execFileAsync(
					'git',
					['config', '--worktree', 'ccmanager.parentBranch', parentBranch],
					{
						cwd: worktreePath,
						encoding: 'utf8',
						signal,
					},
				).then(() => undefined),
			catch: error => error,
		}),
		error => {
			// Abort errors should interrupt
			if (isAbortError(error)) {
				return Effect.interrupt as Effect.Effect<void, GitError>;
			}
			// Other errors are git failures
			return Effect.fail(toGitError(command, error));
		},
	);
}

function isAbortError(error: unknown): boolean {
	if (error instanceof Error && error.name === 'AbortError') {
		return true;
	}

	if (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as {code?: unknown}).code === 'ABORT_ERR'
	) {
		return true;
	}

	return false;
}

function toGitError(command: string, error: unknown): GitError {
	if (error instanceof GitError) {
		return error;
	}

	if (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		'stderr' in error
	) {
		const execError = error as {
			code?: string | number;
			stderr?: string;
			stdout?: string;
			message?: string;
		};
		const exitCode =
			typeof execError.code === 'number'
				? execError.code
				: Number.parseInt(String(execError.code ?? '-1'), 10) || -1;
		const stderr =
			typeof execError.stderr === 'string'
				? execError.stderr
				: (execError.message ?? '');

		return new GitError({
			command,
			exitCode,
			stderr,
			stdout:
				typeof execError.stdout === 'string' && execError.stdout.length > 0
					? execError.stdout
					: undefined,
		});
	}

	if (error instanceof Error) {
		return new GitError({
			command,
			exitCode: -1,
			stderr: error.message,
		});
	}

	return new GitError({
		command,
		exitCode: -1,
		stderr: String(error),
	});
}

