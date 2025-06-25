import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {shortcutManager} from '../services/shortcutManager.js';

interface ConfirmationProps {
	message: string | React.ReactNode;
	onConfirm: () => void;
	onCancel: () => void;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: string;
	cancelColor?: string;
}

const Confirmation: React.FC<ConfirmationProps> = ({
	message,
	onConfirm,
	onCancel,
	confirmText = 'Yes',
	cancelText = 'No',
	confirmColor = 'green',
	cancelColor = 'red',
}) => {
	const [focused, setFocused] = useState(true); // true = confirm, false = cancel

	useInput((input, key) => {
		if (key.leftArrow || key.rightArrow) {
			setFocused(!focused);
		} else if (key.return) {
			if (focused) {
				onConfirm();
			} else {
				onCancel();
			}
		} else if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>{message}</Box>

			<Box>
				<Box marginRight={2}>
					<Text color={focused ? confirmColor : 'white'} inverse={focused}>
						{' '}
						{confirmText}{' '}
					</Text>
				</Box>
				<Box>
					<Text color={!focused ? cancelColor : 'white'} inverse={!focused}>
						{' '}
						{cancelText}{' '}
					</Text>
				</Box>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					Use ← → to navigate, Enter to select,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default Confirmation;
