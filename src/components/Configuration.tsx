import React, {useState} from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import ConfigureShortcuts from './ConfigureShortcuts.js';
import ConfigureHooks from './ConfigureHooks.js';
import ConfigureWorktree from './ConfigureWorktree.js';

interface ConfigurationProps {
	onComplete: () => void;
}

type ConfigView = 'menu' | 'shortcuts' | 'hooks' | 'worktree';

interface MenuItem {
	label: string;
	value: string;
}

const Configuration: React.FC<ConfigurationProps> = ({onComplete}) => {
	const [view, setView] = useState<ConfigView>('menu');

	const menuItems: MenuItem[] = [
		{
			label: '⌨  Configure Shortcuts',
			value: 'shortcuts',
		},
		{
			label: '🔧  Configure Status Hooks',
			value: 'hooks',
		},
		{
			label: '📁  Configure Worktree Settings',
			value: 'worktree',
		},
		{
			label: '← Back to Main Menu',
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
		}
	};

	const handleSubMenuComplete = () => {
		setView('menu');
	};

	if (view === 'shortcuts') {
		return <ConfigureShortcuts onComplete={handleSubMenuComplete} />;
	}

	if (view === 'hooks') {
		return <ConfigureHooks onComplete={handleSubMenuComplete} />;
	}

	if (view === 'worktree') {
		return <ConfigureWorktree onComplete={handleSubMenuComplete} />;
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
