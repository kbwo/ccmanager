import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {WorktreeService} from '../services/worktreeService.js';
import Confirmation from './Confirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';

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
	const [operationFocused, setOperationFocused] = useState(false);
	const [mergeError, setMergeError] = useState<string | null>(null);
	const [worktreeService] = useState(() => new WorktreeService());

	useEffect(() => {
		const loadedWorktrees = worktreeService.getWorktrees();

		// Create branch items for selection
		const items = loadedWorktrees.map(wt => ({
			label:
				(wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached') +
				(wt.isMainWorktree ? ' (main)' : ''),
			value: wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached',
		}));
		setBranchItems(items);
		setOriginalBranchItems(items);
	}, [worktreeService]);

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
			return;
		}

		if (step === 'select-operation') {
			if (key.leftArrow || key.rightArrow) {
				const newOperationFocused = !operationFocused;
				setOperationFocused(newOperationFocused);
				setUseRebase(newOperationFocused);
			} else if (key.return) {
				setStep('confirm-merge');
			}
		}

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
			const result = worktreeService.mergeWorktree(
				sourceBranch,
				targetBranch,
				useRebase,
			);

			if (result.success) {
				// Merge successful, ask about deleting source branch
				setStep('delete-confirm');
			} else {
				// Merge failed, show error
				setMergeError(result.error || 'Merge operation failed');
				setStep('merge-error');
			}
		};

		performMerge();
	}, [step, sourceBranch, targetBranch, useRebase, worktreeService]);

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
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="green">
						Select Operation
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Choose how to integrate <Text color="yellow">{sourceBranch}</Text>{' '}
						into <Text color="yellow">{targetBranch}</Text>:
					</Text>
				</Box>

				<Box>
					<Box marginRight={2}>
						<Text
							color={!operationFocused ? 'green' : 'white'}
							inverse={!operationFocused}
						>
							{' '}
							Merge{' '}
						</Text>
					</Box>
					<Box>
						<Text
							color={operationFocused ? 'blue' : 'white'}
							inverse={operationFocused}
						>
							{' '}
							Rebase{' '}
						</Text>
					</Box>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Use ← → to navigate, Enter to select,{' '}
						{shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
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
			<Confirmation
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
			<Confirmation
				message={deleteMessage}
				onConfirm={() => {
					const deleteResult =
						worktreeService.deleteWorktreeByBranch(sourceBranch);
					if (deleteResult.success) {
						onComplete();
					} else {
						setMergeError(deleteResult.error || 'Failed to delete worktree');
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
