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

/**
 * Legacy synchronous wrapper for setWorktreeParentBranch
 * @deprecated Use setWorktreeParentBranch with Effect instead
 * TODO: Remove this after worktreeService.ts migration in Phase 3
 */
export function setWorktreeParentBranchLegacy(
	worktreePath: string,
	parentBranch: string,
): void {
	// Skip if worktree config extension is not available
	if (!worktreeConfigManager.isAvailable()) {
		return;
	}

	execSync(`git config --worktree ccmanager.parentBranch "${parentBranch}"`, {
		cwd: worktreePath,
		encoding: 'utf8',
	});
}
