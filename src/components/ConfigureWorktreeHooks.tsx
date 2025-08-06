import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {configurationManager} from '../services/configurationManager.js';
import {WorktreeHookConfig} from '../types/index.js';

interface ConfigureWorktreeHooksProps {
	onComplete: () => void;
}

type View = 'menu' | 'edit';

interface MenuItem {
	label: string;
	value: string;
}

const ConfigureWorktreeHooks: React.FC<ConfigureWorktreeHooksProps> = ({
	onComplete,
}) => {
	const [view, setView] = useState<View>('menu');
	const [worktreeHooks, setWorktreeHooks] = useState<WorktreeHookConfig>({});
	const [currentCommand, setCurrentCommand] = useState('');
	const [currentEnabled, setCurrentEnabled] = useState(false);
	const [showSaveMessage, setShowSaveMessage] = useState(false);

	useEffect(() => {
		setWorktreeHooks(configurationManager.getWorktreeHooks());
	}, []);

	useInput((input, key) => {
		if (key.escape) {
			if (view === 'edit') {
				setView('menu');
			} else {
				onComplete();
			}
		} else if (key.tab && view === 'edit') {
			toggleEnabled();
		}
	});

	const getMenuItems = (): MenuItem[] => {
		const items: MenuItem[] = [];

		// Add worktree hook items
		const postCreationHook = worktreeHooks.post_creation;
		const postCreationEnabled = postCreationHook?.enabled ? '✓' : '✗';
		const postCreationCommand = postCreationHook?.command || '(not set)';
		items.push({
			label: `Post Creation: ${postCreationEnabled} ${postCreationCommand}`,
			value: 'worktree:post_creation',
		});

		items.push({
			label: '',
			value: 'separator',
		});

		items.push({
			label: '💾 Save and Return',
			value: 'save',
		});

		items.push({
			label: '← Cancel',
			value: 'cancel',
		});

		return items;
	};

	const handleMenuSelect = (item: MenuItem) => {
		if (item.value === 'save') {
			configurationManager.setWorktreeHooks(worktreeHooks);
			setShowSaveMessage(true);
			setTimeout(() => {
				onComplete();
			}, 1000);
		} else if (item.value === 'cancel') {
			onComplete();
		} else if (
			!item.value.includes('separator') &&
			item.value === 'worktree:post_creation'
		) {
			const hook = worktreeHooks.post_creation;
			setCurrentCommand(hook?.command || '');
			setCurrentEnabled(hook?.enabled ?? true);
			setView('edit');
		}
	};

	const handleCommandSubmit = (value: string) => {
		setWorktreeHooks(prev => ({
			...prev,
			post_creation: {
				command: value,
				enabled: currentEnabled,
			},
		}));
		setView('menu');
	};

	const toggleEnabled = () => {
		setCurrentEnabled(prev => !prev);
	};

	if (showSaveMessage) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Configuration saved successfully!</Text>
			</Box>
		);
	}

	if (view === 'edit') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Configure Post Worktree Creation Hook
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Command to execute after creating a new worktree:</Text>
				</Box>

				<Box marginBottom={1}>
					<TextInputWrapper
						value={currentCommand}
						onChange={setCurrentCommand}
						onSubmit={handleCommandSubmit}
						placeholder="Enter command (e.g., npm install && npm run build)"
					/>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Enabled: {currentEnabled ? '✓' : '✗'} (Press Tab to toggle)
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Environment variables available: CCMANAGER_WORKTREE,
						CCMANAGER_WORKTREE_BRANCH,
					</Text>
				</Box>
				<Box>
					<Text dimColor>CCMANAGER_BASE_BRANCH, CCMANAGER_GIT_ROOT</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Press Enter to save, Tab to toggle enabled, Esc to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Worktree Hooks
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Set commands to run on worktree events:</Text>
			</Box>

			<SelectInput
				items={getMenuItems()}
				onSelect={handleMenuSelect}
				isFocused={true}
				limit={10}
			/>

			<Box marginTop={1}>
				<Text dimColor>Press Esc to go back</Text>
			</Box>
		</Box>
	);
};

export default ConfigureWorktreeHooks;
