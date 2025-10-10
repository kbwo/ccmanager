import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Effect} from 'effect';
import {WorktreeService} from '../services/worktreeService.js';
import Confirmation, {SimpleConfirmation} from './Confirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {GitError} from '../types/errors.js';

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
	const [useRebase, setUseRebase] = useState(false);
	const [mergeError, setMergeError] = useState<string | null>(null);
	const [worktreeService] = useState(() => new WorktreeService());
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
						value: wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached',
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
						useRebase,
					),
				);

				// Merge successful, ask about deleting source branch
				setStep('delete-confirm');
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
	}, [step, sourceBranch, targetBranch, useRebase, worktreeService]);

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
						Press {shortcutManager.getShortcutDisplay('cancel')} to return to menu
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
			setUseRebase(value === 'rebase');
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
		const confirmMessage = (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Confirm {useRebase ? 'Rebase' : 'Merge'}
					</Text>
				</Box>

				<Text>
					{useRebase ? 'Rebase' : 'Merge'}{' '}
					<Text color="yellow">{sourceBranch}</Text>{' '}
					{useRebase ? 'onto' : 'into'}{' '}
					<Text color="yellow">{targetBranch}</Text>?
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
		return (
			<Box flexDirection="column">
				<Text color="green">
					{useRebase ? 'Rebasing' : 'Merging'} branches...
				</Text>
			</Box>
		);
	}

	if (step === 'merge-error') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="red">
						{useRebase ? 'Rebase' : 'Merge'} Failed
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
