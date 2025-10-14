import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Effect} from 'effect';
import {shortcutManager} from '../services/shortcutManager.js';
import {configurationManager} from '../services/configurationManager.js';
import {ShortcutConfig, ShortcutKey} from '../types/index.js';
import {AppError} from '../types/errors.js';

interface ConfigureShortcutsProps {
	onComplete: () => void;
}

type ConfigStep = 'menu' | 'editing' | 'capturing';

interface MenuItem {
	label: string;
	value: string;
}

/**
 * Format error using TaggedError discrimination
 * Pattern matches on _tag for type-safe error display
 */
const formatError = (error: AppError): string => {
	switch (error._tag) {
		case 'FileSystemError':
			return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
		case 'ConfigError':
			return `Configuration error (${error.reason}): ${error.details}`;
		case 'ValidationError':
			return `Validation failed for ${error.field}: ${error.constraint}`;
		case 'GitError':
			return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
		case 'ProcessError':
			return `Process error: ${error.message}`;
	}
};

const ConfigureShortcuts: React.FC<ConfigureShortcutsProps> = ({
	onComplete,
}) => {
	const [step, setStep] = useState<ConfigStep>('menu');
	const [shortcuts, setShortcuts] = useState<ShortcutConfig>(
		shortcutManager.getShortcuts(),
	);
	const [editingShortcut, setEditingShortcut] = useState<
		keyof ShortcutConfig | null
	>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	// Load configuration using Effect on component mount
	useEffect(() => {
		let cancelled = false;

		const loadConfig = async () => {
			const result = await Effect.runPromise(
				Effect.match(configurationManager.loadConfigEffect(), {
					onFailure: (err: AppError) => ({
						type: 'error' as const,
						error: err,
					}),
					onSuccess: config => ({type: 'success' as const, data: config}),
				}),
			);

			if (!cancelled) {
				if (result.type === 'error') {
					// Display error using TaggedError discrimination
					const errorMsg = formatError(result.error);
					setError(errorMsg);
				} else if (result.data.shortcuts) {
					setShortcuts(result.data.shortcuts);
				}
				setIsLoading(false);
			}
		};

		loadConfig().catch(err => {
			if (!cancelled) {
				setError(`Unexpected error loading config: ${String(err)}`);
				setIsLoading(false);
			}
		});

		return () => {
			cancelled = true;
		};
	}, []);

	const getShortcutDisplayFromState = (key: keyof ShortcutConfig): string => {
		const shortcut = shortcuts[key];
		if (!shortcut) return 'Not set';

		const parts: string[] = [];
		if (shortcut.ctrl) parts.push('Ctrl');
		if (shortcut.alt) parts.push('Alt');
		if (shortcut.shift) parts.push('Shift');

		if (shortcut.key === 'escape') {
			parts.push('Esc');
		} else if (shortcut.key) {
			parts.push(shortcut.key.toUpperCase());
		}

		return parts.join('+');
	};

	const shortcutItems: MenuItem[] = [
		{
			label: `Return to Menu: ${getShortcutDisplayFromState('returnToMenu')}`,
			value: 'returnToMenu',
		},
		{
			label: '---',
			value: 'separator',
		},
		{
			label: 'Save and Exit',
			value: 'save',
		},
		{
			label: 'Exit without Saving',
			value: 'exit',
		},
	];

	useInput((input, key) => {
		if (step === 'capturing' && editingShortcut) {
			// Capture the key combination
			const newShortcut: ShortcutKey = {
				key: key.escape ? 'escape' : input || '',
				ctrl: key.ctrl || false,
				alt: false, // Ink doesn't support alt
				shift: false, // Ink doesn't support shift
			};

			// Check for reserved keys
			if (key.ctrl && input === 'c') {
				setError('Ctrl+C is reserved and cannot be used');
				setStep('menu');
				return;
			}
			if (key.ctrl && input === 'd') {
				setError('Ctrl+D is reserved and cannot be used');
				setStep('menu');
				return;
			}
			if (key.ctrl && input === '[') {
				setError('Ctrl+[ is reserved and cannot be used');
				setStep('menu');
				return;
			}

			// Validate that a modifier is used (except for escape)
			if (!key.escape && !key.ctrl) {
				setError('Shortcuts must use a modifier key (Ctrl)');
				setStep('menu');
				return;
			}

			setShortcuts({
				...shortcuts,
				[editingShortcut]: newShortcut,
			});
			setError(null);
			setStep('menu');
		} else if (step === 'menu') {
			if (key.escape) {
				onComplete();
			}
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value === 'separator') {
			return;
		}
		if (item.value === 'save') {
			// Save shortcuts using Effect-based method
			const saveConfig = async () => {
				const result = await Effect.runPromise(
					Effect.match(configurationManager.setShortcutsEffect(shortcuts), {
						onFailure: (err: AppError) => ({
							type: 'error' as const,
							error: err,
						}),
						onSuccess: () => ({type: 'success' as const}),
					}),
				);

				if (result.type === 'error') {
					// Display error using TaggedError discrimination
					const errorMsg = formatError(result.error);
					setError(errorMsg);
				} else {
					// Success - call onComplete
					onComplete();
				}
			};

			saveConfig().catch(err => {
				setError(`Unexpected error saving shortcuts: ${String(err)}`);
			});
			return;
		}
		if (item.value === 'exit') {
			onComplete();
			return;
		}

		// Start editing a shortcut
		setEditingShortcut(item.value as keyof ShortcutConfig);
		setStep('capturing');
		setError(null);
	};

	// Show loading indicator while loading config
	if (isLoading) {
		return (
			<Box flexDirection="column">
				<Text>Loading configuration...</Text>
			</Box>
		);
	}

	if (step === 'capturing') {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					Configure Shortcut: {editingShortcut}
				</Text>
				<Box marginTop={1}>
					<Text>Press the key combination you want to use</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Note: Shortcuts must use Ctrl as a modifier key</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Reserved: Ctrl+C, Ctrl+D, Ctrl+[ (Esc)</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Configure Keyboard Shortcuts
				</Text>
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Select a shortcut to change:</Text>
			</Box>

			<SelectInput
				items={shortcutItems}
				onSelect={handleSelect}
				isFocused={true}
				limit={10}
			/>

			<Box marginTop={1}>
				<Text dimColor>Press Esc to exit without saving</Text>
			</Box>
		</Box>
	);
};

export default ConfigureShortcuts;
