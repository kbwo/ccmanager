import React from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';

export type SessionActionType = 'newSession' | 'rename' | 'kill';

interface SessionActionsProps {
	sessionLabel: string;
	onSelect: (action: SessionActionType) => void;
	onCancel: () => void;
}

const items: Array<{label: string; value: SessionActionType}> = [
	{label: 'S  New session in same directory', value: 'newSession'},
	{label: 'R  Rename this session', value: 'rename'},
	{label: 'X  Close session', value: 'kill'},
];

const SessionActions: React.FC<SessionActionsProps> = ({
	sessionLabel,
	onSelect,
	onCancel,
}) => {
	useInput((input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}

		switch (input.toLowerCase()) {
			case 's':
				onSelect('newSession');
				break;
			case 'r':
				onSelect('rename');
				break;
			case 'x':
				onSelect('kill');
				break;
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				Session Actions
			</Text>
			<Box marginTop={1}>
				<Text dimColor>{sessionLabel}</Text>
			</Box>
			<Box marginTop={1}>
				<SelectInput items={items} onSelect={item => onSelect(item.value)} />
			</Box>
			<Box marginTop={1}>
				<Text dimColor>S/R/X or arrow keys + Enter | Escape to cancel</Text>
			</Box>
		</Box>
	);
};

export default SessionActions;
