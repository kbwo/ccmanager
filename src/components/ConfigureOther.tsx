import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {configurationManager} from '../services/configurationManager.js';
import {shortcutManager} from '../services/shortcutManager.js';
import ConfigureCustomCommand from './ConfigureCustomCommand.js';
import ConfigureTimeout from './ConfigureTimeout.js';
import CustomCommandSummary from './CustomCommandSummary.js';

interface ConfigureOtherProps {
	onComplete: () => void;
}

interface MenuItem {
	label: string;
	value: string;
}

type OtherView = 'main' | 'customCommand' | 'timeout';

const ConfigureOther: React.FC<ConfigureOtherProps> = ({onComplete}) => {
	const autoApprovalConfig = configurationManager.getAutoApprovalConfig();
	const [view, setView] = useState<OtherView>('main');
	const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(
		autoApprovalConfig.enabled,
	);
	const [customCommand, setCustomCommand] = useState(
		autoApprovalConfig.customCommand ?? '',
	);
	const [customCommandDraft, setCustomCommandDraft] = useState(customCommand);
	const [timeout, setTimeout] = useState(autoApprovalConfig.timeout ?? 30);
	const [timeoutDraft, setTimeoutDraft] = useState(timeout);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			if (view === 'customCommand') {
				setCustomCommandDraft(customCommand);
				setView('main');
				return;
			}
			if (view === 'timeout') {
				setTimeoutDraft(timeout);
				setView('main');
				return;
			}
			onComplete();
		}
	});

	const menuItems: MenuItem[] = [
		{
			label: `Auto Approval (experimental): ${autoApprovalEnabled ? '✅ Enabled' : '❌ Disabled'}`,
			value: 'toggleAutoApproval',
		},
		{
			label: '✏️  Edit Custom Command',
			value: 'customCommand',
		},
		{
			label: `⏱️  Set Timeout (${timeout}s)`,
			value: 'timeout',
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
			case 'customCommand':
				setCustomCommandDraft(customCommand);
				setView('customCommand');
				break;
			case 'timeout':
				setTimeoutDraft(timeout);
				setView('timeout');
				break;
			case 'save':
				configurationManager.setAutoApprovalConfig({
					enabled: autoApprovalEnabled,
					customCommand: customCommand.trim() || undefined,
					timeout,
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

	if (view === 'customCommand') {
		return (
			<ConfigureCustomCommand
				value={customCommandDraft}
				onChange={setCustomCommandDraft}
				onCancel={() => {
					setCustomCommandDraft(customCommand);
					setView('main');
				}}
				onSubmit={value => {
					setCustomCommand(value);
					setView('main');
				}}
			/>
		);
	}

	if (view === 'timeout') {
		return (
			<ConfigureTimeout
				value={timeoutDraft}
				onChange={setTimeoutDraft}
				onCancel={() => {
					setTimeoutDraft(timeout);
					setView('main');
				}}
				onSubmit={value => {
					setTimeout(value);
					setView('main');
				}}
			/>
		);
	}

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

			<CustomCommandSummary command={customCommand} />

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
