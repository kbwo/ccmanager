import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {configurationManager} from '../services/configurationManager.js';
import {StatusHookConfig, SessionState} from '../types/index.js';

interface ConfigureStatusHooksProps {
	onComplete: () => void;
}

type View = 'menu' | 'edit';

interface MenuItem {
	label: string;
	value: string;
}

const STATUS_LABELS: Record<SessionState, string> = {
	idle: 'Idle',
	busy: 'Busy',
	waiting_input: 'Waiting for Input',
};

const ConfigureStatusHooks: React.FC<ConfigureStatusHooksProps> = ({
	onComplete,
}) => {
	const [view, setView] = useState<View>('menu');
	const [selectedStatus, setSelectedStatus] = useState<SessionState>('idle');
	const [statusHooks, setStatusHooks] = useState<StatusHookConfig>({});
	const [currentCommand, setCurrentCommand] = useState('');
	const [currentEnabled, setCurrentEnabled] = useState(false);
	const [showSaveMessage, setShowSaveMessage] = useState(false);

	useEffect(() => {
		setStatusHooks(configurationManager.getStatusHooks());
	}, []);

	useInput((input, key) => {
		if (key.escape) {
			if (view === 'edit') {
				setView('menu');
			} else {
				onComplete();
			}
		} else if (key.tab && view === 'edit') {
			toggleEnabled();
		}
	});

	const getMenuItems = (): MenuItem[] => {
		const items: MenuItem[] = [];

		// Add status hook items
		(['idle', 'busy', 'waiting_input'] as SessionState[]).forEach(status => {
			const hook = statusHooks[status];
			const enabled = hook?.enabled ? '✓' : '✗';
			const command = hook?.command || '(not set)';
			items.push({
				label: `${STATUS_LABELS[status]}: ${enabled} ${command}`,
				value: `status:${status}`,
			});
		});

		items.push({
			label: '',
			value: 'separator',
		});

		items.push({
			label: '💾 Save and Return',
			value: 'save',
		});

		items.push({
			label: '← Cancel',
			value: 'cancel',
		});

		return items;
	};

	const handleMenuSelect = (item: MenuItem) => {
		if (item.value === 'save') {
			configurationManager.setStatusHooks(statusHooks);
			setShowSaveMessage(true);
			setTimeout(() => {
				onComplete();
			}, 1000);
		} else if (item.value === 'cancel') {
			onComplete();
		} else if (
			!item.value.includes('separator') &&
			item.value.startsWith('status:')
		) {
			const status = item.value.split(':')[1] as SessionState;
			setSelectedStatus(status);
			const hook = statusHooks[status];
			setCurrentCommand(hook?.command || '');
			setCurrentEnabled(hook?.enabled ?? true);
			setView('edit');
		}
	};

	const handleCommandSubmit = (value: string) => {
		setStatusHooks(prev => ({
			...prev,
			[selectedStatus]: {
				command: value,
				enabled: currentEnabled,
			},
		}));
		setView('menu');
	};

	const toggleEnabled = () => {
		setCurrentEnabled(prev => !prev);
	};

	if (showSaveMessage) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Configuration saved successfully!</Text>
			</Box>
		);
	}

	if (view === 'edit') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Configure {STATUS_LABELS[selectedStatus]} Hook
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Command to execute when status changes to{' '}
						{STATUS_LABELS[selectedStatus]}:
					</Text>
				</Box>

				<Box marginBottom={1}>
					<TextInputWrapper
						value={currentCommand}
						onChange={setCurrentCommand}
						onSubmit={handleCommandSubmit}
						placeholder="Enter command (e.g., notify-send 'Claude is idle')"
					/>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Enabled: {currentEnabled ? '✓' : '✗'} (Press Tab to toggle)
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Environment variables available: CCMANAGER_OLD_STATE,
						CCMANAGER_NEW_STATE,
					</Text>
				</Box>
				<Box>
					<Text dimColor>
						CCMANAGER_WORKTREE, CCMANAGER_WORKTREE_BRANCH, CCMANAGER_SESSION_ID
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Press Enter to save, Tab to toggle enabled, Esc to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Status Hooks
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Set commands to run when session status changes:</Text>
			</Box>

			<SelectInput
				items={getMenuItems()}
				onSelect={handleMenuSelect}
				isFocused={true}
				limit={10}
			/>

			<Box marginTop={1}>
				<Text dimColor>Press Esc to go back</Text>
			</Box>
		</Box>
	);
};

export default ConfigureStatusHooks;
