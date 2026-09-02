import React from 'react';
import {Box, Text} from 'ink';
import path from 'path';
import Confirmation from './Confirmation.js';
import type {SessionRecord} from '../services/sessionRestoreStore.js';
import {describeRecordPreset} from '../services/sessionRestorer.js';

interface RestoreSessionsProps {
	sessions: SessionRecord[];
	/** Whether to show which project each session belongs to. */
	showProject?: boolean;
	onRestore: () => void;
	onDiscard: () => void;
}

/**
 * Startup offer to launch the sessions that were open when ccmanager last ran.
 *
 * Restoring runs each session's command preset in its worktree again; the
 * previous terminal output and conversation are not brought back. Declining
 * forgets the listed sessions, so the offer does not reappear on the next
 * start.
 */
const RestoreSessions: React.FC<RestoreSessionsProps> = ({
	sessions,
	showProject = false,
	onRestore,
	onDiscard,
}) => {
	const message = (
		<Box flexDirection="column">
			<Text>
				Found {sessions.length} session{sessions.length === 1 ? '' : 's'} from
				the last time ccmanager ran. Start{' '}
				{sessions.length === 1 ? 'it' : 'them'} again?
			</Text>
			<Box marginTop={1} flexDirection="column">
				{sessions.map(session => (
					<Text key={session.id}>
						{'  '}
						<Text color="green">{path.basename(session.worktreePath)}</Text>
						{session.sessionName ? ` (${session.sessionName})` : ''}
						<Text dimColor>
							{' '}
							— {describeRecordPreset(session)}
							{showProject ? ` — ${path.basename(session.projectPath)}` : ''}
						</Text>
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					Each session runs its command again in its worktree. Previous output
					and conversation are not restored.
				</Text>
			</Box>
		</Box>
	);

	return (
		<Confirmation
			title={<Text bold>Restore previous sessions</Text>}
			message={message}
			options={[
				{label: 'Restore', value: 'restore', color: 'green'},
				{label: "Don't restore", value: 'discard', color: 'red'},
			]}
			onSelect={value => {
				if (value === 'restore') {
					onRestore();
				} else {
					onDiscard();
				}
			}}
			hint={
				<Text dimColor>
					Use ↑↓ to navigate, Enter to select. Declining forgets these sessions.
				</Text>
			}
		/>
	);
};

export default RestoreSessions;
