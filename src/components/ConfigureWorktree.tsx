import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import {configurationManager} from '../services/configurationManager.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface ConfigureWorktreeProps {
	onComplete: () => void;
}

type EditMode = 'menu' | 'pattern';

interface MenuItem {
	label: string;
	value: string;
}

const ConfigureWorktree: React.FC<ConfigureWorktreeProps> = ({onComplete}) => {
	const worktreeConfig = configurationManager.getWorktreeConfig();
	const [autoDirectory, setAutoDirectory] = useState(
		worktreeConfig.autoDirectory,
	);
	const [pattern, setPattern] = useState(
		worktreeConfig.autoDirectoryPattern || '../{branch}',
	);
	const [editMode, setEditMode] = useState<EditMode>('menu');
	const [tempPattern, setTempPattern] = useState(pattern);

	useInput((input, key) => {
		if (
			editMode === 'menu' &&
			shortcutManager.matchesShortcut('cancel', input, key)
		) {
			onComplete();
		}
	});

	const menuItems: MenuItem[] = [
		{
			label: `Auto Directory: ${autoDirectory ? '✅ Enabled' : '❌ Disabled'}`,
			value: 'toggle',
		},
		{
			label: `Pattern: ${pattern}`,
			value: 'pattern',
		},
		{
			label: '💾 Save Changes',
			value: 'save',
		},
		{
			label: '← Cancel',
			value: 'cancel',
		},
	];

	const handleMenuSelect = (item: MenuItem) => {
		switch (item.value) {
			case 'toggle':
				setAutoDirectory(!autoDirectory);
				break;
			case 'pattern':
				setTempPattern(pattern);
				setEditMode('pattern');
				break;
			case 'save':
				// Save the configuration
				configurationManager.setWorktreeConfig({
					autoDirectory,
					autoDirectoryPattern: pattern,
				});
				onComplete();
				break;
			case 'cancel':
				onComplete();
				break;
		}
	};

	const handlePatternSubmit = (value: string) => {
		if (value.trim()) {
			setPattern(value.trim());
		}
		setEditMode('menu');
	};

	if (editMode === 'pattern') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Configure Directory Pattern
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Enter the pattern for automatic directory generation:</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>
						Available placeholders: {'{branch}'} - full branch name
					</Text>
				</Box>

				<Box>
					<Text color="cyan">{'> '}</Text>
					<TextInput
						value={tempPattern}
						onChange={setTempPattern}
						onSubmit={handlePatternSubmit}
						placeholder="../{branch}"
					/>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Press Enter to save or Escape to cancel</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Worktree Settings
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Configure automatic worktree directory generation</Text>
			</Box>

			{autoDirectory && (
				<Box marginBottom={1}>
					<Text>
						Example: branch &quot;feature/my-feature&quot; → directory &quot;
						{pattern.replace('{branch}', 'feature-my-feature')}&quot;
					</Text>
				</Box>
			)}

			<SelectInput
				items={menuItems}
				onSelect={handleMenuSelect}
				isFocused={true}
			/>

			<Box marginTop={1}>
				<Text dimColor>
					Press {shortcutManager.getShortcutDisplay('cancel')} to cancel without
					saving
				</Text>
			</Box>
		</Box>
	);
};

export default ConfigureWorktree;
