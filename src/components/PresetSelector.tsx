import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {configReader} from '../services/config/configReader.js';

interface PresetSelectorProps {
	onSelect: (presetId: string) => void;
	onCancel: () => void;
}

const PresetSelector: React.FC<PresetSelectorProps> = ({
	onSelect,
	onCancel,
}) => {
	const presetsConfig = configReader.getCommandPresets();
	const [presets] = useState(presetsConfig.presets);
	const defaultPresetId = presetsConfig.defaultPresetId;

	const selectItems = presets.map(preset => {
		const isDefault = preset.id === defaultPresetId;
		const args = preset.args?.join(' ') || '';
		const fallback = preset.fallbackArgs?.join(' ') || '';
		let label = preset.name;
		if (isDefault) label += ' (default)';
		label += `\n    Command: ${preset.command}`;
		if (args) label += `\n    Args: ${args}`;
		if (fallback) label += `\n    Fallback: ${fallback}`;
		return {
			label,
			value: preset.id,
		};
	});

	// Add cancel option
	selectItems.push({label: '← Cancel', value: 'cancel'});

	const handleSelectItem = (item: {label: string; value: string}) => {
		if (item.value === 'cancel') {
			onCancel();
		} else {
			onSelect(item.value);
		}
	};

	// Find initial index based on default preset
	const initialIndex = selectItems.findIndex(
		item => item.value === defaultPresetId,
	);

	useInput((input, key) => {
		if (key.escape) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Select Command Preset
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Choose a preset to start the session with</Text>
			</Box>

			<SelectInput
				items={selectItems}
				onSelect={handleSelectItem}
				initialIndex={initialIndex >= 0 ? initialIndex : 0}
			/>

			<Box marginTop={1}>
				<Text dimColor>
					Press ↑↓ to navigate, Enter to select, ESC to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default PresetSelector;
