import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {
	describeWorktreeCreationStage,
	type WorktreeCreationJob,
} from '../services/worktreeCreationTracker.js';
import {supportsUnicode} from '../utils/terminalCapabilities.js';

interface WorktreeCreationListProps {
	jobs: WorktreeCreationJob[];
}

/** Formats an elapsed duration as "12s" or "3m 05s". */
export const formatElapsed = (elapsedMs: number): string => {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes > 0
		? `${minutes}m ${String(seconds).padStart(2, '0')}s`
		: `${seconds}s`;
};

/**
 * Lists the worktree creations running in the background, with how long each
 * has been running.
 *
 * Deliberately not animated: Ink rewrites the whole screen whenever any part
 * of it changes, so a spinner here made the entire menu flicker several times
 * a second. The elapsed times are refreshed by a single once-a-second timer,
 * which keeps full-screen rewrites to one per second.
 */
const WorktreeCreationList: React.FC<WorktreeCreationListProps> = ({jobs}) => {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = setInterval(() => {
			setNow(Date.now());
		}, 1000);
		return () => {
			clearInterval(interval);
		};
	}, []);

	const marker = supportsUnicode() ? '…' : '...';

	return (
		<Box flexDirection="column">
			<Text dimColor>Creating worktrees in the background:</Text>
			{jobs.map(job => (
				<Text key={job.id}>
					<Text color="cyan">{marker} </Text>
					{job.branch ?? '(branch name pending)'}:{' '}
					{describeWorktreeCreationStage(job)}{' '}
					<Text dimColor>({formatElapsed(now - job.startedAt)})</Text>
				</Text>
			))}
		</Box>
	);
};

export default WorktreeCreationList;
