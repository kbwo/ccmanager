import React from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface ConfigureTimeoutProps {
	value: number;
	onChange: (value: number) => void;
	onSubmit: (value: number) => void;
	onCancel: () => void;
}

const ConfigureTimeout: React.FC<ConfigureTimeoutProps> = ({
	value,
	onChange,
	onSubmit,
	onCancel,
}) => {
	const [inputValue, setInputValue] = React.useState(String(value));

	const handleChange = (newValue: string) => {
		// Only allow numeric input
		const filtered = newValue.replace(/[^0-9]/g, '');
		setInputValue(filtered);
		const parsed = parseInt(filtered, 10);
		if (!isNaN(parsed) && parsed > 0) {
			onChange(parsed);
		}
	};

	const handleSubmit = () => {
		const parsed = parseInt(inputValue, 10);
		if (!isNaN(parsed) && parsed > 0) {
			onSubmit(parsed);
		}
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Auto-Approval Timeout
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>Enter timeout in seconds for auto-approval verification:</Text>
			</Box>

			<Box marginBottom={1}>
				<TextInputWrapper
					value={inputValue}
					onChange={handleChange}
					onSubmit={handleSubmit}
					placeholder="e.g. 30"
					focus
				/>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Must be a positive integer (minimum: 1 second, default: 30 seconds)
				</Text>
			</Box>

			<Box>
				<Text dimColor>
					Press Enter to save, {shortcutManager.getShortcutDisplay('cancel')} to
					go back
				</Text>
			</Box>
		</Box>
	);
};

export default ConfigureTimeout;
