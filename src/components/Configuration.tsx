import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import ConfigureShortcuts from './ConfigureShortcuts.js';
import ConfigureHooks from './ConfigureHooks.js';
import ConfigureWorktree from './ConfigureWorktree.js';
import ConfigureCommand from './ConfigureCommand.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface ConfigurationProps {
	onComplete: () => void;
}

type ConfigView = 'menu' | 'shortcuts' | 'hooks' | 'worktree' | 'command';

interface MenuItem {
	label: string;
	value: string;
}

const Configuration: React.FC<ConfigurationProps> = ({onComplete}) => {
	const [view, setView] = useState<ConfigView>('menu');

	const menuItems: MenuItem[] = [
		{
			label: 'S ⌨  Configure Shortcuts',
			value: 'shortcuts',
		},
		{
			label: 'H 🔧  Configure Status Hooks',
			value: 'hooks',
		},
		{
			label: 'W 📁  Configure Worktree Settings',
			value: 'worktree',
		},
		{
			label: 'C 🚀  Configure Command',
			value: 'command',
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
		} else if (item.value === 'hooks') {
			setView('hooks');
		} else if (item.value === 'worktree') {
			setView('worktree');
		} else if (item.value === 'command') {
			setView('command');
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
				setView('hooks');
				break;
			case 'w':
				setView('worktree');
				break;
			case 'c':
				setView('command');
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

	if (view === 'hooks') {
		return <ConfigureHooks onComplete={handleSubMenuComplete} />;
	}

	if (view === 'worktree') {
		return <ConfigureWorktree onComplete={handleSubMenuComplete} />;
	}

	if (view === 'command') {
		return <ConfigureCommand onComplete={handleSubMenuComplete} />;
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configuration
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select a configuration option:</Text>
			</Box>

			<SelectInput items={menuItems} onSelect={handleSelect} isFocused={true} />
		</Box>
	);
};

export default Configuration;
