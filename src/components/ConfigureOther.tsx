import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {configurationManager} from '../services/configurationManager.js';
import {shortcutManager} from '../services/shortcutManager.js';
import TextInputWrapper from './TextInputWrapper.js';

interface ConfigureOtherProps {
	onComplete: () => void;
}

interface MenuItem {
	label: string;
	value: string;
}

const ConfigureOther: React.FC<ConfigureOtherProps> = ({onComplete}) => {
	const autoApprovalConfig = configurationManager.getAutoApprovalConfig();
	const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(
		autoApprovalConfig.enabled,
	);
	const [customCommand, setCustomCommand] = useState(
		autoApprovalConfig.customCommand ?? '',
	);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onComplete();
		}
	});

	const menuItems: MenuItem[] = [
		{
			label: `Auto Approval (experimental): ${autoApprovalEnabled ? '✅ Enabled' : '❌ Disabled'}`,
			value: 'toggleAutoApproval',
		},
		{
			label: '💾 Save Changes',
			value: 'save',
		},
		{
			label: '← Cancel',
			value: 'cancel',
		},
	];

	const handleSelect = (item: MenuItem) => {
		switch (item.value) {
			case 'toggleAutoApproval':
				setAutoApprovalEnabled(!autoApprovalEnabled);
				break;
			case 'save':
				configurationManager.setAutoApprovalConfig({
					enabled: autoApprovalEnabled,
					customCommand: customCommand.trim() || undefined,
				});
				onComplete();
				break;
			case 'cancel':
				onComplete();
				break;
			default:
				break;
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Other & Experimental Settings
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Toggle experimental capabilities and other miscellaneous options.
				</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text>
					Custom auto-approval command (outputs {'{needsPermission:boolean}'}):
				</Text>
				<TextInputWrapper
					value={customCommand}
					onChange={setCustomCommand}
					placeholder={`e.g. jq -n '{"needsPermission":true}'`}
				/>
				<Text dimColor>Env provided: $DEFAULT_PROMPT, $TERMINAL_OUTPUT</Text>
			</Box>

			<SelectInput items={menuItems} onSelect={handleSelect} isFocused />

			<Box marginTop={1}>
				<Text dimColor>
					Press {shortcutManager.getShortcutDisplay('cancel')} to return without
					saving
				</Text>
			</Box>
		</Box>
	);
};

export default ConfigureOther;
