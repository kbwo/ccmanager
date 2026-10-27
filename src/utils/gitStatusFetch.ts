import {Effect, Exit, Cause, Option} from 'effect';
import {getGitStatusLimited, type GitStatus} from './gitStatus.js';
import type {GitError} from '../types/errors.js';

/**
 * Outcome of one worktree's git status fetch, shaped so it can cross a
 * worker-thread boundary (structured clone): no Effect Exit, no Date, no class
 * instances.
 *
 * `error: null` means the fetch was interrupted rather than failed, so there is
 * nothing to report.
 */
export type StatusOutcome =
	{ok: true; value: GitStatus} | {ok: false; error: string | null};

export interface WorktreeStatusResult {
	path: string;
	status: StatusOutcome;
}

/**
 * Fetch git status for every path, concurrently (the underlying Effects are
 * concurrency-limited, so this does not spawn an unbounded number of git
 * subprocesses at once).
 *
 * Spawning those subprocesses blocks the calling thread, so callers that own a
 * UI should run this in a worker; see gitStatusClient.ts.
 */
export async function fetchWorktreeStatuses(
	paths: string[],
	signal?: AbortSignal,
): Promise<WorktreeStatusResult[]> {
	return Promise.all(
		paths.map(async path => ({
			path,
			status: toStatusOutcome(
				await Effect.runPromiseExit(getGitStatusLimited(path), {signal}),
			),
		})),
	);
}

function toStatusOutcome(exit: Exit.Exit<GitStatus, GitError>): StatusOutcome {
	if (Exit.isSuccess(exit)) {
		return {ok: true, value: exit.value};
	}
	const failure = Cause.failureOption(exit.cause);
	return {
		ok: false,
		error: Option.isSome(failure) ? formatGitError(failure.value) : null,
	};
}

/**
 * Format GitError into a user-friendly error message
 *
 * @param error - GitError from failed git operation
 * @returns Formatted error message string
 */
function formatGitError(error: GitError): string {
	const exitCode = Number.isFinite(error.exitCode) ? error.exitCode : -1;
	const details = [error.stderr, error.stdout]
		.filter(part => typeof part === 'string' && part.trim().length > 0)
		.map(part => part!.trim());
	const detail = details[0] ?? '';
	return detail
		? `git command "${error.command}" failed (exit code ${exitCode}): ${detail}`
		: `git command "${error.command}" failed (exit code ${exitCode})`;
}
