import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Effect} from 'effect';
import {WorktreeService} from '../services/worktreeService.js';
import {configReader} from '../services/config/configReader.js';
import Confirmation, {SimpleConfirmation} from './Confirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {GitError} from '../types/errors.js';
import {MergeConfig} from '../types/index.js';
import {hasUncommittedChanges} from '../utils/gitUtils.js';

interface MergeWorktreeProps {
	onComplete: () => void;
	onCancel: () => void;
}

type Step =
	| 'select-source'
	| 'select-target'
	| 'select-operation'
	| 'confirm-merge'
	| 'executing-merge'
	| 'merge-error'
	| 'check-uncommitted'
	| 'uncommitted-warning'
	| 'delete-confirm';

interface BranchItem {
	label: string;
	value: string;
}

const MergeWorktree: React.FC<MergeWorktreeProps> = ({
	onComplete,
	onCancel,
}) => {
	const [step, setStep] = useState<Step>('select-source');
	const [sourceBranch, setSourceBranch] = useState<string>('');
	const [targetBranch, setTargetBranch] = useState<string>('');
	const [branchItems, setBranchItems] = useState<BranchItem[]>([]);
	const [originalBranchItems, setOriginalBranchItems] = useState<BranchItem[]>(
		[],
	);
	const [operation, setOperation] = useState<'merge' | 'rebase'>('merge');
	const [mergeError, setMergeError] = useState<string | null>(null);
	const [worktreeService] = useState(() => new WorktreeService());
	const [mergeConfig] = useState<MergeConfig | undefined>(() =>
		configReader.getMergeConfig(),
	);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const loadWorktrees = async () => {
			try {
				const loadedWorktrees = await Effect.runPromise(
					worktreeService.getWorktreesEffect(),
				);

				if (!cancelled) {
					// Create branch items for selection
					const items = loadedWorktrees.map(wt => ({
						label:
							(wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached') +
							(wt.isMainWorktree ? ' (main)' : ''),
						value: wt.branch
							? wt.branch.replace('refs/heads/', '')
							: 'detached',
					}));
					setBranchItems(items);
					setOriginalBranchItems(items);
					setIsLoading(false);
				}
			} catch (err) {
				if (!cancelled) {
					const errorMessage =
						err instanceof GitError
							? `Git error: ${err.stderr}`
							: err instanceof Error
								? err.message
								: String(err);
					setLoadError(errorMessage);
					setIsLoading(false);
				}
			}
		};

		loadWorktrees();

		return () => {
			cancelled = true;
		};
	}, [worktreeService]);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
			return;
		}

		// Operation selection is now handled by ConfirmationView

		if (step === 'merge-error') {
			// Any key press returns to menu
			onCancel();
		}
	});

	const handleSelectSource = (item: BranchItem) => {
		setSourceBranch(item.value);
		// Filter out the selected source branch for target selection
		const filteredItems = originalBranchItems.filter(
			b => b.value !== item.value,
		);
		setBranchItems(filteredItems);
		setStep('select-target');
	};

	const handleSelectTarget = (item: BranchItem) => {
		setTargetBranch(item.value);
		setStep('select-operation');
	};

	// Execute the merge operation when step changes to executing-merge
	useEffect(() => {
		if (step !== 'executing-merge') return;

		const performMerge = async () => {
			try {
				await Effect.runPromise(
					worktreeService.mergeWorktreeEffect(
						sourceBranch,
						targetBranch,
						operation,
						mergeConfig,
					),
				);

				// Merge successful, check for uncommitted changes before asking about deletion
				setStep('check-uncommitted');
			} catch (err) {
				// Merge failed, show error
				const errorMessage =
					err instanceof GitError
						? `${err.command} failed: ${err.stderr}`
						: err instanceof Error
							? err.message
							: 'Merge operation failed';
				setMergeError(errorMessage);
				setStep('merge-error');
			}
		};

		performMerge();
	}, [
		step,
		sourceBranch,
		targetBranch,
		operation,
		mergeConfig,
		worktreeService,
	]);

	// Check for uncommitted changes in source worktree when entering check-uncommitted step
	useEffect(() => {
		if (step !== 'check-uncommitted') return;

		const checkUncommitted = async () => {
			try {
				// Find the worktree path for the source branch
				const worktrees = await Effect.runPromise(
					worktreeService.getWorktreesEffect(),
				);
				const sourceWorktree = worktrees.find(
					wt =>
						wt.branch && wt.branch.replace('refs/heads/', '') === sourceBranch,
				);

				if (sourceWorktree && hasUncommittedChanges(sourceWorktree.path)) {
					setStep('uncommitted-warning');
				} else {
					setStep('delete-confirm');
				}
			} catch {
				// On error, proceed to delete-confirm
				setStep('delete-confirm');
			}
		};

		checkUncommitted();
	}, [step, sourceBranch, worktreeService]);

	if (isLoading) {
		return (
			<Box flexDirection="column">
				<Text color="cyan">Loading worktrees...</Text>
			</Box>
		);
	}

	if (loadError) {
		return (
			<Box flexDirection="column">
				<Text color="red">Error loading worktrees:</Text>
				<Text color="red">{loadError}</Text>
				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('cancel')} to return to
						menu
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'select-source') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Merge Worktree
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select the source branch to merge:</Text>
				</Box>

				<SelectInput
					items={branchItems}
					onSelect={handleSelectSource}
					isFocused={true}
					limit={10}
				/>

				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'select-target') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Merge Worktree
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Merging from: <Text color="yellow">{sourceBranch}</Text>
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select the target branch to merge into:</Text>
				</Box>

				<SelectInput
					items={branchItems}
					onSelect={handleSelectTarget}
					isFocused={true}
					limit={10}
				/>

				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'select-operation') {
		const title = (
			<Text bold color="green">
				Select Operation
			</Text>
		);

		const message = (
			<Text>
				Choose how to integrate <Text color="yellow">{sourceBranch}</Text> into{' '}
				<Text color="yellow">{targetBranch}</Text>:
			</Text>
		);

		const hint = (
			<Text dimColor>
				Use ↑↓/j/k to navigate, Enter to select,{' '}
				{shortcutManager.getShortcutDisplay('cancel')} to cancel
			</Text>
		);

		const handleOperationSelect = (value: string) => {
			setOperation(value as 'merge' | 'rebase');
			setStep('confirm-merge');
		};

		return (
			<Confirmation
				title={title}
				message={message}
				options={[
					{label: 'Merge', value: 'merge', color: 'green'},
					{label: 'Rebase', value: 'rebase', color: 'blue'},
				]}
				onSelect={handleOperationSelect}
				initialIndex={0}
				hint={hint}
			/>
		);
	}

	if (step === 'confirm-merge') {
		const operationLabel = operation === 'rebase' ? 'Rebase' : 'Merge';
		const preposition = operation === 'rebase' ? 'onto' : 'into';

		const confirmMessage = (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Confirm {operationLabel}
					</Text>
				</Box>

				<Text>
					{operationLabel} <Text color="yellow">{sourceBranch}</Text>{' '}
					{preposition} <Text color="yellow">{targetBranch}</Text>?
				</Text>
			</Box>
		);

		return (
			<SimpleConfirmation
				message={confirmMessage}
				onConfirm={() => setStep('executing-merge')}
				onCancel={onCancel}
			/>
		);
	}

	if (step === 'executing-merge') {
		const executingLabel = operation === 'rebase' ? 'Rebasing' : 'Merging';
		return (
			<Box flexDirection="column">
				<Text color="green">{executingLabel} branches...</Text>
			</Box>
		);
	}

	if (step === 'merge-error') {
		const errorLabel = operation === 'rebase' ? 'Rebase' : 'Merge';
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="red">
						{errorLabel} Failed
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="red">{mergeError}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press any key to return to menu</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'check-uncommitted') {
		return (
			<Box flexDirection="column">
				<Text color="cyan">Checking for uncommitted changes...</Text>
			</Box>
		);
	}

	if (step === 'uncommitted-warning') {
		const warningTitle = (
			<Text bold color="yellow">
				Warning: Uncommitted Changes
			</Text>
		);

		const warningMessage = (
			<Box flexDirection="column">
				<Text>
					The source branch <Text color="yellow">{sourceBranch}</Text> has
					uncommitted changes that will be lost if you delete it.
				</Text>
				<Box marginTop={1}>
					<Text>Do you still want to delete it?</Text>
				</Box>
			</Box>
		);

		const warningHint = (
			<Text dimColor>
				Use ↑↓/j/k to navigate, Enter to select,{' '}
				{shortcutManager.getShortcutDisplay('cancel')} to cancel
			</Text>
		);

		const handleWarningSelect = (value: string) => {
			if (value === 'yes') {
				setStep('delete-confirm');
			} else {
				// User chose not to delete, complete without deletion
				onComplete();
			}
		};

		return (
			<Confirmation
				title={warningTitle}
				message={warningMessage}
				options={[
					{label: 'Yes', value: 'yes', color: 'green'},
					{label: 'No', value: 'no', color: 'red'},
				]}
				onSelect={handleWarningSelect}
				initialIndex={1} // Default to No for safety
				hint={warningHint}
				onCancel={onCancel}
			/>
		);
	}

	if (step === 'delete-confirm') {
		const deleteMessage = (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Delete Source Branch?
					</Text>
				</Box>

				<Text>
					Delete the merged branch <Text color="yellow">{sourceBranch}</Text>{' '}
					and its worktree?
				</Text>
			</Box>
		);

		return (
			<SimpleConfirmation
				message={deleteMessage}
				onConfirm={async () => {
					try {
						// Find the worktree path for the source branch
						const worktrees = await Effect.runPromise(
							worktreeService.getWorktreesEffect(),
						);
						const sourceWorktree = worktrees.find(
							wt =>
								wt.branch &&
								wt.branch.replace('refs/heads/', '') === sourceBranch,
						);

						if (sourceWorktree) {
							await Effect.runPromise(
								worktreeService.deleteWorktreeEffect(sourceWorktree.path, {
									deleteBranch: true,
								}),
							);
						}

						onComplete();
					} catch (err) {
						const errorMessage =
							err instanceof GitError
								? `Delete failed: ${err.stderr}`
								: err instanceof Error
									? err.message
									: 'Failed to delete worktree';
						setMergeError(errorMessage);
						setStep('merge-error');
					}
				}}
				onCancel={() => {
					// Skip deletion and complete
					onComplete();
				}}
			/>
		);
	}

	return null;
};

export default MergeWorktree;
