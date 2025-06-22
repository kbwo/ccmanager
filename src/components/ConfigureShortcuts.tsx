import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {shortcutManager} from '../services/shortcutManager.js';
import {ShortcutConfig, ShortcutKey} from '../types/index.js';

interface ConfigureShortcutsProps {
	onComplete: () => void;
}

type ConfigStep = 'menu' | 'editing' | 'capturing';

interface MenuItem {
	label: string;
	value: string;
}

const ConfigureShortcuts: React.FC<ConfigureShortcutsProps> = ({
	onComplete,
}) => {
	const [step, setStep] = useState<ConfigStep>('menu');
	const [shortcuts, setShortcuts] = useState<ShortcutConfig>(
		shortcutManager.getShortcuts(),
	);
	const [editingShortcut, setEditingShortcut] = useState<
		keyof ShortcutConfig | null
	>(null);
	const [error, setError] = useState<string | null>(null);

	const getShortcutDisplayFromState = (key: keyof ShortcutConfig): string => {
		const shortcut = shortcuts[key];
		if (!shortcut) return 'Not set';

		const parts: string[] = [];
		if (shortcut.ctrl) parts.push('Ctrl');
		if (shortcut.alt) parts.push('Alt');
		if (shortcut.shift) parts.push('Shift');

		if (shortcut.key === 'escape') {
			parts.push('Esc');
		} else if (shortcut.key) {
			parts.push(shortcut.key.toUpperCase());
		}

		return parts.join('+');
	};

	const shortcutItems: MenuItem[] = [
		{
			label: `Return to Menu: ${getShortcutDisplayFromState('returnToMenu')}`,
			value: 'returnToMenu',
		},
		{
			label: `Cancel: ${getShortcutDisplayFromState('cancel')}`,
			value: 'cancel',
		},
		{
			label: `Toggle Mode: ${getShortcutDisplayFromState('toggleMode')}`,
			value: 'toggleMode',
		},
		{
			label: '---',
			value: 'separator',
		},
		{
			label: 'Save and Exit',
			value: 'save',
		},
		{
			label: 'Exit without Saving',
			value: 'exit',
		},
	];

	useInput((input, key) => {
		if (step === 'capturing' && editingShortcut) {
			// Capture the key combination
			const newShortcut: ShortcutKey = {
				key: key.escape ? 'escape' : input || '',
				ctrl: key.ctrl || false,
				alt: false, // Ink doesn't support alt
				shift: false, // Ink doesn't support shift
			};

			// Check for reserved keys
			if (key.ctrl && input === 'c') {
				setError('Ctrl+C is reserved and cannot be used');
				setStep('menu');
				return;
			}
			if (key.ctrl && input === 'd') {
				setError('Ctrl+D is reserved and cannot be used');
				setStep('menu');
				return;
			}
			if (key.ctrl && input === '[') {
				setError('Ctrl+[ is reserved and cannot be used');
				setStep('menu');
				return;
			}

			// Validate that a modifier is used (except for escape)
			if (!key.escape && !key.ctrl) {
				setError('Shortcuts must use a modifier key (Ctrl)');
				setStep('menu');
				return;
			}

			setShortcuts({
				...shortcuts,
				[editingShortcut]: newShortcut,
			});
			setError(null);
			setStep('menu');
		} else if (step === 'menu') {
			if (key.escape) {
				onComplete();
			}
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value === 'separator') {
			return;
		}
		if (item.value === 'save') {
			const success = shortcutManager.saveShortcuts(shortcuts);
			if (success) {
				onComplete();
			} else {
				setError('Failed to save shortcuts');
			}
			return;
		}
		if (item.value === 'exit') {
			onComplete();
			return;
		}

		// Start editing a shortcut
		setEditingShortcut(item.value as keyof ShortcutConfig);
		setStep('capturing');
		setError(null);
	};

	if (step === 'capturing') {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					Configure Shortcut: {editingShortcut}
				</Text>
				<Box marginTop={1}>
					<Text>Press the key combination you want to use</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Note: Shortcuts must use Ctrl as a modifier key</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Reserved: Ctrl+C, Ctrl+D, Ctrl+[ (Esc)</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Keyboard Shortcuts
				</Text>
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Select a shortcut to change:</Text>
			</Box>

			<SelectInput
				items={shortcutItems}
				onSelect={handleSelect}
				isFocused={true}
			/>

			<Box marginTop={1}>
				<Text dimColor>Press Esc to exit without saving</Text>
			</Box>
		</Box>
	);
};

export default ConfigureShortcuts;
