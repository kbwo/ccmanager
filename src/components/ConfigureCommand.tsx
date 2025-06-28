import React, {useState} from 'react';
import {Box, Text, useInput, Key} from 'ink';
import TextInput from 'ink-text-input';
import {configurationManager} from '../services/configurationManager.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {CommandPreset} from '../types/index.js';

interface ConfigureCommandProps {
	onComplete: () => void;
}

type ViewMode = 'list' | 'edit' | 'add' | 'delete-confirm';
type EditField = 'name' | 'command' | 'args' | 'fallbackArgs';

const ConfigureCommand: React.FC<ConfigureCommandProps> = ({onComplete}) => {
	const presetsConfig = configurationManager.getCommandPresets();
	const [presets, setPresets] = useState(presetsConfig.presets);
	const [defaultPresetId, setDefaultPresetId] = useState(
		presetsConfig.defaultPresetId,
	);
	const [viewMode, setViewMode] = useState<ViewMode>('list');
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [editField, setEditField] = useState<EditField | null>(null);
	const [inputValue, setInputValue] = useState('');
	const [newPreset, setNewPreset] = useState<Partial<CommandPreset>>({});
	const [addStep, setAddStep] = useState<
		'name' | 'command' | 'args' | 'fallbackArgs'
	>('name');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleListNavigation = (key: Key) => {
		const totalItems = presets.length + 2; // presets + "Add New Preset" + "Exit"

		if (key.upArrow) {
			setSelectedIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
		} else if (key.downArrow) {
			setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
		}
	};

	const handleListSelection = () => {
		if (selectedIndex < presets.length) {
			// Selected a preset
			const preset = presets[selectedIndex];
			if (preset) {
				setSelectedPresetId(preset.id);
				setViewMode('edit');
				setSelectedIndex(0);
			}
		} else if (selectedIndex === presets.length) {
			// Add New Preset
			setViewMode('add');
			setNewPreset({});
			setAddStep('name');
			setInputValue('');
		} else {
			// Exit
			onComplete();
		}
	};

	const handleEditNavigation = (key: Key) => {
		const menuItems = 7; // name, command, args, fallbackArgs, set default, delete, back

		if (key.upArrow) {
			setSelectedIndex(prev => (prev > 0 ? prev - 1 : menuItems - 1));
		} else if (key.downArrow) {
			setSelectedIndex(prev => (prev < menuItems - 1 ? prev + 1 : 0));
		}
	};

	const handleEditSelection = () => {
		const preset = presets.find(p => p.id === selectedPresetId);
		if (!preset) return;

		switch (selectedIndex) {
			case 0: // Name
				setEditField('name');
				setInputValue(preset.name);
				break;
			case 1: // Command
				setEditField('command');
				setInputValue(preset.command);
				break;
			case 2: // Args
				setEditField('args');
				setInputValue(preset.args?.join(' ') || '');
				break;
			case 3: // Fallback Args
				setEditField('fallbackArgs');
				setInputValue(preset.fallbackArgs?.join(' ') || '');
				break;
			case 4: // Set as Default
				setDefaultPresetId(preset.id);
				configurationManager.setDefaultPreset(preset.id);
				break;
			case 5: // Delete
				if (presets.length > 1) {
					setViewMode('delete-confirm');
					setSelectedIndex(0);
				}
				break;
			case 6: // Back
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
				const id = Date.now().toString();
				const completePreset: CommandPreset = {
					id,
					name: newPreset.name || 'New Preset',
					command: newPreset.command || 'claude',
					args: newPreset.args,
					fallbackArgs,
				};

				const updatedPresets = [...presets, completePreset];
				setPresets(updatedPresets);
				configurationManager.addPreset(completePreset);

				setViewMode('list');
				setSelectedIndex(updatedPresets.length - 1);
				break;
			}
		}
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
			setSelectedIndex(5); // Back to delete option
		}
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			if (editField) {
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
				setSelectedIndex(5);
			} else {
				onComplete();
			}
			return;
		}

		if (editField || (viewMode === 'add' && inputValue !== undefined)) {
			// In input mode, let TextInput handle it
			return;
		}

		if (viewMode === 'list') {
			handleListNavigation(key);
			if (key.return) {
				handleListSelection();
			}
		} else if (viewMode === 'edit') {
			handleEditNavigation(key);
			if (key.return) {
				handleEditSelection();
			}
		} else if (viewMode === 'delete-confirm') {
			if (key.upArrow || key.downArrow) {
				setSelectedIndex(prev => (prev === 0 ? 1 : 0));
			} else if (key.return) {
				handleDeleteConfirm();
			}
		}
	});

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
					<Text>{titles[editField]}</Text>
				</Box>

				{errorMessage && (
					<Box marginBottom={1}>
						<Text color="red">{errorMessage}</Text>
					</Box>
				)}

				<Box>
					<TextInput
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
					<Text>{titles[addStep]}</Text>
				</Box>

				{errorMessage && (
					<Box marginBottom={1}>
						<Text color="red">{errorMessage}</Text>
					</Box>
				)}

				<Box>
					<TextInput
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

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="red">
						Confirm Delete
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Delete preset &quot;{preset?.name}&quot;?</Text>
				</Box>

				<Box flexDirection="column">
					<Box>
						<Text color={selectedIndex === 0 ? 'red' : undefined}>
							{selectedIndex === 0 ? '> ' : '  '}Yes, delete
						</Text>
					</Box>
					<Box>
						<Text color={selectedIndex === 1 ? 'cyan' : undefined}>
							{selectedIndex === 1 ? '> ' : '  '}Cancel
						</Text>
					</Box>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Press ↑↓ to navigate, Enter to confirm</Text>
				</Box>
			</Box>
		);
	}

	// Render edit preset view
	if (viewMode === 'edit') {
		const preset = presets.find(p => p.id === selectedPresetId);
		if (!preset) return null;

		const isDefault = preset.id === defaultPresetId;
		const canDelete = presets.length > 1;

		const menuItems = [
			{label: 'Name', value: preset.name},
			{label: 'Command', value: preset.command},
			{label: 'Arguments', value: preset.args?.join(' ') || '(none)'},
			{
				label: 'Fallback Arguments',
				value: preset.fallbackArgs?.join(' ') || '(none)',
			},
			{
				label: isDefault ? 'Already Default' : 'Set as Default',
				value: '',
				isButton: true,
				disabled: isDefault,
			},
			{
				label: canDelete
					? 'Delete Preset'
					: 'Delete Preset (cannot delete last preset)',
				value: '',
				isButton: true,
				disabled: !canDelete,
			},
			{label: 'Back to List', value: '', isButton: true, disabled: false},
		];

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

				<Box flexDirection="column">
					{menuItems.map((item, index) => {
						const isSelected = selectedIndex === index;
						const color = item.disabled
							? 'gray'
							: isSelected
								? 'cyan'
								: undefined;

						return (
							<Box key={index} marginTop={item.isButton && index > 0 ? 1 : 0}>
								<Text color={color}>
									{isSelected ? '> ' : '  '}
									{item.isButton ? (
										<Text
											bold={isSelected && !item.disabled}
											dimColor={item.disabled}
										>
											{item.label}
										</Text>
									) : (
										`${item.label}: ${item.value}`
									)}
								</Text>
							</Box>
						);
					})}
				</Box>

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
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Command Presets
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Configure command presets for running code sessions
				</Text>
			</Box>

			<Box flexDirection="column">
				{presets.map((preset, index) => {
					const isSelected = selectedIndex === index;
					const isDefault = preset.id === defaultPresetId;
					const args = preset.args?.join(' ') || '';
					const fallback = preset.fallbackArgs?.join(' ') || '';

					return (
						<Box key={preset.id} marginBottom={1}>
							<Text color={isSelected ? 'cyan' : undefined}>
								{isSelected ? '> ' : '  '}
								{preset.name}
								{isDefault && ' (default)'}
								{'\n'}
								{'    '}Command: {preset.command}
								{args && `\n    Args: ${args}`}
								{fallback && `\n    Fallback: ${fallback}`}
							</Text>
						</Box>
					);
				})}

				<Box marginTop={1}>
					<Text color={selectedIndex === presets.length ? 'cyan' : undefined}>
						{selectedIndex === presets.length ? '> ' : '  '}
						<Text bold>➕ Add New Preset</Text>
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text
						color={selectedIndex === presets.length + 1 ? 'cyan' : undefined}
					>
						{selectedIndex === presets.length + 1 ? '> ' : '  '}
						<Text bold>❌ Exit</Text>
					</Text>
				</Box>
			</Box>

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
