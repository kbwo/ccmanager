import {useEffect, useState, type Dispatch, type SetStateAction} from 'react';
import {Effect, Exit, Cause, Option} from 'effect';
import {Worktree} from '../types/index.js';
import {
	getGitStatusLimited,
	getLastCommitDateLimited,
	type GitStatus,
} from '../utils/gitStatus.js';
import type {GitError} from '../types/errors.js';

/**
 * Custom hook for polling git status and commit dates of worktrees with Effect-based execution
 *
 * Fetches git status and last commit date for each worktree at regular intervals
 * using Effect.runPromiseExit and updates worktree state with results.
 * Both are fetched together so they appear at the same time.
 * Handles cancellation via AbortController.
 *
 * @param worktrees - Array of worktrees to monitor
 * @param defaultBranch - Default branch for comparisons (null disables polling)
 * @param updateInterval - Polling interval in milliseconds (default: 5000)
 * @returns Array of worktrees with updated gitStatus, gitStatusError, and lastCommitDate fields
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
			// Fetch git status and last commit date in parallel
			const [statusExit, dateExit] = await Promise.all([
				Effect.runPromiseExit(getGitStatusLimited(worktree.path), {
					signal: abortController.signal,
				}),
				Effect.runPromiseExit(getLastCommitDateLimited(worktree.path), {
					signal: abortController.signal,
				}),
			]);

			// Update worktree state with both results at once
			handleStatusExit(
				statusExit,
				dateExit,
				worktree.path,
				setWorktreesWithStatus,
			);
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
 * Handle the Exit results from Effect.runPromiseExit and update worktree state
 *
 * Updates both gitStatus and lastCommitDate in a single state update so they
 * appear at the same time in the UI.
 *
 * @param statusExit - Exit result from git status Effect
 * @param dateExit - Exit result from commit date Effect
 * @param worktreePath - Path of the worktree being updated
 * @param setWorktreesWithStatus - State setter function
 */
function handleStatusExit(
	statusExit: Exit.Exit<GitStatus, GitError>,
	dateExit: Exit.Exit<Date, GitError>,
	worktreePath: string,
	setWorktreesWithStatus: Dispatch<SetStateAction<Worktree[]>>,
): void {
	// Build the update object from both results
	const update: Partial<Worktree> = {};
	let hasUpdate = false;

	if (Exit.isSuccess(statusExit)) {
		update.gitStatus = statusExit.value;
		update.gitStatusError = undefined;
		hasUpdate = true;
	} else if (Exit.isFailure(statusExit)) {
		const failure = Cause.failureOption(statusExit.cause);
		if (Option.isSome(failure)) {
			const gitError = failure.value as GitError;
			update.gitStatus = undefined;
			update.gitStatusError = formatGitError(gitError);
			hasUpdate = true;
		}
	}

	if (Exit.isSuccess(dateExit)) {
		update.lastCommitDate = dateExit.value;
		hasUpdate = true;
	}
	// Silently ignore commit date errors (e.g., empty repo)

	if (hasUpdate) {
		setWorktreesWithStatus(prev =>
			prev.map(wt => (wt.path === worktreePath ? {...wt, ...update} : wt)),
		);
	}
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
