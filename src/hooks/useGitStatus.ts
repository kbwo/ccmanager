import {useEffect, useState, type Dispatch, type SetStateAction} from 'react';
import {Worktree} from '../types/index.js';
import type {GitStatus} from '../utils/gitStatus.js';
import type {WorktreeStatusResult} from '../utils/gitStatusFetch.js';
import {fetchGitStatuses} from '../utils/gitStatusClient.js';

interface CachedStatus {
	gitStatus?: GitStatus;
	gitStatusError?: string;
	lastCommitDate?: Date;
}

/**
 * Module-level cache of the last fetched git status, keyed by worktree path.
 *
 * The menu is fully unmounted and remounted on every return to it (App renders
 * `<Menu key={menuKey} />`, and the key changes on navigation), which would
 * otherwise wipe this hook's state and force every worktree to flash
 * "[fetching...]" and refetch from scratch each time. Seeding state from this
 * cache shows each worktree's last known status instantly; background polling
 * still refreshes it. Entries are intentionally not pruned so switching between
 * projects keeps each project's cached status.
 */
const statusCache = new Map<string, CachedStatus>();

/** Clear the module-level git-status cache. Intended for tests. */
export function clearGitStatusCache(): void {
	statusCache.clear();
}

/**
 * Merge any cached status onto the given worktrees so a remount can show the
 * last known status immediately instead of "[fetching...]". Returns the same
 * array reference when nothing was cached, so React can skip a re-render.
 */
function hydrateFromCache(worktrees: Worktree[]): Worktree[] {
	let changed = false;
	const next = worktrees.map(wt => {
		const cached = statusCache.get(wt.path);
		if (!cached) {
			return wt;
		}
		changed = true;
		return {
			...wt,
			gitStatus: cached.gitStatus,
			gitStatusError: cached.gitStatusError,
			lastCommitDate: cached.lastCommitDate,
		};
	});
	return changed ? next : worktrees;
}

/** Record a worktree's latest status update into the module-level cache. */
function cacheStatusUpdate(path: string, update: Partial<Worktree>): void {
	const next: CachedStatus = {...statusCache.get(path)};
	if ('gitStatus' in update) {
		next.gitStatus = update.gitStatus;
	}
	if ('gitStatusError' in update) {
		next.gitStatusError = update.gitStatusError;
	}
	if ('lastCommitDate' in update) {
		next.lastCommitDate = update.lastCommitDate;
	}
	statusCache.set(path, next);
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
	const [worktreesWithStatus, setWorktreesWithStatus] = useState(() =>
		hydrateFromCache(worktrees),
	);

	useEffect(() => {
		if (!defaultBranch) {
			return;
		}

		const abortController = new AbortController();
		let isCleanedUp = false;
		let cycleTimeout: NodeJS.Timeout | undefined;

		const runCycle = async () => {
			// Fetch all worktrees concurrently, off this thread when a worker is
			// available: starting git subprocesses blocks the thread that starts
			// them, which would otherwise freeze keyboard navigation.
			const results = await fetchGitStatuses(
				worktrees.map(worktree => worktree.path),
				abortController.signal,
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

		setWorktreesWithStatus(hydrateFromCache(worktrees));

		runCycle().catch(() => {
			// Ignore errors - the fetch failed or was aborted
		});

		return () => {
			isCleanedUp = true;
			if (cycleTimeout) {
				clearTimeout(cycleTimeout);
			}
			abortController.abort();
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
		const update = buildStatusUpdate(result);
		if (update) {
			updatesByPath.set(result.path, update);
			cacheStatusUpdate(result.path, update);
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
 * Build the update object for a single worktree from its fetch result.
 *
 * @returns A partial worktree to merge, or null when there is nothing to update
 *   (e.g. the status fetch was interrupted and the commit date failed).
 */
function buildStatusUpdate({
	status,
	lastCommitDate,
}: WorktreeStatusResult): Partial<Worktree> | null {
	const update: Partial<Worktree> = {};
	let hasUpdate = false;

	if (status.ok) {
		update.gitStatus = status.value;
		update.gitStatusError = undefined;
		hasUpdate = true;
	} else if (status.error !== null) {
		update.gitStatus = undefined;
		update.gitStatusError = status.error;
		hasUpdate = true;
	}

	if (lastCommitDate !== null) {
		update.lastCommitDate = new Date(lastCommitDate);
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
