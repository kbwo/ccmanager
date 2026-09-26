import {useEffect, useState} from 'react';
import {
	worktreeCreationTracker,
	type WorktreeCreationJob,
} from '../services/worktreeCreationTracker.js';

/**
 * Running worktree creations, re-rendered whenever one starts, progresses or
 * ends. Pass a project key to see only that project's creations.
 */
export function useWorktreeCreationJobs(
	projectKey?: string,
): WorktreeCreationJob[] {
	const [jobs, setJobs] = useState(() =>
		worktreeCreationTracker.getJobs(projectKey),
	);

	useEffect(() => {
		const handleChange = () => {
			setJobs(worktreeCreationTracker.getJobs(projectKey));
		};
		// Catch up on changes made between the first render and subscribing.
		handleChange();
		worktreeCreationTracker.on('changed', handleChange);
		return () => {
			worktreeCreationTracker.off('changed', handleChange);
		};
	}, [projectKey]);

	return jobs;
}
