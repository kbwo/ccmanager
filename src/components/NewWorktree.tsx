import React, {useState, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {shortcutManager} from '../services/shortcutManager.js';
import {configurationManager} from '../services/configurationManager.js';
import {generateWorktreeDirectory} from '../utils/worktreeUtils.js';
import {WorktreeService} from '../services/worktreeService.js';
import {useSearchMode} from '../hooks/useSearchMode.js';

interface NewWorktreeProps {
	projectPath?: string;
	onComplete: (
		path: string,
		branch: string,
		baseBranch: string,
		copySessionData: boolean,
		copyClaudeDirectory: boolean,
	) => void;
	onCancel: () => void;
}

type Step =
	| 'path'
	| 'base-branch'
	| 'branch-strategy'
	| 'branch'
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
	const worktreeConfig = configurationManager.getWorktreeConfig();
	const isAutoDirectory = worktreeConfig.autoDirectory;
	const limit = 10;

	// Adjust initial step based on auto directory mode
	const [step, setStep] = useState<Step>(
		isAutoDirectory ? 'base-branch' : 'path',
	);
	const [path, setPath] = useState('');
	const [branch, setBranch] = useState('');
	const [baseBranch, setBaseBranch] = useState('');
	const [copyClaudeDirectory, setCopyClaudeDirectory] = useState(true);
	const [copySessionData, setCopySessionData] = useState(
		worktreeConfig.copySessionData ?? true,
	);

	// Initialize worktree service and load branches (memoized to avoid re-initialization)
	const {branches, defaultBranch} = useMemo(() => {
		const service = new WorktreeService();
		const allBranches = service.getAllBranches();
		const defaultBr = service.getDefaultBranch();
		return {
			branches: allBranches,
			defaultBranch: defaultBr,
		};
	}, []); // Empty deps array - only initialize once

	// Create branch items with default branch first (memoized)
	const allBranchItems: BranchItem[] = useMemo(
		() => [
			{label: `${defaultBranch} (default)`, value: defaultBranch},
			...branches
				.filter(br => br !== defaultBranch)
				.map(br => ({label: br, value: br})),
		],
		[branches, defaultBranch],
	);

	// Use search mode for base branch selection
	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(allBranchItems.length, {
			isDisabled: step !== 'base-branch',
		});

	// Filter branch items based on search query
	const branchItems = useMemo(() => {
		if (!searchQuery) return allBranchItems;
		return allBranchItems.filter(item =>
			item.value.toLowerCase().includes(searchQuery.toLowerCase()),
		);
	}, [allBranchItems, searchQuery]);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}

		// Handle arrow key navigation in search mode for base branch selection
		if (step === 'base-branch' && isSearchMode) {
			// Don't handle any keys here - let useSearchMode handle them
			// The hook will handle arrow keys for navigation and Enter to exit search mode
			return;
		}
	});

	const handlePathSubmit = (value: string) => {
		if (value.trim()) {
			setPath(value.trim());
			setStep('base-branch');
		}
	};

	const handleBranchSubmit = (value: string) => {
		if (value.trim()) {
			setBranch(value.trim());
			setStep('copy-settings');
		}
	};

	const handleBaseBranchSelect = (item: {label: string; value: string}) => {
		setBaseBranch(item.value);
		setStep('branch-strategy');
	};

	const handleBranchStrategySelect = (item: {label: string; value: string}) => {
		const useExisting = item.value === 'existing';
		if (useExisting) {
			// Use the base branch as the branch name for existing branch
			setBranch(baseBranch);
			setStep('copy-settings');
		} else {
			// Need to input new branch name
			setStep('branch');
		}
	};

	const handleCopySettingsSelect = (item: {label: string; value: boolean}) => {
		setCopyClaudeDirectory(item.value);
		setStep('copy-session');
	};

	const handleCopySessionSelect = (item: {label: string; value: string}) => {
		const shouldCopy = item.value === 'yes';
		setCopySessionData(shouldCopy);

		if (isAutoDirectory) {
			// Generate path from branch name
			const autoPath = generateWorktreeDirectory(
				projectPath || process.cwd(),
				branch,
				worktreeConfig.autoDirectoryPattern,
			);
			onComplete(autoPath, branch, baseBranch, shouldCopy, copyClaudeDirectory);
		} else {
			onComplete(path, branch, baseBranch, shouldCopy, copyClaudeDirectory);
		}
	};

	// Calculate generated path for preview (memoized to avoid expensive recalculations)
	const generatedPath = useMemo(() => {
		return isAutoDirectory && branch
			? generateWorktreeDirectory(
					projectPath || process.cwd(),
					branch,
					worktreeConfig.autoDirectoryPattern,
				)
			: '';
	}, [
		isAutoDirectory,
		branch,
		worktreeConfig.autoDirectoryPattern,
		projectPath,
	]);

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
						// In search mode, show the items as a list without SelectInput
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

			{step === 'copy-settings' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Copy .claude directory from base branch (
							<Text color="cyan">{baseBranch}</Text>)?
						</Text>
					</Box>
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
							worktree
						</Text>
					</Box>
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
