import React from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {shortcutManager} from '../services/shortcutManager.js';

export interface ConfirmationOption {
	label: string;
	value: string;
	color?: string;
}

interface ConfirmationProps {
	title?: React.ReactNode;
	message?: React.ReactNode;
	options: ConfirmationOption[];
	onSelect: (value: string) => void;
	initialIndex?: number;
	indicatorColor?: string;
	hint?: React.ReactNode;
	onCancel?: () => void;
	onEscape?: () => void;
	onCustomInput?: (input: string, key: {[key: string]: boolean}) => boolean; // Return true if handled
}

/**
 * Reusable confirmation component with SelectInput UI pattern
 */
const Confirmation: React.FC<ConfirmationProps> = ({
	title,
	message,
	options,
	onSelect,
	initialIndex = 0,
	indicatorColor,
	hint,
	onCancel,
	onEscape,
	onCustomInput,
}) => {
	useInput((input, key) => {
		// Check custom input handler first
		if (onCustomInput && onCustomInput(input, key)) {
			return;
		}

		// Handle cancel shortcut
		if (onCancel && shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
			return;
		}

		// Handle escape key
		if (onEscape && key['escape']) {
			onEscape();
			return;
		}
	});

	const handleSelect = (item: {value: string}) => {
		onSelect(item.value);
	};

	return (
		<Box flexDirection="column">
			{title && <Box marginBottom={1}>{title}</Box>}

			{message && <Box marginBottom={1}>{message}</Box>}

			<Box marginTop={1}>
				<SelectInput
					items={options}
					onSelect={handleSelect}
					initialIndex={initialIndex}
					indicatorComponent={({isSelected}) => (
						<Text
							color={isSelected && indicatorColor ? indicatorColor : undefined}
						>
							{isSelected ? '>' : ' '}
						</Text>
					)}
					itemComponent={({isSelected, label}) => {
						// Find the color for this option
						const option = options.find(opt => opt.label === label);
						const color = option?.color;

						return (
							<Text
								color={
									isSelected && color ? color : isSelected ? undefined : 'white'
								}
								inverse={isSelected}
							>
								{' '}
								{label}{' '}
							</Text>
						);
					}}
				/>
			</Box>

			{hint && <Box marginTop={1}>{hint}</Box>}
		</Box>
	);
};

export default Confirmation;

// SimpleConfirmation component for backward compatibility
interface SimpleConfirmationProps {
	message: string | React.ReactNode;
	onConfirm: () => void;
	onCancel: () => void;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: string;
	cancelColor?: string;
}

export const SimpleConfirmation: React.FC<SimpleConfirmationProps> = ({
	message,
	onConfirm,
	onCancel,
	confirmText = 'Yes',
	cancelText = 'No',
	confirmColor = 'green',
	cancelColor = 'red',
}) => {
	const options = [
		{label: confirmText, value: 'confirm', color: confirmColor},
		{label: cancelText, value: 'cancel', color: cancelColor},
	];

	const handleSelect = (value: string) => {
		if (value === 'confirm') {
			onConfirm();
		} else {
			onCancel();
		}
	};

	const hint = (
		<Text dimColor>
			Use ↑↓/j/k to navigate, Enter to select,{' '}
			{shortcutManager.getShortcutDisplay('cancel')} to cancel
		</Text>
	);

	return (
		<Confirmation
			message={message}
			options={options}
			onSelect={handleSelect}
			initialIndex={0}
			hint={hint}
			onCancel={onCancel}
		/>
	);
};
