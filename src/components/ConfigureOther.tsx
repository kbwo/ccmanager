import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {useConfigEditor} from '../contexts/ConfigEditorContext.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {
	DEFAULT_AUTO_APPROVAL_VERIFIER,
	DEFAULT_MINIMAX_MODEL,
	DEFAULT_MINIMAX_PROTOCOL,
	DEFAULT_MINIMAX_REGION,
	DEFAULT_TIMEOUT_SECONDS,
	MINIMAX_MODELS,
	MINIMAX_PROTOCOLS,
	MINIMAX_REGIONS,
} from '../constants/autoApproval.js';
import type {
	AutoApprovalVerifier,
	MiniMaxModel,
	MiniMaxProtocol,
	MiniMaxRegion,
} from '../types/index.js';
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

const nextValue = <T,>(values: readonly T[], value: T): T => {
	const index = values.indexOf(value);
	return values[(index + 1) % values.length]!;
};

const ConfigureOther: React.FC<ConfigureOtherProps> = ({onComplete}) => {
	const configEditor = useConfigEditor();
	const scope = configEditor.getScope();

	// Get initial auto-approval config based on scope
	const autoApprovalConfig = configEditor.getAutoApprovalConfig()!;
	const [view, setView] = useState<OtherView>('main');
	const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(
		autoApprovalConfig.enabled,
	);
	const [customCommand, setCustomCommand] = useState(
		autoApprovalConfig.customCommand ?? '',
	);
	const [customCommandDraft, setCustomCommandDraft] = useState(customCommand);
	const [timeout, setTimeout] = useState(
		autoApprovalConfig.timeout ?? DEFAULT_TIMEOUT_SECONDS,
	);
	const [timeoutDraft, setTimeoutDraft] = useState(timeout);
	const [verifier, setVerifier] = useState<AutoApprovalVerifier>(
		autoApprovalConfig.verifier ?? DEFAULT_AUTO_APPROVAL_VERIFIER,
	);
	const [minimaxModel, setMinimaxModel] = useState<MiniMaxModel>(
		autoApprovalConfig.minimaxModel ?? DEFAULT_MINIMAX_MODEL,
	);
	const [minimaxRegion, setMinimaxRegion] = useState<MiniMaxRegion>(
		autoApprovalConfig.minimaxRegion ?? DEFAULT_MINIMAX_REGION,
	);
	const [minimaxProtocol, setMinimaxProtocol] = useState<MiniMaxProtocol>(
		autoApprovalConfig.minimaxProtocol ?? DEFAULT_MINIMAX_PROTOCOL,
	);
	// Show if inheriting from global (for project scope)
	const isInheriting =
		scope === 'project' && !configEditor.hasProjectOverride('autoApproval');

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
			label: `Verifier: ${verifier === 'minimax' ? 'MiniMax' : 'Default CLI'}`,
			value: 'verifier',
		},
		...(verifier === 'minimax'
			? ([
					{
						label: `MiniMax Model: ${minimaxModel}`,
						value: 'minimaxModel',
					},
					{
						label: `MiniMax Region: ${minimaxRegion === 'global_en' ? 'Global' : 'CN'}`,
						value: 'minimaxRegion',
					},
					{
						label: `MiniMax Protocol: ${minimaxProtocol === 'openai' ? 'OpenAI-compatible' : 'Anthropic-compatible'}`,
						value: 'minimaxProtocol',
					},
				] satisfies MenuItem[])
			: []),
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
			case 'verifier':
				setVerifier(verifier === 'minimax' ? 'default' : 'minimax');
				break;
			case 'minimaxModel':
				setMinimaxModel(nextValue(MINIMAX_MODELS, minimaxModel));
				break;
			case 'minimaxRegion':
				setMinimaxRegion(nextValue(MINIMAX_REGIONS, minimaxRegion));
				break;
			case 'minimaxProtocol':
				setMinimaxProtocol(nextValue(MINIMAX_PROTOCOLS, minimaxProtocol));
				break;
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
				configEditor.setAutoApprovalConfig({
					enabled: autoApprovalEnabled,
					customCommand: customCommand.trim() || undefined,
					timeout,
					verifier,
					...(verifier === 'minimax'
						? {minimaxModel, minimaxRegion, minimaxProtocol}
						: {}),
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

	const scopeLabel = scope === 'project' ? 'Project' : 'Global';

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Other & Experimental Settings ({scopeLabel})
				</Text>
			</Box>

			{isInheriting && (
				<Box marginBottom={1}>
					<Text backgroundColor="cyan" color="black">
						{' '}
						📋 Inheriting from global configuration{' '}
					</Text>
				</Box>
			)}

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
