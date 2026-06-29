import {useEffect, useState, type Dispatch, type SetStateAction} from 'react';
import {Effect, Exit, Cause, Option} from 'effect';
import {Worktree} from '../types/index.js';
import {
	getGitStatusLimited,
	getLastCommitDateLimited,
	type GitStatus,
} from '../utils/gitStatus.js';
import type {GitError} from '../types/errors.js';

interface WorktreeStatusResult {
	path: string;
	statusExit: Exit.Exit<GitStatus, GitError>;
	dateExit: Exit.Exit<Date, GitError>;
}

/**
 * Custom hook for polling git status and commit dates of worktrees with Effect-based execution
 *
 * Fetches git status and last commit date for each worktree at regular intervals
 * using Effect.runPromiseExit and updates worktree state with results.
 * Both are fetched together so they appear at the same time.
 * Handles cancellation via AbortController.
 *
 * Each poll cycle fetches every worktree concurrently and commits the results in
 * a single state update, skipping the update entirely when nothing changed. This
 * keeps a poll cycle to at most one re-render of the consumer (the menu) instead
 * of one per worktree, so background polling does not stutter keyboard navigation.
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

		const activeRequests = new Set<AbortController>();
		let isCleanedUp = false;
		let cycleTimeout: NodeJS.Timeout | undefined;

		const fetchStatus = async (
			worktree: Worktree,
		): Promise<WorktreeStatusResult> => {
			const abortController = new AbortController();
			activeRequests.add(abortController);

			try {
				// Fetch git status and last commit date in parallel
				const [statusExit, dateExit] = await Promise.all([
					Effect.runPromiseExit(getGitStatusLimited(worktree.path), {
						signal: abortController.signal,
					}),
					Effect.runPromiseExit(getLastCommitDateLimited(worktree.path), {
						signal: abortController.signal,
					}),
				]);

				return {path: worktree.path, statusExit, dateExit};
			} finally {
				activeRequests.delete(abortController);
			}
		};

		const runCycle = async () => {
			// Fetch all worktrees concurrently. The underlying Effects are already
			// concurrency-limited, so this does not spawn an unbounded number of git
			// subprocesses at once.
			const results = await Promise.all(
				worktrees.map(worktree => fetchStatus(worktree)),
			);

			if (isCleanedUp) {
				return;
			}

			// Apply every worktree's result in one state update so the consumer
			// re-renders at most once per cycle.
			applyStatusResults(results, setWorktreesWithStatus);

			if (!isCleanedUp) {
				cycleTimeout = setTimeout(() => {
					if (!isCleanedUp) {
						runCycle();
					}
				}, updateInterval);
			}
		};

		setWorktreesWithStatus(worktrees);

		runCycle().catch(() => {
			// Ignore errors - the fetch failed or was aborted
		});

		return () => {
			isCleanedUp = true;
			if (cycleTimeout) {
				clearTimeout(cycleTimeout);
			}
			activeRequests.forEach(controller => controller.abort());
		};
	}, [worktrees, defaultBranch, updateInterval]);

	return worktreesWithStatus;
}

/**
 * Apply a cycle's worth of status results in a single state update.
 *
 * Builds the next worktree array by merging each result onto the matching
 * worktree, but only when the result actually changes a field. When nothing
 * changed, the previous array reference is returned so React skips the re-render
 * (and any downstream items rebuild) entirely.
 *
 * @param results - Per-worktree status/date Exit results for this cycle
 * @param setWorktreesWithStatus - State setter function
 */
function applyStatusResults(
	results: WorktreeStatusResult[],
	setWorktreesWithStatus: Dispatch<SetStateAction<Worktree[]>>,
): void {
	const updatesByPath = new Map<string, Partial<Worktree>>();
	for (const result of results) {
		const update = buildStatusUpdate(result.statusExit, result.dateExit);
		if (update) {
			updatesByPath.set(result.path, update);
		}
	}

	if (updatesByPath.size === 0) {
		return;
	}

	setWorktreesWithStatus(prev => {
		let changed = false;
		const next = prev.map(wt => {
			const update = updatesByPath.get(wt.path);
			if (!update || isUpdateNoop(wt, update)) {
				return wt;
			}
			changed = true;
			return {...wt, ...update};
		});
		return changed ? next : prev;
	});
}

/**
 * Build the update object for a single worktree from its Exit results.
 *
 * @returns A partial worktree to merge, or null when there is nothing to update
 *   (e.g. the status fetch was interrupted and the commit date failed).
 */
function buildStatusUpdate(
	statusExit: Exit.Exit<GitStatus, GitError>,
	dateExit: Exit.Exit<Date, GitError>,
): Partial<Worktree> | null {
	const update: Partial<Worktree> = {};
	let hasUpdate = false;

	if (Exit.isSuccess(statusExit)) {
		update.gitStatus = statusExit.value;
		update.gitStatusError = undefined;
		hasUpdate = true;
	} else if (Exit.isFailure(statusExit)) {
		const failure = Cause.failureOption(statusExit.cause);
		if (Option.isSome(failure)) {
			update.gitStatus = undefined;
			update.gitStatusError = formatGitError(failure.value);
			hasUpdate = true;
		}
	}

	if (Exit.isSuccess(dateExit)) {
		update.lastCommitDate = dateExit.value;
		hasUpdate = true;
	}
	// Silently ignore commit date errors (e.g., empty repo)

	return hasUpdate ? update : null;
}

/**
 * Determine whether applying `update` to `wt` would change any field, so that
 * no-op updates can be dropped before they trigger a re-render.
 */
function isUpdateNoop(wt: Worktree, update: Partial<Worktree>): boolean {
	if (
		'gitStatus' in update &&
		!isSameGitStatus(wt.gitStatus, update.gitStatus)
	) {
		return false;
	}
	if (
		'gitStatusError' in update &&
		wt.gitStatusError !== update.gitStatusError
	) {
		return false;
	}
	if ('lastCommitDate' in update) {
		const prevTime = wt.lastCommitDate?.getTime();
		const nextTime = update.lastCommitDate?.getTime();
		if (prevTime !== nextTime) {
			return false;
		}
	}
	return true;
}

function isSameGitStatus(a?: GitStatus, b?: GitStatus): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return (
		a.filesAdded === b.filesAdded &&
		a.filesDeleted === b.filesDeleted &&
		a.aheadCount === b.aheadCount &&
		a.behindCount === b.behindCount &&
		a.parentBranch === b.parentBranch
	);
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
