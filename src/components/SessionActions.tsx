import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

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
	const [selectedIndex, setSelectedIndex] = useState(0);

	useInput((input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}

		if (key.upArrow) {
			setSelectedIndex(i => Math.max(0, i - 1));
			return;
		}

		if (key.downArrow) {
			setSelectedIndex(i => Math.min(items.length - 1, i + 1));
			return;
		}

		if (key.return) {
			const item = items[selectedIndex];
			if (item) {
				onSelect(item.value);
			}
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
			<Box marginTop={1} flexDirection="column">
				{items.map((item, index) => (
					<Text
						key={item.value}
						color={index === selectedIndex ? 'cyan' : undefined}
					>
						{index === selectedIndex ? '❯ ' : '  '}
						{item.label}
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>S/R/X or ↑↓ + Enter | Escape to cancel</Text>
			</Box>
		</Box>
	);
};

export default SessionActions;
