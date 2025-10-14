import {useEffect, useState, type Dispatch, type SetStateAction} from 'react';
import {Effect, Exit, Cause, Option} from 'effect';
import {Worktree} from '../types/index.js';
import {getGitStatusLimited, type GitStatus} from '../utils/gitStatus.js';
import type {GitError} from '../types/errors.js';

/**
 * Custom hook for polling git status of worktrees with Effect-based execution
 *
 * Fetches git status for each worktree at regular intervals using Effect.runPromiseExit
 * and updates worktree state with results. Handles cancellation via AbortController.
 *
 * @param worktrees - Array of worktrees to monitor
 * @param defaultBranch - Default branch for comparisons (null disables polling)
 * @param updateInterval - Polling interval in milliseconds (default: 5000)
 * @returns Array of worktrees with updated gitStatus and gitStatusError fields
 */
export function useGitStatus(
	worktrees: Worktree[],
	defaultBranch: string | null,
	updateInterval = 5000,
): Worktree[] {
	const [worktreesWithStatus, setWorktreesWithStatus] = useState(worktrees);

	useEffect(() => {
		if (!defaultBranch) {
			return;
		}

		const timeouts = new Map<string, NodeJS.Timeout>();
		const activeRequests = new Map<string, AbortController>();
		let isCleanedUp = false;

		const fetchStatus = async (
			worktree: Worktree,
			abortController: AbortController,
		) => {
			// Execute the Effect to get git status with cancellation support
			const exit = await Effect.runPromiseExit(
				getGitStatusLimited(worktree.path),
				{
					signal: abortController.signal,
				},
			);

			// Update worktree state based on exit result
			handleStatusExit(exit, worktree.path, setWorktreesWithStatus);
		};

		const scheduleUpdate = (worktree: Worktree) => {
			const abortController = new AbortController();
			activeRequests.set(worktree.path, abortController);

			fetchStatus(worktree, abortController)
				.catch(() => {
					// Ignore errors - the fetch failed or was aborted
				})
				.finally(() => {
					const isActive = () =>
						!isCleanedUp && !abortController.signal.aborted;
					if (isActive()) {
						const timeout = setTimeout(() => {
							if (isActive()) {
								scheduleUpdate(worktree);
							}
						}, updateInterval);

						timeouts.set(worktree.path, timeout);
					}
				});
		};

		setWorktreesWithStatus(worktrees);

		// Start fetching for each worktree
		worktrees.forEach(worktree => {
			scheduleUpdate(worktree);
		});

		return () => {
			isCleanedUp = true;
			timeouts.forEach(timeout => clearTimeout(timeout));
			activeRequests.forEach(controller => controller.abort());
		};
	}, [worktrees, defaultBranch, updateInterval]);

	return worktreesWithStatus;
}

/**
 * Handle the Exit result from Effect.runPromiseExit and update worktree state
 *
 * Uses pattern matching on Exit to distinguish between success, failure, and interruption.
 * Success updates gitStatus, failure updates gitStatusError, interruption is ignored.
 *
 * @param exit - Exit result from Effect execution
 * @param worktreePath - Path of the worktree being updated
 * @param setWorktreesWithStatus - State setter function
 */
function handleStatusExit(
	exit: Exit.Exit<GitStatus, GitError>,
	worktreePath: string,
	setWorktreesWithStatus: Dispatch<SetStateAction<Worktree[]>>,
): void {
	if (Exit.isSuccess(exit)) {
		// Success: update gitStatus and clear error
		const gitStatus = exit.value;
		setWorktreesWithStatus(prev =>
			prev.map(wt =>
				wt.path === worktreePath
					? {...wt, gitStatus, gitStatusError: undefined}
					: wt,
			),
		);
	} else if (Exit.isFailure(exit)) {
		// Failure: extract error and update gitStatusError
		const failure = Cause.failureOption(exit.cause);
		if (Option.isSome(failure)) {
			const gitError = failure.value as GitError;
			const errorMessage = formatGitError(gitError);
			setWorktreesWithStatus(prev =>
				prev.map(wt =>
					wt.path === worktreePath
						? {...wt, gitStatus: undefined, gitStatusError: errorMessage}
						: wt,
				),
			);
		}
	}
	// Interruption: no state update - the request was cancelled
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
