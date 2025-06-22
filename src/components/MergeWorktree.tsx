import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {WorktreeService} from '../services/worktreeService.js';
import Confirmation from './Confirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface MergeWorktreeProps {
	onComplete: (
		sourceBranch: string,
		targetBranch: string,
		deleteAfterMerge: boolean,
		useRebase: boolean,
	) => void;
	onCancel: () => void;
}

type Step =
	| 'select-source'
	| 'select-target'
	| 'select-operation'
	| 'confirm-merge'
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
	const [useRebase, setUseRebase] = useState(false);
	const [operationFocused, setOperationFocused] = useState(false);

	useEffect(() => {
		const worktreeService = new WorktreeService();
		const loadedWorktrees = worktreeService.getWorktrees();

		// Create branch items for selection
		const items = loadedWorktrees.map(wt => ({
			label:
				wt.branch.replace('refs/heads/', '') +
				(wt.isMainWorktree ? ' (main)' : ''),
			value: wt.branch.replace('refs/heads/', ''),
		}));
		setBranchItems(items);
	}, []);

	useInput((input, key) => {
		// Handle escape key
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
			return;
		}

		// Handle hotkeys
		const keyPressed = input.toLowerCase();

		// Ctrl+M - proceed with merge (skip to confirmation if possible)
		if (key.ctrl && keyPressed === 'm') {
			if (sourceBranch && targetBranch) {
				setStep('confirm-merge');
			}
			return;
		}

		// T - cycle through target branch options (only in operation selection)
		if (keyPressed === 't' && step === 'select-operation') {
			setOperationFocused(!operationFocused);
			setUseRebase(!operationFocused);
			return;
		}

		// Enter - confirm selected option
		if (key.return) {
			if (step === 'select-operation') {
				setStep('confirm-merge');
			}
			return;
		}

		// Navigation for operation selection
		if (step === 'select-operation') {
			if (key.leftArrow || key.rightArrow) {
				const newOperationFocused = !operationFocused;
				setOperationFocused(newOperationFocused);
				setUseRebase(newOperationFocused);
			}
		}
	});

	const handleSelectSource = (item: BranchItem) => {
		setSourceBranch(item.value);
		// Filter out the selected source branch for target selection
		const filteredItems = branchItems.filter(b => b.value !== item.value);
		setBranchItems(filteredItems);
		setStep('select-target');
	};

	const handleSelectTarget = (item: BranchItem) => {
		setTargetBranch(item.value);
		setStep('select-operation');
	};

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
				/>

				<Box marginTop={1}>
					<Text dimColor>Hotkeys: Esc-Cancel Ctrl+M-Merge Enter-Confirm</Text>
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
				/>

				<Box marginTop={1}>
					<Text dimColor>Hotkeys: Esc-Cancel Ctrl+M-Merge Enter-Confirm</Text>
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
						Hotkeys: Esc-Cancel Ctrl+M-Merge T-Target Enter-Confirm
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
				onConfirm={() => setStep('delete-confirm')}
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
			<Confirmation
				message={deleteMessage}
				onConfirm={() =>
					onComplete(sourceBranch, targetBranch, true, useRebase)
				}
				onCancel={() =>
					onComplete(sourceBranch, targetBranch, false, useRebase)
				}
			/>
		);
	}

	return null;
};

export default MergeWorktree;
