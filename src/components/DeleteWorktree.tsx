import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {Worktree} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import Confirmation from './Confirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface DeleteWorktreeProps {
	onComplete: (worktreePaths: string[]) => void;
	onCancel: () => void;
}

const DeleteWorktree: React.FC<DeleteWorktreeProps> = ({
	onComplete,
	onCancel,
}) => {
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [confirmMode, setConfirmMode] = useState(false);

	useEffect(() => {
		const worktreeService = new WorktreeService();
		const allWorktrees = worktreeService.getWorktrees();
		// Filter out main worktree - we shouldn't delete it
		const deletableWorktrees = allWorktrees.filter(wt => !wt.isMainWorktree);
		setWorktrees(deletableWorktrees);
	}, []);

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			onCancel();
			return;
		}

		if (confirmMode) {
			// Confirmation component handles input
			return;
		}

		if (key.upArrow) {
			setFocusedIndex(prev => Math.max(0, prev - 1));
		} else if (key.downArrow) {
			setFocusedIndex(prev => Math.min(worktrees.length - 1, prev + 1));
		} else if (input === ' ') {
			// Toggle selection
			setSelectedIndices(prev => {
				const newSet = new Set(prev);
				if (newSet.has(focusedIndex)) {
					newSet.delete(focusedIndex);
				} else {
					newSet.add(focusedIndex);
				}
				return newSet;
			});
		} else if (key.return) {
			if (selectedIndices.size > 0) {
				setConfirmMode(true);
			}
		} else if (key.ctrl && input === 'd') {
			// Ctrl+D for quick delete (if items selected)
			if (selectedIndices.size > 0) {
				setConfirmMode(true);
			}
		} else if (input.toLowerCase() === 'f' && selectedIndices.size > 0) {
			// F for force delete - directly execute
			const selectedPaths = Array.from(selectedIndices).map(
				index => worktrees[index]!.path,
			);
			onComplete(selectedPaths);
		} else if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}
	});

	if (worktrees.length === 0) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">No worktrees available to delete.</Text>
				<Text dimColor>
					Press {shortcutManager.getShortcutDisplay('cancel')} to return to menu
				</Text>
			</Box>
		);
	}

	if (confirmMode) {
		const selectedWorktrees = Array.from(selectedIndices).map(
			index => worktrees[index]!,
		);

		const handleConfirm = () => {
			const selectedPaths = Array.from(selectedIndices).map(
				index => worktrees[index]!.path,
			);
			onComplete(selectedPaths);
		};

		const handleCancel = () => {
			setConfirmMode(false);
		};

		const confirmMessage = (
			<Box flexDirection="column">
				<Text bold color="red">
					⚠️ Delete Confirmation
				</Text>
				<Box marginTop={1} marginBottom={1} flexDirection="column">
					<Text>You are about to delete the following worktrees:</Text>
					{selectedWorktrees.map(wt => (
						<Text key={wt.path} color="red">
							• {wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached'}{' '}
							({wt.path})
						</Text>
					))}
				</Box>
				<Text bold>This will also delete their branches. Are you sure?</Text>
			</Box>
		);

		return (
			<Confirmation
				message={confirmMessage}
				onConfirm={handleConfirm}
				onCancel={handleCancel}
			/>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="red">
					Delete Worktrees
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Select worktrees to delete (Space to select, Enter to confirm):
				</Text>
			</Box>

			{worktrees.map((worktree, index) => {
				const isSelected = selectedIndices.has(index);
				const isFocused = index === focusedIndex;
				const branchName = worktree.branch
					? worktree.branch.replace('refs/heads/', '')
					: 'detached';

				return (
					<Box key={worktree.path}>
						<Text
							color={isFocused ? 'green' : undefined}
							inverse={isFocused}
							dimColor={!isFocused && !isSelected}
						>
							{isSelected ? '[✓]' : '[ ]'} {branchName} ({worktree.path})
						</Text>
					</Box>
				);
			})}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					Controls: ↑↓ Navigate, Space Select, Enter Confirm,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} Cancel | Hotkeys: Ctrl+D Delete F Force
				</Text>
				{selectedIndices.size > 0 && (
					<Text color="yellow">
						{selectedIndices.size} worktree{selectedIndices.size > 1 ? 's' : ''}{' '}
						selected
					</Text>
				)}
			</Box>
		</Box>
	);
};

export default DeleteWorktree;
