import React from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {RemoteBranchMatch} from '../types/index.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface RemoteBranchSelectorProps {
	branchName: string;
	matches: RemoteBranchMatch[];
	onSelect: (selectedRemoteRef: string) => void;
	onCancel: () => void;
}

const RemoteBranchSelector: React.FC<RemoteBranchSelectorProps> = ({
	branchName,
	matches,
	onSelect,
	onCancel,
}) => {
	const selectItems = matches.map(match => ({
		label: `${match.fullRef} (from ${match.remote})`,
		value: match.fullRef,
	}));

	// Add cancel option
	selectItems.push({label: '← Cancel', value: 'cancel'});

	const handleSelectItem = (item: {label: string; value: string}) => {
		if (item.value === 'cancel') {
			onCancel();
		} else {
			onSelect(item.value);
		}
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="yellow">
					⚠️ Ambiguous Branch Reference
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>
					Branch <Text color="cyan">&apos;{branchName}&apos;</Text> exists in
					multiple remotes.
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Please select which remote branch you want to use as the base:
				</Text>
			</Box>

			<SelectInput
				items={selectItems}
				onSelect={handleSelectItem}
				initialIndex={0}
			/>

			<Box marginTop={1}>
				<Text dimColor>
					Press ↑↓ to navigate, Enter to select,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default RemoteBranchSelector;
