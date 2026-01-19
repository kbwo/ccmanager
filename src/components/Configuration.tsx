import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import ConfigureShortcuts from './ConfigureShortcuts.js';
import ConfigureStatusHooks from './ConfigureStatusHooks.js';
import ConfigureWorktreeHooks from './ConfigureWorktreeHooks.js';
import ConfigureWorktree from './ConfigureWorktree.js';
import ConfigureCommand from './ConfigureCommand.js';
import ConfigureOther from './ConfigureOther.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {ConfigScope} from '../types/index.js';
import {ConfigEditorProvider} from '../contexts/ConfigEditorContext.js';

interface ConfigurationProps {
	scope: ConfigScope;
	onComplete: () => void;
}

type ConfigView =
	| 'menu'
	| 'shortcuts'
	| 'statusHooks'
	| 'worktreeHooks'
	| 'worktree'
	| 'presets'
	| 'other';

interface MenuItem {
	label: string;
	value: string;
}

const ConfigurationContent: React.FC<{
	scope: ConfigScope;
	onComplete: () => void;
}> = ({scope, onComplete}) => {
	const [view, setView] = useState<ConfigView>('menu');

	const title =
		scope === 'project' ? 'Project Configuration' : 'Global Configuration';

	const menuItems: MenuItem[] = [
		{
			label: 'S ⌨  Configure Shortcuts',
			value: 'shortcuts',
		},
		{
			label: 'H 🔧  Configure Status Hooks',
			value: 'statusHooks',
		},
		{
			label: 'T 🔨  Configure Worktree Hooks',
			value: 'worktreeHooks',
		},
		{
			label: 'W 📁  Configure Worktree Settings',
			value: 'worktree',
		},
		{
			label: 'C 🚀  Configure Command Presets',
			value: 'presets',
		},
		{
			label: 'O 🧪  Other & Experimental',
			value: 'other',
		},
		{
			label: 'B ← Back to Main Menu',
			value: 'back',
		},
	];

	const handleSelect = (item: MenuItem) => {
		if (item.value === 'back') {
			onComplete();
		} else if (item.value === 'shortcuts') {
			setView('shortcuts');
		} else if (item.value === 'statusHooks') {
			setView('statusHooks');
		} else if (item.value === 'worktreeHooks') {
			setView('worktreeHooks');
		} else if (item.value === 'worktree') {
			setView('worktree');
		} else if (item.value === 'presets') {
			setView('presets');
		} else if (item.value === 'other') {
			setView('other');
		}
	};

	const handleSubMenuComplete = () => {
		setView('menu');
	};

	// Handle hotkeys (only when in menu view)
	useInput((input, key) => {
		if (view !== 'menu') return; // Only handle hotkeys in menu view

		const keyPressed = input.toLowerCase();

		switch (keyPressed) {
			case 's':
				setView('shortcuts');
				break;
			case 'h':
				setView('statusHooks');
				break;
			case 't':
				setView('worktreeHooks');
				break;
			case 'w':
				setView('worktree');
				break;
			case 'c':
				setView('presets');
				break;
			case 'o':
				setView('other');
				break;
			case 'b':
				onComplete();
				break;
		}

		// Handle escape key
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onComplete();
		}
	});

	if (view === 'shortcuts') {
		return <ConfigureShortcuts onComplete={handleSubMenuComplete} />;
	}

	if (view === 'statusHooks') {
		return <ConfigureStatusHooks onComplete={handleSubMenuComplete} />;
	}

	if (view === 'worktreeHooks') {
		return <ConfigureWorktreeHooks onComplete={handleSubMenuComplete} />;
	}

	if (view === 'worktree') {
		return <ConfigureWorktree onComplete={handleSubMenuComplete} />;
	}

	if (view === 'presets') {
		return <ConfigureCommand onComplete={handleSubMenuComplete} />;
	}

	if (view === 'other') {
		return <ConfigureOther onComplete={handleSubMenuComplete} />;
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					{title}
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select a configuration option:</Text>
			</Box>

			<SelectInput
				items={menuItems}
				onSelect={handleSelect}
				isFocused={true}
				limit={10}
			/>
		</Box>
	);
};

const Configuration: React.FC<ConfigurationProps> = ({scope, onComplete}) => (
	<ConfigEditorProvider scope={scope}>
		<ConfigurationContent scope={scope} onComplete={onComplete} />
	</ConfigEditorProvider>
);

export default Configuration;
