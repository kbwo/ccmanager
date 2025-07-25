import React, {useState, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';
import SelectInput from 'ink-select-input';
import {shortcutManager} from '../services/shortcutManager.js';
import {configurationManager} from '../services/configurationManager.js';
import {generateWorktreeDirectory} from '../utils/worktreeUtils.js';
import {WorktreeService} from '../services/worktreeService.js';

interface NewWorktreeProps {
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
	| 'branch'
	| 'base-branch'
	| 'copy-settings'
	| 'copy-session';

interface BranchItem {
	label: string;
	value: string;
}

const NewWorktree: React.FC<NewWorktreeProps> = ({onComplete, onCancel}) => {
	const worktreeConfig = configurationManager.getWorktreeConfig();
	const isAutoDirectory = worktreeConfig.autoDirectory;

	// Adjust initial step based on auto directory mode
	const [step, setStep] = useState<Step>(isAutoDirectory ? 'branch' : 'path');
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
	const branchItems: BranchItem[] = useMemo(
		() => [
			{label: `${defaultBranch} (default)`, value: defaultBranch},
			...branches
				.filter(br => br !== defaultBranch)
				.map(br => ({label: br, value: br})),
		],
		[branches, defaultBranch],
	);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}
	});

	const handlePathSubmit = (value: string) => {
		if (value.trim()) {
			setPath(value.trim());
			setStep('branch');
		}
	};

	const handleBranchSubmit = (value: string) => {
		if (value.trim()) {
			setBranch(value.trim());
			setStep('base-branch');
		}
	};

	const handleBaseBranchSelect = (item: {label: string; value: string}) => {
		setBaseBranch(item.value);
		setStep('copy-settings');
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
			? generateWorktreeDirectory(branch, worktreeConfig.autoDirectoryPattern)
			: '';
	}, [isAutoDirectory, branch, worktreeConfig.autoDirectoryPattern]);

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
			) : step === 'branch' && !isAutoDirectory ? (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Enter branch name for worktree at <Text color="cyan">{path}</Text>
							:
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
				</Box>
			) : step === 'branch' ? (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Enter branch name (directory will be auto-generated):</Text>
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
					{generatedPath && (
						<Box marginTop={1}>
							<Text dimColor>
								Worktree will be created at:{' '}
								<Text color="green">{generatedPath}</Text>
							</Text>
						</Box>
					)}
				</Box>
			) : null}

			{step === 'base-branch' && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Select base branch for <Text color="cyan">{branch}</Text>:
						</Text>
					</Box>
					<SelectInput
						items={branchItems}
						onSelect={handleBaseBranchSelect}
						initialIndex={0}
						limit={10}
					/>
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
