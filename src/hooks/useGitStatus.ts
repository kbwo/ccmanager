import {useEffect, useState} from 'react';
import {Worktree} from '../types/index.js';
import {getGitStatusLegacyLimited} from '../utils/gitStatus.js';

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
			try {
				const result = await getGitStatusLegacyLimited(
					worktree.path,
					abortController.signal,
				);

				if (result.data || result.error) {
					setWorktreesWithStatus(prev =>
						prev.map(wt =>
							wt.path === worktree.path
								? {...wt, gitStatus: result.data, gitStatusError: result.error}
								: wt,
						),
					);
				}
			} catch {
				// Ignore errors - the fetch failed or was aborted
			}
		};

		const scheduleUpdate = (worktree: Worktree) => {
			const abortController = new AbortController();
			activeRequests.set(worktree.path, abortController);

			fetchStatus(worktree, abortController).finally(() => {
				const isActive = () => !isCleanedUp && !abortController.signal.aborted;
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
