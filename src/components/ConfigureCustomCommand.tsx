import React from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface ConfigureCustomCommandProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

const ConfigureCustomCommand: React.FC<ConfigureCustomCommandProps> = ({
	value,
	onChange,
	onSubmit,
	onCancel,
}) => {
	const shouldIgnoreNextChange = React.useRef(false);

	const handleChange = (newValue: string) => {
		if (shouldIgnoreNextChange.current) {
			shouldIgnoreNextChange.current = false;
			return;
		}

		onChange(newValue);
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
			return;
		}

		// Ctrl+K clears the current input
		if (key.ctrl && input.toLowerCase() === 'k') {
			// Ignore the TextInput change event that will fire for the same key
			shouldIgnoreNextChange.current = true;
			onChange('');
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Custom Auto-Approval Command
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>
					Enter the command that returns {'{needsPermission:boolean}'} JSON:
				</Text>
			</Box>

			<Box marginBottom={1}>
				<TextInputWrapper
					value={value}
					onChange={handleChange}
					onSubmit={() => onSubmit(value)}
					placeholder={`e.g. jq -n '{"needsPermission":true}'`}
					focus
				/>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Env provided: $DEFAULT_PROMPT, $TERMINAL_OUTPUT</Text>
			</Box>

			<Box>
				<Text dimColor>
					Press Enter to save, {shortcutManager.getShortcutDisplay('cancel')} to
					go back, Ctrl+K to clear input
				</Text>
			</Box>
		</Box>
	);
};

export default ConfigureCustomCommand;
