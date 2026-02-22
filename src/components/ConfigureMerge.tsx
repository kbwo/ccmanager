import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import TextInputWrapper from './TextInputWrapper.js';
import {useConfigEditor} from '../contexts/ConfigEditorContext.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {MergeConfig} from '../types/index.js';

interface ConfigureMergeProps {
	onComplete: () => void;
}

type EditField = 'mergeArgs' | 'rebaseArgs';

const DEFAULT_MERGE_ARGS = ['--no-ff'];
const DEFAULT_REBASE_ARGS: string[] = [];

const ConfigureMerge: React.FC<ConfigureMergeProps> = ({onComplete}) => {
	const configEditor = useConfigEditor();
	const scope = configEditor.getScope();

	const currentConfig: MergeConfig = configEditor.getMergeConfig() || {};
	const [mergeConfig, setMergeConfig] = useState<MergeConfig>(currentConfig);
	const [editField, setEditField] = useState<EditField | null>(null);
	const [inputValue, setInputValue] = useState('');

	const isInheriting =
		scope === 'project' && !configEditor.hasProjectOverride('mergeConfig');

	const getMergeArgs = () => mergeConfig.mergeArgs ?? DEFAULT_MERGE_ARGS;
	const getRebaseArgs = () => mergeConfig.rebaseArgs ?? DEFAULT_REBASE_ARGS;

	const formatArgs = (args: string[]) =>
		args.length > 0 ? args.join(' ') : '(none)';

	const menuItems = [
		{
			label: `Merge Arguments: ${formatArgs(getMergeArgs())}`,
			value: 'mergeArgs',
		},
		{
			label: `Rebase Arguments: ${formatArgs(getRebaseArgs())}`,
			value: 'rebaseArgs',
		},
		{label: '-----', value: 'separator'},
		{label: '<- Back', value: 'back'},
	];

	const handleSelect = (item: {label: string; value: string}) => {
		if (item.value === 'separator') return;
		if (item.value === 'back') {
			onComplete();
			return;
		}

		const field = item.value as EditField;
		setEditField(field);
		switch (field) {
			case 'mergeArgs':
				setInputValue(getMergeArgs().join(' '));
				break;
			case 'rebaseArgs':
				setInputValue(getRebaseArgs().join(' '));
				break;
		}
	};

	const handleFieldUpdate = (value: string) => {
		const args = value.trim() ? value.trim().split(/\s+/) : [];
		const updated = {...mergeConfig, [editField!]: args};
		setMergeConfig(updated);
		configEditor.setMergeConfig(updated);
		setEditField(null);
		setInputValue('');
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			if (editField) {
				setEditField(null);
				setInputValue('');
			} else {
				onComplete();
			}
			return;
		}
	});

	if (editField) {
		const titles: Record<EditField, string> = {
			mergeArgs: 'Enter merge arguments (space-separated, default: --no-ff):',
			rebaseArgs: 'Enter rebase arguments (space-separated, default: none):',
		};

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Edit Merge Config
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>{titles[editField]}</Text>
				</Box>

				<Box>
					<TextInputWrapper
						value={inputValue}
						onChange={setInputValue}
						onSubmit={handleFieldUpdate}
						placeholder="e.g., --no-ff or leave empty"
					/>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Press Enter to save, {shortcutManager.getShortcutDisplay('cancel')}{' '}
						to cancel
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
					Configure Merge/Rebase ({scopeLabel})
				</Text>
			</Box>

			{isInheriting && (
				<Box marginBottom={1}>
					<Text backgroundColor="cyan" color="black">
						{' '}
						Inheriting from global configuration{' '}
					</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>
					Configure arguments for merge and rebase operations
				</Text>
			</Box>

			<SelectInput items={menuItems} onSelect={handleSelect} />

			<Box marginTop={1}>
				<Text dimColor>
					Press Enter to edit, {shortcutManager.getShortcutDisplay('cancel')} to
					go back
				</Text>
			</Box>
		</Box>
	);
};

export default ConfigureMerge;
