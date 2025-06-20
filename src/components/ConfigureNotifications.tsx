import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import {useInput} from 'ink';
import {shortcutManager} from '../services/shortcutManager.js';
import {configurationManager} from '../services/configurationManager.js';
import type {NotificationConfig} from '../types/index.js';

interface ConfigureNotificationsProps {
	onBack: () => void;
}

export const ConfigureNotifications: React.FC<ConfigureNotificationsProps> = ({
	onBack,
}) => {
	const [config, setConfig] = useState<NotificationConfig>({
		enabled: false,
		onIdle: false,
		onWaitingInput: false,
		onBusy: false,
	});
	const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
		'idle',
	);

	useEffect(() => {
		const conf = configurationManager.getConfiguration();
		setConfig(
			conf.notifications || {
				enabled: false,
				onIdle: false,
				onWaitingInput: false,
				onBusy: false,
			},
		);
	}, []);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('returnToMenu', input, key)) {
			onBack();
		}
	});

	const handleSave = () => {
		setSaveStatus('saving');
		const currentConfig = configurationManager.getConfiguration();
		configurationManager.setConfiguration({
			...currentConfig,
			notifications: config,
		});
		setSaveStatus('saved');
		setTimeout(() => setSaveStatus('idle'), 2000);
	};

	const toggleOption = (option: keyof NotificationConfig) => {
		setConfig(prev => ({
			...prev,
			[option]: !prev[option],
		}));
	};

	const items = [
		{
			label: `Enable Notifications: ${config.enabled ? '✓' : '✗'}`,
			value: 'enabled',
		},
		{
			label: `Beep on Idle: ${config.onIdle ? '✓' : '✗'}`,
			value: 'onIdle',
		},
		{
			label: `Beep on Waiting for Input: ${config.onWaitingInput ? '✓' : '✗'}`,
			value: 'onWaitingInput',
		},
		{
			label: `Beep on Busy: ${config.onBusy ? '✓' : '✗'}`,
			value: 'onBusy',
		},
		{
			label: 'Save',
			value: 'save',
		},
	];

	const handleSelect = (item: {value: string}) => {
		if (item.value === 'save') {
			handleSave();
		} else {
			toggleOption(item.value as keyof NotificationConfig);
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Notifications
				</Text>
			</Box>

			<Box flexDirection="column">
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>

			{saveStatus === 'saving' && (
				<Box marginTop={1}>
					<Text color="yellow">Saving...</Text>
				</Box>
			)}

			{saveStatus === 'saved' && (
				<Box marginTop={1}>
					<Text color="green">✓ Settings saved successfully</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>
					Press {shortcutManager.getShortcutDisplay('returnToMenu')} to go back
				</Text>
			</Box>
		</Box>
	);
};
