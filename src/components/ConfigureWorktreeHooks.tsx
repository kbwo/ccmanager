import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {useConfigEditor} from '../contexts/ConfigEditorContext.js';
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
	const configEditor = useConfigEditor();
	const scope = configEditor.getScope();
	const [view, setView] = useState<View>('menu');

	// Get initial worktree hooks based on scope
	const initialWorktreeHooks = configEditor.getWorktreeHooks() ?? {};
	const [worktreeHooks, setWorktreeHooks] =
		useState<WorktreeHookConfig>(initialWorktreeHooks);
	const [currentCommand, setCurrentCommand] = useState('');
	const [currentEnabled, setCurrentEnabled] = useState(false);
	const [currentHookType, setCurrentHookType] = useState<
		'pre_creation' | 'post_creation'
	>('post_creation');
	const [showSaveMessage, setShowSaveMessage] = useState(false);

	// Show if inheriting from global (for project scope)
	const isInheriting =
		scope === 'project' && !configEditor.hasProjectOverride('worktreeHooks');

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
		const preCreationHook = worktreeHooks.pre_creation;
		const preCreationEnabled = preCreationHook?.enabled ? '✓' : '✗';
		const preCreationCommand = preCreationHook?.command || '(not set)';
		items.push({
			label: `Pre Creation: ${preCreationEnabled} ${preCreationCommand}`,
			value: 'worktree:pre_creation',
		});

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
			configEditor.setWorktreeHooks(worktreeHooks);
			setShowSaveMessage(true);
			setTimeout(() => {
				onComplete();
			}, 1000);
		} else if (item.value === 'cancel') {
			onComplete();
		} else if (item.value === 'worktree:pre_creation') {
			const hook = worktreeHooks.pre_creation;
			setCurrentCommand(hook?.command || '');
			setCurrentEnabled(hook?.enabled ?? true);
			setCurrentHookType('pre_creation');
			setView('edit');
		} else if (item.value === 'worktree:post_creation') {
			const hook = worktreeHooks.post_creation;
			setCurrentCommand(hook?.command || '');
			setCurrentEnabled(hook?.enabled ?? true);
			setCurrentHookType('post_creation');
			setView('edit');
		}
	};

	const handleCommandSubmit = (value: string) => {
		setWorktreeHooks(prev => ({
			...prev,
			[currentHookType]: {
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
		const isPreCreation = currentHookType === 'pre_creation';
		const hookTypeLabel = isPreCreation ? 'Pre' : 'Post';
		const timingLabel = isPreCreation ? 'before' : 'after';

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Configure {hookTypeLabel} Worktree Creation Hook
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Command to execute {timingLabel} creating a new worktree:</Text>
				</Box>

				{isPreCreation && (
					<Box marginBottom={1}>
						<Text color="yellow">
							Note: Runs in git root directory. Failures abort worktree
							creation.
						</Text>
					</Box>
				)}

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
						Environment variables available: CCMANAGER_WORKTREE_PATH,
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

	const scopeLabel = scope === 'project' ? 'Project' : 'Global';

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Worktree Hooks ({scopeLabel})
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
