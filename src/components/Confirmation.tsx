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
		// Handle Y/N hotkeys
		const keyPressed = input.toLowerCase();

		if (keyPressed === 'y') {
			// Y - confirm action
			onConfirm();
			return;
		}

		if (keyPressed === 'n') {
			// N - cancel action
			onCancel();
			return;
		}

		// Handle escape key
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
			return;
		}

		// Handle enter key
		if (key.return) {
			if (focused) {
				onConfirm();
			} else {
				onCancel();
			}
			return;
		}

		// Handle navigation
		if (key.leftArrow || key.rightArrow) {
			setFocused(!focused);
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
					Use ← → to navigate, Enter to select, Y-Yes N-No{' '}
					{shortcutManager.getShortcutDisplay('cancel')} to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default Confirmation;
