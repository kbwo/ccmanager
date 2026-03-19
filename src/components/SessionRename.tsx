import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';

interface SessionRenameProps {
	sessionId: string;
	currentName?: string;
	onRename: (name?: string) => void;
	onCancel: () => void;
}

const SessionRename: React.FC<SessionRenameProps> = ({
	currentName,
	onRename,
	onCancel,
}) => {
	const [name, setName] = useState(currentName || '');

	useInput((_input, key) => {
		if (key.escape) {
			onCancel();
		}
	});

	const handleSubmit = () => {
		const trimmed = name.trim();
		onRename(trimmed || undefined);
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				Rename Session
			</Text>
			<Box marginTop={1}>
				<Text>Name: </Text>
				<TextInput
					value={name}
					onChange={setName}
					onSubmit={handleSubmit}
					placeholder="Enter session name (empty to clear)"
				/>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Enter to confirm, Escape to cancel</Text>
			</Box>
		</Box>
	);
};

export default SessionRename;
