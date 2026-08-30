import React from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';

export type SessionActionType =
	| 'newSession'
	| 'rename'
	| 'kill'
	| 'deleteWorktree';

interface SessionActionsProps {
	/**
	 * Name of the session this menu was opened from. Absent for a worktree row
	 * that has no session yet.
	 */
	sessionLabel?: string;
	worktreePath: string;
	/**
	 * Whether the row this menu was opened from has a running session. Session
	 * specific actions (rename, close) are hidden when it does not.
	 */
	hasSession?: boolean;
	/**
	 * Whether the worktree of this row may be deleted; see isDeletableWorktree.
	 * The delete entry is hidden rather than shown-and-rejected so no
	 * unselectable option appears.
	 */
	canDeleteWorktree?: boolean;
	onSelect: (action: SessionActionType) => void;
	onCancel: () => void;
}

const buildItems = (
	hasSession: boolean,
	canDeleteWorktree: boolean,
): Array<{label: string; value: SessionActionType}> => {
	const items: Array<{label: string; value: SessionActionType}> = [
		{label: 'S  New session in this worktree', value: 'newSession'},
	];

	if (hasSession) {
		items.push({label: 'R  Rename this session', value: 'rename'});
		items.push({label: 'X  Close session', value: 'kill'});
	}

	if (canDeleteWorktree) {
		items.push({label: 'D  Delete this worktree', value: 'deleteWorktree'});
	}

	return items;
};

const SessionActions: React.FC<SessionActionsProps> = ({
	sessionLabel,
	worktreePath,
	hasSession = true,
	canDeleteWorktree = false,
	onSelect,
	onCancel,
}) => {
	const items = buildItems(hasSession, canDeleteWorktree);

	useInput((input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}

		const shortcut = items.find(
			item => item.label[0]?.toLowerCase() === input.toLowerCase(),
		);
		if (shortcut) {
			onSelect(shortcut.value);
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				{hasSession ? 'Session Actions' : 'Worktree Actions'}
			</Text>
			<Box marginTop={1} flexDirection="column">
				{sessionLabel && <Text dimColor>{sessionLabel}</Text>}
				<Text dimColor>Directory: {worktreePath}</Text>
			</Box>
			<Box marginTop={1}>
				<SelectInput items={items} onSelect={item => onSelect(item.value)} />
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					{items.map(item => item.label[0]).join('/')} or arrow keys + Enter |
					Escape to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default SessionActions;
