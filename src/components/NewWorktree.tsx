import React, {useState, useMemo, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {shortcutManager} from '../services/shortcutManager.js';
import {configReader} from '../services/config/configReader.js';
import {generateWorktreeDirectory} from '../utils/worktreeUtils.js';
import {WorktreeService} from '../services/worktreeService.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {Effect} from 'effect';
import type {AppError} from '../types/errors.js';
import {
	describePromptInjection,
	getPromptInjectionMethod,
} from '../utils/presetPrompt.js';

interface NewWorktreeProps {
	projectPath?: string;
	onComplete: (request: NewWorktreeRequest) => void;
	onCancel: () => void;
}

export type NewWorktreeRequest =
	| {
			creationMode: 'manual';
			path: string;
			branch: string;
			baseBranch: string;
			copySessionData: boolean;
			copyClaudeDirectory: boolean;
	  }
	| {
			creationMode: 'prompt';
			path: string;
			projectPath: string;
			autoDirectoryPattern?: string;
			baseBranch: string;
			presetId: string;
			initialPrompt: string;
			copySessionData: boolean;
			copyClaudeDirectory: boolean;
			branch?: never;
	  };

type Step =
	| 'path'
	| 'base-branch'
	| 'creation-mode'
	| 'branch-strategy'
	| 'branch'
	| 'auto-preset'
	| 'auto-prompt'
	| 'copy-settings'
	| 'copy-session';

interface BranchItem {
	label: string;
	value: string;
}

const NewWorktree: React.FC<NewWorktreeProps> = ({
	projectPath,
	onComplete,
	onCancel,
}) => {
	const worktreeConfig = configReader.getWorktreeConfig();
	const presetsConfig = configReader.getCommandPresets();
	const isAutoDirectory = worktreeConfig.autoDirectory;
	const isAutoUseDefaultBranch = worktreeConfig.autoUseDefaultBranch ?? false;
	const limit = 10;

	const getInitialStep = (): Step => {
		if (isAutoDirectory) {
			return 'base-branch';
		}

		return 'path';
	};

	const [step, setStep] = useState<Step>(getInitialStep());
	const [path, setPath] = useState('');
	const [branch, setBranch] = useState('');
	const [baseBranch, setBaseBranch] = useState('');
	const [copyClaudeDirectory, setCopyClaudeDirectory] = useState(true);
	const [copySessionData, setCopySessionData] = useState(
		worktreeConfig.copySessionData ?? true,
	);
	const [selectedPresetId, setSelectedPresetId] = useState(
		presetsConfig.defaultPresetId,
	);
	const [initialPrompt, setInitialPrompt] = useState('');

	const [isLoadingBranches, setIsLoadingBranches] = useState(true);
	const [branchLoadError, setBranchLoadError] = useState<string | null>(null);
	const [branches, setBranches] = useState<string[]>([]);
	const [defaultBranch, setDefaultBranch] = useState<string>('main');

	useEffect(() => {
		let cancelled = false;
		const service = new WorktreeService(projectPath);

		const loadBranches = async () => {
			const workflow = Effect.all(
				[service.getAllBranchesEffect(), service.getDefaultBranchEffect()],
				{concurrency: 2},
			);

			const result = await Effect.runPromise(
				Effect.match(workflow, {
					onFailure: (error: AppError) => ({
						type: 'error' as const,
						message: formatError(error),
					}),
					onSuccess: ([branchList, defaultBr]: [string[], string]) => ({
						type: 'success' as const,
						branches: branchList,
						defaultBranch: defaultBr,
					}),
				}),
			);

			if (!cancelled) {
				if (result.type === 'error') {
					setBranchLoadError(result.message);
					setIsLoadingBranches(false);
				} else {
					setBranches(result.branches);
					setDefaultBranch(result.defaultBranch);
					setIsLoadingBranches(false);

					if (isAutoUseDefaultBranch && result.defaultBranch) {
						setBaseBranch(result.defaultBranch);
						setStep(currentStep =>
							currentStep === 'base-branch' ? 'creation-mode' : currentStep,
						);
					}
				}
			}
		};

		loadBranches().catch(err => {
			if (!cancelled) {
				setBranchLoadError(`Unexpected error loading branches: ${String(err)}`);
				setIsLoadingBranches(false);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [projectPath, isAutoUseDefaultBranch]);

	const allBranchItems: BranchItem[] = useMemo(
		() => [
			{label: `${defaultBranch} (default)`, value: defaultBranch},
			...branches
				.filter(br => br !== defaultBranch)
				.map(br => ({label: br, value: br})),
		],
		[branches, defaultBranch],
	);

	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(allBranchItems.length, {
			isDisabled: step !== 'base-branch',
		});

	const branchItems = useMemo(() => {
		if (!searchQuery) return allBranchItems;
		return allBranchItems.filter(item =>
			item.value.toLowerCase().includes(searchQuery.toLowerCase()),
		);
	}, [allBranchItems, searchQuery]);

	const presetItems = useMemo(
		() =>
			presetsConfig.presets.map(preset => ({
				label: `${preset.name}${
					preset.id === presetsConfig.defaultPresetId ? ' (default)' : ''
				}\n    Command: ${preset.command}${
					preset.args?.length ? ` ${preset.args.join(' ')}` : ''
				}`,
				value: preset.id,
			})),
		[presetsConfig.defaultPresetId, presetsConfig.presets],
	);

	const selectedPreset = useMemo(
		() =>
			presetsConfig.presets.find(preset => preset.id === selectedPresetId) ||
			presetsConfig.presets[0],
		[selectedPresetId, presetsConfig.presets],
	);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}

		if (step === 'base-branch' && isSearchMode) {
			return;
		}
	});

	const handlePathSubmit = (value: string) => {
		if (!value.trim()) return;

		setPath(value.trim());
		if (isAutoUseDefaultBranch && defaultBranch) {
			setBaseBranch(defaultBranch);
			setStep('creation-mode');
		} else {
			setStep('base-branch');
		}
	};

	const handleBaseBranchSelect = (item: {label: string; value: string}) => {
		setBaseBranch(item.value);
		setStep('creation-mode');
	};

	const handleCreationModeSelect = (item: {label: string; value: string}) => {
		if (item.value === 'manual') {
			setStep('branch-strategy');
			return;
		}

		setStep('auto-preset');
	};

	const handleBranchStrategySelect = (item: {label: string; value: string}) => {
		const useExisting = item.value === 'existing';
		if (useExisting) {
			setBranch(baseBranch);
			setStep('copy-settings');
		} else {
			setStep('branch');
		}
	};

	const handleBranchSubmit = (value: string) => {
		if (!value.trim()) return;

		setBranch(value.trim());
		setStep('copy-settings');
	};

	const handlePresetSelect = (item: {label: string; value: string}) => {
		setSelectedPresetId(item.value);
		setStep('auto-prompt');
	};

	const handlePromptSubmit = (value: string) => {
		if (!value.trim()) return;

		setInitialPrompt(value.trim());
		setStep('copy-settings');
	};

	const handleCopySettingsSelect = (item: {label: string; value: boolean}) => {
		setCopyClaudeDirectory(item.value);
		setStep('copy-session');
	};

	const getResolvedPath = (): string => {
		if (!isAutoDirectory) {
			return path;
		}

		const branchForPath =
			step === 'copy-session' && branch ? branch : 'generated-from-prompt';

		return generateWorktreeDirectory(
			projectPath || process.cwd(),
			branchForPath,
			worktreeConfig.autoDirectoryPattern,
		);
	};

	const handleCopySessionSelect = (item: {label: string; value: string}) => {
		const shouldCopy = item.value === 'yes';
		const resolvedPath = getResolvedPath();

		setCopySessionData(shouldCopy);

		if (step !== 'copy-session') {
			return;
		}

		if (initialPrompt && selectedPresetId) {
			onComplete({
				creationMode: 'prompt',
				path: isAutoDirectory ? projectPath || process.cwd() : resolvedPath,
				projectPath: projectPath || process.cwd(),
				autoDirectoryPattern: isAutoDirectory
					? worktreeConfig.autoDirectoryPattern
					: undefined,
				baseBranch,
				presetId: selectedPresetId,
				initialPrompt,
				copySessionData: shouldCopy,
				copyClaudeDirectory,
			});
			return;
		}

		onComplete({
			creationMode: 'manual',
			path: resolvedPath,
			branch,
			baseBranch,
			copySessionData: shouldCopy,
			copyClaudeDirectory,
		});
	};

	const generatedPath = useMemo(() => {
		if (!isAutoDirectory) {
			return '';
		}

		const branchForPath =
			branch || (initialPrompt ? 'generated-from-prompt' : '');
		if (!branchForPath) {
			return '';
		}

		return generateWorktreeDirectory(
			projectPath || process.cwd(),
			branchForPath,
			worktreeConfig.autoDirectoryPattern,
		);
	}, [
		isAutoDirectory,
		branch,
		initialPrompt,
		worktreeConfig.autoDirectoryPattern,
		projectPath,
	]);

	const formatError = (error: AppError): string => {
		switch (error._tag) {
			case 'GitError':
				return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
			case 'FileSystemError':
				return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
			case 'ConfigError':
				return `Configuration error (${error.reason}): ${error.details}`;
			case 'ProcessError':
				return `Process error: ${error.message}`;
			case 'ValidationError':
				return `Validation failed for ${error.field}: ${error.constraint}`;
		}
	};

	if (isLoadingBranches) {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Create New Worktree
					</Text>
				</Box>
				<Box>
					<Text>Loading branches...</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	if (branchLoadError) {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Create New Worktree
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="red">Error loading branches:</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="red">{branchLoadError}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('cancel')} to go back
					</Text>
				</Box>
			</Box>
		);
	}

	const promptHandlingText = selectedPreset
		? describePromptInjection(selectedPreset)
		: '';
	const promptMethod = selectedPreset
		? getPromptInjectionMethod(selectedPreset)
		: 'stdin';

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Create New Worktree
				</Text>
			</Box>

			{step === 'path' && !isAutoDirectory ? (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Enter worktree path (relative to repository root):</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInputWrapper
							value={path}
							onChange={setPath}
							onSubmit={handlePathSubmit}
							placeholder="e.g., ../myproject-feature"
						/>
					</Box>
				</Box>
			) : null}

			{step === 'base-branch' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Select base branch for the worktree:</Text>
					</Box>
					{isSearchMode && (
						<Box marginBottom={1}>
							<Text>Search: </Text>
							<TextInputWrapper
								value={searchQuery}
								onChange={setSearchQuery}
								focus={true}
								placeholder="Type to filter branches..."
							/>
						</Box>
					)}
					{isSearchMode && branchItems.length === 0 ? (
						<Box>
							<Text color="yellow">No branches match your search</Text>
						</Box>
					) : isSearchMode ? (
						<Box flexDirection="column">
							{branchItems.slice(0, limit).map((item, index) => (
								<Text
									key={item.value}
									color={index === selectedIndex ? 'green' : undefined}
								>
									{index === selectedIndex ? '❯ ' : '  '}
									{item.label}
								</Text>
							))}
						</Box>
					) : (
						<SelectInput
							items={branchItems}
							onSelect={handleBaseBranchSelect}
							initialIndex={selectedIndex}
							limit={limit}
							isFocused={!isSearchMode}
						/>
					)}
					{!isSearchMode && (
						<Box marginTop={1}>
							<Text dimColor>Press / to search</Text>
						</Box>
					)}
				</Box>
			)}

			{step === 'creation-mode' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Base branch: <Text color="cyan">{baseBranch}</Text>
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>How do you want to create the new worktree?</Text>
					</Box>
					<SelectInput
						items={[
							{
								label: '1. Choose the branch name yourself',
								value: 'manual',
							},
							{
								label:
									'2. Enter a prompt first and let Claude decide the branch name',
								value: 'prompt',
							},
						]}
						onSelect={handleCreationModeSelect}
						initialIndex={0}
					/>
				</Box>
			)}

			{step === 'branch-strategy' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Base branch: <Text color="cyan">{baseBranch}</Text>
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>Choose branch creation strategy:</Text>
					</Box>
					<SelectInput
						items={[
							{
								label: 'Create new branch from base branch',
								value: 'new',
							},
							{
								label: 'Use existing base branch',
								value: 'existing',
							},
						]}
						onSelect={handleBranchStrategySelect}
						initialIndex={0}
					/>
				</Box>
			)}

			{step === 'branch' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Enter new branch name (will be created from{' '}
							<Text color="cyan">{baseBranch}</Text>):
						</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInputWrapper
							value={branch}
							onChange={setBranch}
							onSubmit={handleBranchSubmit}
							placeholder="e.g., feature/new-feature"
						/>
					</Box>
					{isAutoDirectory && generatedPath && (
						<Box marginTop={1}>
							<Text dimColor>
								Worktree will be created at:{' '}
								<Text color="green">{generatedPath}</Text>
							</Text>
						</Box>
					)}
				</Box>
			)}

			{step === 'auto-preset' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Select the preset to use for the first session:</Text>
					</Box>
					<SelectInput
						items={presetItems}
						onSelect={handlePresetSelect}
						initialIndex={Math.max(
							0,
							presetItems.findIndex(item => item.value === selectedPresetId),
						)}
					/>
				</Box>
			)}

			{step === 'auto-prompt' && selectedPreset && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Preset: <Text color="cyan">{selectedPreset.name}</Text>
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>Enter the prompt for the new session:</Text>
					</Box>
					<Box marginBottom={1}>
						<Text dimColor>{promptHandlingText}</Text>
					</Box>
					<Box marginBottom={1}>
						<Text dimColor>
							Examples: Claude/Codex use the final argument, OpenCode uses
							`--prompt`, and other commands may receive the prompt over stdin.
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text color="yellow">
							Automatic branch naming requires the `claude` command in your
							PATH.
						</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInputWrapper
							value={initialPrompt}
							onChange={setInitialPrompt}
							onSubmit={handlePromptSubmit}
							placeholder="Describe what you want the agent to do"
						/>
					</Box>
					<Box marginTop={1}>
						<Text dimColor>
							Prompt delivery mode for this preset:{' '}
							<Text color="green">{promptMethod}</Text>
						</Text>
					</Box>
				</Box>
			)}

			{step === 'copy-settings' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Copy .claude directory from base branch (
							<Text color="cyan">{baseBranch}</Text>)?
						</Text>
					</Box>
					{initialPrompt ? (
						<Box marginBottom={1}>
							<Text dimColor>
								The branch name will be generated automatically right before the
								worktree is created.
							</Text>
						</Box>
					) : null}
					<SelectInput
						items={[
							{
								label: 'Yes - Copy .claude directory from base branch',
								value: true,
							},
							{label: 'No - Start without .claude directory', value: false},
						]}
						onSelect={handleCopySettingsSelect}
						initialIndex={0}
					/>
				</Box>
			)}

			{step === 'copy-session' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Copy Claude Code session data to the new worktree?</Text>
					</Box>
					<Box marginBottom={1}>
						<Text dimColor>
							This will copy conversation history and context from the current
							worktree.
						</Text>
					</Box>
					{isAutoDirectory && generatedPath ? (
						<Box marginBottom={1}>
							<Text dimColor>
								Worktree path preview:{' '}
								<Text color="green">{generatedPath}</Text>
							</Text>
						</Box>
					) : null}
					<SelectInput
						items={[
							{label: '✅ Yes, copy session data', value: 'yes'},
							{label: '❌ No, start fresh', value: 'no'},
						]}
						onSelect={handleCopySessionSelect}
						initialIndex={copySessionData ? 0 : 1}
					/>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>
					Press {shortcutManager.getShortcutDisplay('cancel')} to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default NewWorktree;
