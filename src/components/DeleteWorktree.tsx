import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Worktree} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import DeleteConfirmation from './DeleteConfirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface DeleteWorktreeProps {
	onComplete: (worktreePaths: string[], deleteBranch: boolean) => void;
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
	const [confirmMode, setConfirmMode] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(0);

	useEffect(() => {
		const worktreeService = new WorktreeService();
		const allWorktrees = worktreeService.getWorktrees();
		// Filter out main worktree - we shouldn't delete it
		const deletableWorktrees = allWorktrees.filter(wt => !wt.isMainWorktree);
		setWorktrees(deletableWorktrees);
	}, []);

	// Create menu items from worktrees
	const menuItems = worktrees.map((worktree, index) => {
		const branchName = worktree.branch
			? worktree.branch.replace('refs/heads/', '')
			: 'detached';
		const isSelected = selectedIndices.has(index);
		return {
			label: `${isSelected ? '[✓]' : '[ ]'} ${branchName} (${worktree.path})`,
			value: index.toString(),
		};
	});

	const handleSelect = (item: {value: string}) => {
		// Don't toggle on Enter - this will be used to confirm
		// We'll handle Space key separately for toggling
		const index = parseInt(item.value, 10);
		setFocusedIndex(index);
	};

	useInput((input, key) => {
		if (confirmMode) {
			// Confirmation component handles input
			return;
		}

		if (input === ' ') {
			// Toggle selection on space
			setSelectedIndices(prev => {
				const newSet = new Set(prev);
				if (newSet.has(focusedIndex)) {
					newSet.delete(focusedIndex);
				} else {
					newSet.add(focusedIndex);
				}
				return newSet;
			});
		} else if (key.return && selectedIndices.size > 0) {
			setConfirmMode(true);
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

		const handleConfirm = (deleteBranch: boolean) => {
			const selectedPaths = Array.from(selectedIndices).map(
				index => worktrees[index]!.path,
			);
			onComplete(selectedPaths, deleteBranch);
		};

		const handleCancel = () => {
			setConfirmMode(false);
		};

		return (
			<DeleteConfirmation
				worktrees={selectedWorktrees}
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

			<SelectInput
				items={menuItems}
				onSelect={handleSelect}
				onHighlight={(item: {value: string}) => {
					const index = parseInt(item.value, 10);
					setFocusedIndex(index);
				}}
				limit={10}
				indicatorComponent={({isSelected}) => (
					<Text color={isSelected ? 'green' : undefined}>
						{isSelected ? '>' : ' '}
					</Text>
				)}
				itemComponent={({isSelected, label}) => {
					// Check if this item is actually selected (checkbox checked)
					const hasCheckmark = label.includes('[✓]');
					return (
						<Text
							color={isSelected ? 'green' : undefined}
							inverse={isSelected}
							dimColor={!isSelected && !hasCheckmark}
						>
							{label}
						</Text>
					);
				}}
			/>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					Controls: ↑↓/j/k Navigate, Space Select, Enter Confirm,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} Cancel
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
