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

	const selectItems = presets.map((preset, index) => {
		const isDefault = preset.id === defaultPresetId;
		const args = preset.args?.join(' ') || '';
		const fallback = preset.fallbackArgs?.join(' ') || '';
		const numberPrefix = index < 9 ? `[${index + 1}] ` : '';
		let label = numberPrefix + preset.name;
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
			return;
		}

		// Number keys 1-9: immediate launch
		if (/^[1-9]$/.test(input)) {
			const idx = parseInt(input) - 1;
			if (idx < presets.length && presets[idx]) {
				onSelect(presets[idx]!.id);
			}
			return;
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
					↑↓ Navigate 1-9 Quick Select Enter Select ESC Cancel
				</Text>
			</Box>
		</Box>
	);
};

export default PresetSelector;
