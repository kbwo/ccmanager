import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import {AutopilotConfig} from '../types/index.js';
import {configurationManager} from '../services/configurationManager.js';
import {LLMClient} from '../services/llmClient.js';

interface ConfigureAutopilotProps {
	onComplete: () => void;
}

type ConfigView =
	| 'menu'
	| 'provider'
	| 'model'
	| 'openai-key'
	| 'anthropic-key';

interface MenuItem {
	label: string;
	value: string;
}

const ConfigureAutopilot: React.FC<ConfigureAutopilotProps> = ({
	onComplete,
}) => {
	const [view, setView] = useState<ConfigView>('menu');
	const [config, setConfig] = useState<AutopilotConfig | null>(null);
	const [hasAnyKeys, setHasAnyKeys] = useState<boolean>(false);
	const [availableProviders, setAvailableProviders] = useState<string[]>([]);
	const [inputValue, setInputValue] = useState<string>('');

	useEffect(() => {
		const currentConfig = configurationManager.getAutopilotConfig();

		// Check API key availability
		const hasKeys = LLMClient.hasAnyProviderKeys(currentConfig);
		const availableKeys = LLMClient.getAvailableProviderKeys(currentConfig);
		setHasAnyKeys(hasKeys);
		setAvailableProviders(availableKeys);

		let configToSave = currentConfig;

		// Force disable autopilot if no API keys are available
		if (!hasKeys && currentConfig && currentConfig.enabled) {
			configToSave = {...currentConfig, enabled: false};
		}

		// Auto-select provider if only one API key is available and current provider is not available
		if (hasKeys && availableKeys.length === 1 && currentConfig) {
			const availableProvider = availableKeys[0] as 'openai' | 'anthropic';
			if (
				!LLMClient.isProviderAvailable(currentConfig.provider, currentConfig)
			) {
				const defaultModel =
					availableProvider === 'openai' ? 'gpt-4.1' : 'claude-4-sonnet';
				configToSave = {
					...configToSave,
					provider: availableProvider,
					model: defaultModel,
				};
			}
		}

		// Save config if it changed
		if (configToSave !== currentConfig) {
			configurationManager.setAutopilotConfig(configToSave);
		}

		setConfig(configToSave);
	}, []);

	const saveConfig = (newConfig: AutopilotConfig) => {
		configurationManager.setAutopilotConfig(newConfig);
		setConfig(newConfig);
	};

	const menuItems: MenuItem[] = [
		{
			label: `E 🤖 Enable Autopilot: ${config?.enabled ? 'ON' : 'OFF'}`,
			value: 'toggle-enabled',
		},
		{
			label: `O 🔑 OpenAI API Key: ${config?.apiKeys?.openai ? '***set***' : 'not set'}`,
			value: 'openai-key',
		},
		{
			label: `A 🔑 Anthropic API Key: ${config?.apiKeys?.anthropic ? '***set***' : 'not set'}`,
			value: 'anthropic-key',
		},
		// Only show provider and model options if API keys are available
		...(hasAnyKeys
			? [
					{
						label: `P 🤖 Provider: ${config?.provider || 'openai'}`,
						value: 'provider',
					},
					{
						label: `M 🧠 Model: ${config?.model || 'gpt-4.1'}`,
						value: 'model',
					},
				]
			: []),
		{
			label: 'B ← Back to Configuration',
			value: 'back',
		},
	];

	const providerItems: MenuItem[] = [
		...(availableProviders.includes('openai')
			? [{label: 'OpenAI', value: 'openai'}]
			: []),
		...(availableProviders.includes('anthropic')
			? [{label: 'Anthropic', value: 'anthropic'}]
			: []),
		{label: '← Back', value: 'back'},
	];

	const getModelItems = (provider: string): MenuItem[] => {
		const models =
			provider === 'openai'
				? ['gpt-4.1', 'o4-mini', 'o3']
				: ['claude-4-sonnet', 'claude-4-opus'];

		return [
			...models.map(model => ({label: model, value: model})),
			{label: '← Back', value: 'back'},
		];
	};

	const getProviderInitialIndex = (): number => {
		if (!config) return 0;
		return providerItems.findIndex(item => item.value === config.provider);
	};

	const getModelInitialIndex = (): number => {
		if (!config) return 0;
		const modelItems = getModelItems(config.provider);
		return modelItems.findIndex(item => item.value === config.model);
	};

	const handleSelect = (item: MenuItem) => {
		if (!config) return;

		if (item.value === 'back') {
			if (view === 'menu') {
				onComplete();
			} else {
				setView('menu');
			}
		} else if (item.value === 'toggle-enabled') {
			saveConfig({...config, enabled: !config.enabled});
		} else if (item.value === 'openai-key') {
			setInputValue(config.apiKeys?.openai || '');
			setView('openai-key');
		} else if (item.value === 'anthropic-key') {
			setInputValue(config.apiKeys?.anthropic || '');
			setView('anthropic-key');
		} else if (item.value === 'provider') {
			setView('provider');
		} else if (item.value === 'model') {
			setView('model');
		} else if (view === 'provider') {
			if (item.value === 'openai' || item.value === 'anthropic') {
				const defaultModel =
					item.value === 'openai' ? 'gpt-4.1' : 'claude-4-sonnet';
				saveConfig({
					...config,
					provider: item.value as 'openai' | 'anthropic',
					model: defaultModel,
				});
				setView('menu');
			}
		} else if (view === 'model') {
			saveConfig({...config, model: item.value});
			setView('menu');
		}
	};

	// Handle hotkeys (only when in menu view)
	useInput((input, key) => {
		if (view !== 'menu') return;

		const keyPressed = input.toLowerCase();

		switch (keyPressed) {
			case 'e':
				if (config && hasAnyKeys) {
					saveConfig({...config, enabled: !config.enabled});
				}
				break;
			case 'o':
				setInputValue(config?.apiKeys?.openai || '');
				setView('openai-key');
				break;
			case 'a':
				setInputValue(config?.apiKeys?.anthropic || '');
				setView('anthropic-key');
				break;
			case 'p':
				if (hasAnyKeys) {
					setView('provider');
				}
				break;
			case 'm':
				if (hasAnyKeys) {
					setView('model');
				}
				break;
			case 'b':
				onComplete();
				break;
		}

		// Handle escape key
		if (key.escape) {
			onComplete();
		}
	});

	// Handle API key input submission
	const handleApiKeySubmit = (
		value: string,
		provider: 'openai' | 'anthropic',
	) => {
		if (!config) return;

		let newConfig = {
			...config,
			apiKeys: {
				...config.apiKeys,
				[provider]: value.trim() || undefined,
			},
		};

		// Update state after saving
		const hasKeys = LLMClient.hasAnyProviderKeys(newConfig);
		const availableKeys = LLMClient.getAvailableProviderKeys(newConfig);
		setHasAnyKeys(hasKeys);
		setAvailableProviders(availableKeys);

		// Auto-select provider if only one API key is available and current provider is not available
		if (hasKeys && availableKeys.length === 1) {
			const availableProvider = availableKeys[0] as 'openai' | 'anthropic';
			if (!LLMClient.isProviderAvailable(newConfig.provider, newConfig)) {
				const defaultModel =
					availableProvider === 'openai' ? 'gpt-4.1' : 'claude-4-sonnet';
				newConfig = {
					...newConfig,
					provider: availableProvider,
					model: defaultModel,
				};
			}
		}

		saveConfig(newConfig);

		// Return to menu
		setView('menu');
	};

	// Handle escape key for API key input views
	useInput((input, key) => {
		if (view === 'openai-key' || view === 'anthropic-key') {
			if (key.escape) {
				setView('menu');
			}
		}
	});

	if (!config) {
		return (
			<Box>
				<Text>Loading autopilot configuration...</Text>
			</Box>
		);
	}

	if (view === 'provider') {
		const openaiAvailable = availableProviders.includes('openai');
		const anthropicAvailable = availableProviders.includes('anthropic');

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Select LLM Provider
					</Text>
				</Box>

				{!openaiAvailable && (
					<Box marginBottom={1}>
						<Text color="red">OpenAI: Unavailable (configure API key)</Text>
					</Box>
				)}

				{!anthropicAvailable && (
					<Box marginBottom={1}>
						<Text color="red">Anthropic: Unavailable (configure API key)</Text>
					</Box>
				)}

				<SelectInput
					items={providerItems}
					onSelect={handleSelect}
					isFocused={true}
					initialIndex={getProviderInitialIndex()}
				/>
			</Box>
		);
	}

	if (view === 'model') {
		const modelItems = getModelItems(config.provider);
		const providerAvailable = availableProviders.includes(config.provider);

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Select Model for{' '}
						{config.provider === 'openai' ? 'OpenAI' : 'Anthropic'}
					</Text>
				</Box>

				{!providerAvailable && (
					<Box marginBottom={1}>
						<Text color="red">
							⚠️ {config.provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key
							not configured. Please configure API key in Autopilot settings.
						</Text>
					</Box>
				)}

				<SelectInput
					items={modelItems}
					onSelect={handleSelect}
					isFocused={true}
					initialIndex={getModelInitialIndex()}
				/>
			</Box>
		);
	}

	if (view === 'openai-key') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						OpenAI API Key
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>
						Enter your OpenAI API key (will be saved in CCManager config):
					</Text>
				</Box>

				<TextInput
					value={inputValue}
					onChange={setInputValue}
					onSubmit={value => handleApiKeySubmit(value, 'openai')}
					placeholder="sk-..."
					focus={true}
				/>

				<Box marginTop={1}>
					<Text dimColor>Press Enter to save, Escape to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (view === 'anthropic-key') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Anthropic API Key
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>
						Enter your Anthropic API key (will be saved in CCManager config):
					</Text>
				</Box>

				<TextInput
					value={inputValue}
					onChange={setInputValue}
					onSubmit={value => handleApiKeySubmit(value, 'anthropic')}
					placeholder="sk-ant-..."
					focus={true}
				/>

				<Box marginTop={1}>
					<Text dimColor>Press Enter to save, Escape to cancel</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Autopilot
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Configure AI-powered session monitoring and guidance:
				</Text>
			</Box>

			{!hasAnyKeys && (
				<Box marginBottom={1}>
					<Text color="red">
						⚠️ No API keys configured. Set API keys below to enable Autopilot.
					</Text>
				</Box>
			)}

			<SelectInput
				items={menuItems}
				onSelect={handleSelect}
				isFocused={true}
				limit={10}
			/>

			<Box marginTop={1}>
				<Text dimColor>
					Autopilot monitors Claude Code sessions and provides guidance when
					needed.
				</Text>
			</Box>
		</Box>
	);
};

export default ConfigureAutopilot;
