import React from 'react';
import {Box, Text} from 'ink';

interface CustomCommandSummaryProps {
	command: string;
}

const CustomCommandSummary: React.FC<CustomCommandSummaryProps> = ({
	command,
}) => {
	const displayValue = command.trim() ? command : 'Empty';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text>Custom auto-approval command:</Text>
			<Text dimColor>{displayValue}</Text>
			<Text dimColor>Env provided: $DEFAULT_PROMPT, $TERMINAL_OUTPUT</Text>
		</Box>
	);
};

export default CustomCommandSummary;
