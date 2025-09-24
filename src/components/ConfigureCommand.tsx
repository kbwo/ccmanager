import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {configurationManager} from '../services/configurationManager.js';
import {shortcutManager} from '../services/shortcutManager.js';
import Confirmation from './Confirmation.js';
import {CommandPreset, StateDetectionStrategy} from '../types/index.js';

// Helper type to create a record that requires all strategies
type AllStrategiesRecord = Record<
	StateDetectionStrategy,
	{label: string; value: StateDetectionStrategy}
>;

// This function ensures all strategies are included at compile time
const createStrategyItems = (): {
	label: string;
	value: StateDetectionStrategy;
}[] => {
	// This object MUST include all StateDetectionStrategy values as keys
	// If any are missing, TypeScript will error
	const strategies: AllStrategiesRecord = {
		claude: {label: 'Claude', value: 'claude'},
		gemini: {label: 'Gemini', value: 'gemini'},
		codex: {label: 'Codex', value: 'codex'},
		cursor: {label: 'Cursor Agent', value: 'cursor'},
	};

	return Object.values(strategies);
};

// Type-safe strategy items that ensures all StateDetectionStrategy values are included
const ALL_STRATEGY_ITEMS = createStrategyItems();

interface ConfigureCommandProps {
	onComplete: () => void;
}

type ViewMode = 'list' | 'edit' | 'add' | 'delete-confirm';
type EditField =
	| 'name'
	| 'command'
	| 'args'
	| 'fallbackArgs'
	| 'detectionStrategy';

const formatDetectionStrategy = (strategy: string | undefined): string => {
	const value = strategy || 'claude';
	switch (value) {
		case 'gemini':
			return 'Gemini';
		case 'codex':
			return 'Codex';
		case 'cursor':
			return 'Cursor';
		default:
			return 'Claude';
	}
};

