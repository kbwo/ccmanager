import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import TextInputWrapper from './TextInputWrapper.js';
import {useConfigEditor} from '../contexts/ConfigEditorContext.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {generateWorktreeDirectory} from '../utils/worktreeUtils.js';

interface ConfigureWorktreeProps {
	onComplete: () => void;
}

type EditMode = 'menu' | 'pattern';

interface MenuItem {
	label: string;
	value: string;
}

const ConfigureWorktree: React.FC<ConfigureWorktreeProps> = ({onComplete}) => {
	const configEditor = useConfigEditor();
	const scope = configEditor.getScope();

	// Get initial worktree config based on scope
	const worktreeConfig =
		configEditor.getWorktreeConfig() ||
		configEditor.getEffectiveWorktreeConfig();
	const [autoDirectory, setAutoDirectory] = useState(
		worktreeConfig.autoDirectory,
	);
	const [pattern, setPattern] = useState(
		worktreeConfig.autoDirectoryPattern || '../{branch}',
	);
	const [copySessionData, setCopySessionData] = useState(
		worktreeConfig.copySessionData ?? true,
	);
	const [sortByLastSession, setSortByLastSession] = useState(
		worktreeConfig.sortByLastSession ?? false,
	);
	const [editMode, setEditMode] = useState<EditMode>('menu');
	const [tempPattern, setTempPattern] = useState(pattern);

	// Show if inheriting from global (for project scope)
	const isInheriting =
		scope === 'project' && !configEditor.hasProjectOverride('worktree');

	// Example values for preview
	const exampleProjectPath = '/home/user/src/myproject';
	const exampleBranchName = 'feature/my-feature';

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
			label: `Copy Session Data: ${copySessionData ? '✅ Enabled' : '❌ Disabled'}`,
			value: 'toggleCopy',
		},
		{
			label: `Sort by Last Session: ${sortByLastSession ? '✅ Enabled' : '❌ Disabled'}`,
			value: 'toggleSort',
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
			case 'toggleCopy':
				setCopySessionData(!copySessionData);
				break;
			case 'toggleSort':
				setSortByLastSession(!sortByLastSession);
				break;
			case 'save':
				// Save the configuration
				configEditor.setWorktreeConfig({
					autoDirectory,
					autoDirectoryPattern: pattern,
					copySessionData,
					sortByLastSession,
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
						Available placeholders: {'{branch}'} - full branch name,{' '}
						{'{project}'} - repository name
					</Text>
				</Box>

				<Box>
					<Text color="cyan">{'> '}</Text>
					<TextInputWrapper
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

	const scopeLabel = scope === 'project' ? 'Project' : 'Global';

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Worktree Settings ({scopeLabel})
				</Text>
			</Box>

			{isInheriting && (
				<Box marginBottom={1}>
					<Text backgroundColor="cyan" color="black">
						{' '}
						📋 Inheriting from global configuration{' '}
					</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Configure worktree creation settings</Text>
			</Box>

			{autoDirectory && (
				<Box marginBottom={1}>
					<Text>
						Example: project &quot;{exampleProjectPath}&quot;, branch &quot;
						{exampleBranchName}&quot; → directory &quot;
						{generateWorktreeDirectory(
							exampleProjectPath,
							exampleBranchName,
							pattern,
						)}
						&quot;
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