const ConfigureCommand: React.FC<ConfigureCommandProps> = ({onComplete}) => {
	const presetsConfig = configurationManager.getCommandPresets();
	const [presets, setPresets] = useState(presetsConfig.presets);
	const [defaultPresetId, setDefaultPresetId] = useState(
		presetsConfig.defaultPresetId,
	);
	const [selectPresetOnStart, setSelectPresetOnStart] = useState(
		configurationManager.getSelectPresetOnStart(),
	);
	const [viewMode, setViewMode] = useState<ViewMode>('list');
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [editField, setEditField] = useState<EditField | null>(null);
	const [inputValue, setInputValue] = useState('');
	const [isSelectingStrategy, setIsSelectingStrategy] = useState(false);
	const [isSelectingStrategyInAdd, setIsSelectingStrategyInAdd] =
		useState(false);
	const [newPreset, setNewPreset] = useState<Partial<CommandPreset>>({});
	const [addStep, setAddStep] = useState<
		'name' | 'command' | 'args' | 'fallbackArgs' | 'detectionStrategy'
	>('name');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Remove handleListNavigation as SelectInput handles navigation internally

	// Remove handleListSelection as we now use handleSelectItem

	const handleEditMenuSelect = (item: {label: string; value: string}) => {
		// Ignore separator selections
		if (item.value.startsWith('separator')) {
			return;
		}

		const preset = presets.find(p => p.id === selectedPresetId);
		if (!preset) return;

		switch (item.value) {
			case 'name':
				setEditField('name');
				setInputValue(preset.name);
				break;
			case 'command':
				setEditField('command');
				setInputValue(preset.command);
				break;
			case 'args':
				setEditField('args');
				setInputValue(preset.args?.join(' ') || '');
				break;
			case 'fallbackArgs':
				setEditField('fallbackArgs');
				setInputValue(preset.fallbackArgs?.join(' ') || '');
				break;
			case 'detectionStrategy':
				setIsSelectingStrategy(true);
				break;
			case 'setDefault':
				setDefaultPresetId(preset.id);
				configurationManager.setDefaultPreset(preset.id);
				break;
			case 'delete':
				if (presets.length > 1) {
					setViewMode('delete-confirm');
					setSelectedIndex(0);
				}
				break;
			case 'back':
				setViewMode('list');
				setSelectedIndex(presets.findIndex(p => p.id === selectedPresetId));
				break;
		}
	};

	const handleFieldUpdate = (value: string) => {
		const preset = presets.find(p => p.id === selectedPresetId);
		if (!preset || !editField) return;

		const updatedPreset = {...preset};

		switch (editField) {
			case 'name':
				// Prevent using "Default" as a name to avoid confusion
				if (value.trim().toLowerCase() === 'default') {
					setErrorMessage(
						'Cannot use "Default" as a preset name. Please choose a different name.',
					);
					return;
				}
				updatedPreset.name = value;
				break;
			case 'command':
				updatedPreset.command = value || 'claude';
				break;
			case 'args':
				updatedPreset.args = value.trim()
					? value.trim().split(/\s+/)
					: undefined;
				break;
			case 'fallbackArgs':
				updatedPreset.fallbackArgs = value.trim()
					? value.trim().split(/\s+/)
					: undefined;
				break;
		}

		const updatedPresets = presets.map(p =>
			p.id === preset.id ? updatedPreset : p,
		);
		setPresets(updatedPresets);
		configurationManager.addPreset(updatedPreset);

		setEditField(null);
		setInputValue('');
		setErrorMessage(null);
	};

	const handleAddPresetInput = (value: string) => {
		switch (addStep) {
			case 'name':
				// Prevent using "Default" as a name to avoid confusion
				if (value.trim().toLowerCase() === 'default') {
					setErrorMessage(
						'Cannot use "Default" as a preset name. Please choose a different name.',
					);
					return;
				}
				setNewPreset({...newPreset, name: value});
				setAddStep('command');
				setInputValue('');
				setErrorMessage(null);
				break;
			case 'command':
				setNewPreset({...newPreset, command: value || 'claude'});
				setAddStep('args');
				setInputValue('');
				break;
			case 'args': {
				const args = value.trim() ? value.trim().split(/\s+/) : undefined;
				setNewPreset({...newPreset, args});
				setAddStep('fallbackArgs');
				setInputValue('');
				break;
			}
			case 'fallbackArgs': {
				const fallbackArgs = value.trim()
					? value.trim().split(/\s+/)
					: undefined;
				setNewPreset({...newPreset, fallbackArgs});
				setAddStep('detectionStrategy');
				setIsSelectingStrategyInAdd(true);
				break;
			}
		}
	};

	const handleStrategySelect = (item: {label: string; value: string}) => {
		const preset = presets.find(p => p.id === selectedPresetId);
		if (!preset) return;

		const updatedPreset = {...preset};
		updatedPreset.detectionStrategy = item.value as 'claude' | 'gemini';

		const updatedPresets = presets.map(p =>
			p.id === preset.id ? updatedPreset : p,
		);
		setPresets(updatedPresets);
		configurationManager.addPreset(updatedPreset);

		setIsSelectingStrategy(false);
	};

	const handleAddStrategySelect = (item: {label: string; value: string}) => {
		const id = Date.now().toString();
		const completePreset: CommandPreset = {
			id,
			name: newPreset.name || 'New Preset',
			command: newPreset.command || 'claude',
			args: newPreset.args,
			fallbackArgs: newPreset.fallbackArgs,
			detectionStrategy: item.value as 'claude' | 'gemini',
		};

		const updatedPresets = [...presets, completePreset];
		setPresets(updatedPresets);
		configurationManager.addPreset(completePreset);

		setViewMode('list');
		setSelectedIndex(updatedPresets.length - 1);
		setNewPreset({});
		setAddStep('name');
		setInputValue('');
		setIsSelectingStrategyInAdd(false);
		setErrorMessage(null);
	};

	const handleDeleteConfirm = () => {
		if (selectedIndex === 0) {
			// Yes, delete
			const newPresets = presets.filter(p => p.id !== selectedPresetId);
			setPresets(newPresets);

			// Update default if needed
			if (defaultPresetId === selectedPresetId && newPresets.length > 0) {
				const firstPreset = newPresets[0];
				if (firstPreset) {
					setDefaultPresetId(firstPreset.id);
					configurationManager.setDefaultPreset(firstPreset.id);
				}
			}

			configurationManager.deletePreset(selectedPresetId!);

			setViewMode('list');
			setSelectedIndex(0);
		} else {
			// Cancel
			setViewMode('edit');
			setSelectedIndex(6); // Back to delete option (index updated for new field)
		}
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			if (isSelectingStrategy) {
				setIsSelectingStrategy(false);
			} else if (isSelectingStrategyInAdd) {
				setIsSelectingStrategyInAdd(false);
				setViewMode('list');
				setAddStep('name');
				setNewPreset({});
			} else if (editField) {
				setEditField(null);
				setInputValue('');
				setErrorMessage(null);
			} else if (viewMode === 'edit') {
				setViewMode('list');
				setSelectedIndex(presets.findIndex(p => p.id === selectedPresetId));
				setErrorMessage(null);
			} else if (viewMode === 'add') {
				setViewMode('list');
				setSelectedIndex(presets.length);
				setErrorMessage(null);
			} else if (viewMode === 'delete-confirm') {
				setViewMode('edit');
				setSelectedIndex(6); // Updated index for delete option
			} else {
				onComplete();
			}
			return;
		}

		if (
			editField ||
			(viewMode === 'add' &&
				inputValue !== undefined &&
				!isSelectingStrategyInAdd) ||
			isSelectingStrategy ||
			isSelectingStrategyInAdd
		) {
			// In input mode, let TextInput or SelectInput handle it
			return;
		}

		if (
			viewMode === 'list' ||
			viewMode === 'edit' ||
			viewMode === 'delete-confirm'
		) {
			// SelectInput handles navigation and selection
			return;
		}
	});

	// Render strategy selection
	if (isSelectingStrategy) {
		const preset = presets.find(p => p.id === selectedPresetId);
		if (!preset) return null;

		const strategyItems = ALL_STRATEGY_ITEMS;

		const currentStrategy = preset.detectionStrategy || 'claude';
		const initialIndex = strategyItems.findIndex(
			item => item.value === currentStrategy,
		);

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Select Detection Strategy
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Choose the state detection strategy for this preset:</Text>
				</Box>

				<SelectInput
					items={strategyItems}
					onSelect={handleStrategySelect}
					initialIndex={initialIndex}
				/>

				<Box marginTop={1}>
					<Text dimColor>
						Press Enter to select,{' '}
						{shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// Render input field
	if (editField) {
		const titles = {
			name: 'Enter preset name:',
			command: 'Enter command (e.g., claude):',
			args: 'Enter command arguments (space-separated):',
			fallbackArgs: 'Enter fallback arguments (space-separated):',
		};

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Edit Preset
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>{titles[editField as keyof typeof titles]}</Text>
				</Box>

				{errorMessage && (
					<Box marginBottom={1}>
						<Text color="red">{errorMessage}</Text>
					</Box>
				)}

				<Box>
					<TextInputWrapper
						value={inputValue}
						onChange={setInputValue}
						onSubmit={handleFieldUpdate}
						placeholder={
							editField === 'args' || editField === 'fallbackArgs'
								? 'e.g., --resume or leave empty'
								: ''
						}
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

	// Render add preset form
	if (viewMode === 'add') {
		if (isSelectingStrategyInAdd) {
			const strategyItems = ALL_STRATEGY_ITEMS;

			return (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text bold color="green">
							Add New Preset - Detection Strategy
						</Text>
					</Box>

					<Box marginBottom={1}>
						<Text>Choose the state detection strategy for this preset:</Text>
					</Box>

					<SelectInput
						items={strategyItems}
						onSelect={handleAddStrategySelect}
						initialIndex={0}
					/>

					<Box marginTop={1}>
						<Text dimColor>
							Press Enter to select,{' '}
							{shortcutManager.getShortcutDisplay('cancel')} to cancel
						</Text>
					</Box>
				</Box>
			);
		}

		const titles = {
			name: 'Enter preset name:',
			command: 'Enter command (e.g., claude):',
			args: 'Enter command arguments (space-separated):',
			fallbackArgs: 'Enter fallback arguments (space-separated):',
		};

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Add New Preset
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>{titles[addStep as keyof typeof titles]}</Text>
				</Box>

				{errorMessage && (
					<Box marginBottom={1}>
						<Text color="red">{errorMessage}</Text>
					</Box>
				)}

				<Box>
					<TextInputWrapper
						value={inputValue}
						onChange={setInputValue}
						onSubmit={handleAddPresetInput}
						placeholder={
							addStep === 'args' || addStep === 'fallbackArgs'
								? 'e.g., --resume or leave empty'
								: addStep === 'name'
									? 'e.g., Development'
									: ''
						}
					/>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Press Enter to continue,{' '}
						{shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// Render delete confirmation
	if (viewMode === 'delete-confirm') {
		const preset = presets.find(p => p.id === selectedPresetId);

		const handleConfirmSelect = (value: string) => {
			if (value === 'yes') {
				handleDeleteConfirm();
			} else {
				setViewMode('edit');
				setSelectedIndex(6); // Return to delete option in edit menu
			}
		};

		const title = (
			<Text bold color="red">
				Confirm Delete
			</Text>
		);

		const message = <Text>Delete preset &quot;{preset?.name}&quot;?</Text>;

		const hint = (
			<Text dimColor>Press ↑↓/j/k to navigate, Enter to confirm</Text>
		);

		return (
			<Confirmation
				title={title}
				message={message}
				options={[
					{label: 'Yes, delete', value: 'yes', color: 'red'},
					{label: 'Cancel', value: 'cancel', color: 'cyan'},
				]}
				onSelect={handleConfirmSelect}
				initialIndex={1} // Default to Cancel
				indicatorColor="red"
				hint={hint}
			/>
		);
	}

	// Render edit preset view
	if (viewMode === 'edit') {
		const preset = presets.find(p => p.id === selectedPresetId);
		if (!preset) return null;

		const isDefault = preset.id === defaultPresetId;
		const canDelete = presets.length > 1;

		const editMenuItems = [
			{
				label: `Name: ${preset.name}`,
				value: 'name',
			},
			{
				label: `Command: ${preset.command}`,
				value: 'command',
			},
			{
				label: `Arguments: ${preset.args?.join(' ') || '(none)'}`,
				value: 'args',
			},
			{
				label: `Fallback Arguments: ${preset.fallbackArgs?.join(' ') || '(none)'}`,
				value: 'fallbackArgs',
			},
			{
				label: `Detection Strategy: ${formatDetectionStrategy(preset.detectionStrategy)}`,
				value: 'detectionStrategy',
			},
			{label: '─────────────────────────', value: 'separator1'},
			{
				label: isDefault ? '⭐ Already Default' : 'Set as Default',
				value: 'setDefault',
			},
			{
				label: canDelete
					? 'Delete Preset'
					: 'Delete Preset (cannot delete last preset)',
				value: 'delete',
			},
			{label: '─────────────────────────', value: 'separator2'},
			{label: '← Back to List', value: 'back'},
		];

		// Filter out disabled items for SelectInput
		const selectableItems = editMenuItems.filter(item => {
			if (item.value === 'setDefault' && isDefault) return false;
			if (item.value === 'delete' && !canDelete) return false;
			return true;
		});

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Edit Preset: {preset.name}
					</Text>
				</Box>

				{isDefault && (
					<Box marginBottom={1}>
						<Text color="yellow">⭐ This is the default preset</Text>
					</Box>
				)}

				<SelectInput items={selectableItems} onSelect={handleEditMenuSelect} />

				<Box marginTop={1}>
					<Text dimColor>
						Press ↑↓ to navigate, Enter to edit/select,{' '}
						{shortcutManager.getShortcutDisplay('cancel')} to go back
					</Text>
				</Box>
			</Box>
		);
	}

	// Render preset list (default view)
	const selectItems = [
		...presets.map(preset => {
			const isDefault = preset.id === defaultPresetId;
			const args = preset.args?.join(' ') || '';
			const fallback = preset.fallbackArgs?.join(' ') || '';
			let label = preset.name;
			if (isDefault) label += ' (default)';
			label += `\n    Command: ${preset.command}`;
			if (args) label += `\n    Args: ${args}`;
			if (fallback) label += `\n    Fallback: ${fallback}`;
			label += `\n    Detection: ${formatDetectionStrategy(preset.detectionStrategy)}`;
			return {
				label,
				value: preset.id,
			};
		}),
		{label: '─────────────────────────', value: 'separator1'},
		{
			label: `Select preset before session start: ${selectPresetOnStart ? '✅ Enabled' : '❌ Disabled'}`,
			value: 'toggle-select-on-start',
		},
		{label: '─────────────────────────', value: 'separator2'},
		{label: 'Add New Preset', value: 'add'},
		{label: '← Cancel', value: 'exit'},
	];

	const handleSelectItem = (item: {label: string; value: string}) => {
		if (item.value === 'add') {
			// Add New Preset
			setViewMode('add');
			setNewPreset({});
			setAddStep('name');
			setInputValue('');
		} else if (item.value === 'exit') {
			// Exit
			onComplete();
		} else if (item.value === 'toggle-select-on-start') {
			// Toggle select preset on start
			const newValue = !selectPresetOnStart;
			setSelectPresetOnStart(newValue);
			configurationManager.setSelectPresetOnStart(newValue);
		} else if (item.value.startsWith('separator')) {
			// Ignore separator selections
			return;
		} else {
			// Selected a preset
			const preset = presets.find(p => p.id === item.value);
			if (preset) {
				setSelectedPresetId(preset.id);
				setViewMode('edit');
				setSelectedIndex(0);
			}
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Command Command Presets
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Configure command presets for running code sessions
				</Text>
			</Box>

			<SelectInput
				items={selectItems}
				onSelect={handleSelectItem}
				initialIndex={selectedIndex}
			/>

			<Box marginTop={1}>
				<Text dimColor>
					Press ↑↓ to navigate, Enter to select,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} to exit
				</Text>
			</Box>
		</Box>
	);
};

export default ConfigureCommand;
