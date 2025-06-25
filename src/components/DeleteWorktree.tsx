import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
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
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [confirmMode, setConfirmMode] = useState(false);
	const [forceDelete, setForceDelete] = useState(false);
	const VIEWPORT_SIZE = 10; // Maximum number of items to display at once
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

		// Handle escape key
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
			return;
		}

		// Handle hotkeys
		const keyPressed = input.toLowerCase();

		if (key.ctrl && keyPressed === 'd') {
			// Ctrl+D - proceed with deletion (skip selection step if any selected)
			if (selectedIndices.size > 0) {
				setConfirmMode(true);
			}
			return;
		}

		if (keyPressed === 'f') {
			// F - toggle force deletion option
			setForceDelete(prev => !prev);
			return;
		}

		if (key.return) {
			// Enter - confirm selected worktree for deletion
			if (selectedIndices.size > 0) {
				setConfirmMode(true);
			}
			return;
		}

		// Navigation and selection
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

			{(() => {
				// Calculate viewport window
				const viewportStart = Math.max(
					0,
					Math.min(
						focusedIndex - Math.floor(VIEWPORT_SIZE / 2),
						worktrees.length - VIEWPORT_SIZE,
					),
				);
				const viewportEnd = Math.min(
					viewportStart + VIEWPORT_SIZE,
					worktrees.length,
				);
				const visibleWorktrees = worktrees.slice(viewportStart, viewportEnd);

				return (
					<>
						{viewportStart > 0 && (
							<Text dimColor>↑ {viewportStart} more...</Text>
						)}
						{visibleWorktrees.map((worktree, relativeIndex) => {
							const actualIndex = viewportStart + relativeIndex;
							const isSelected = selectedIndices.has(actualIndex);
							const isFocused = actualIndex === focusedIndex;
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
						{viewportEnd < worktrees.length && (
							<Text dimColor>↓ {worktrees.length - viewportEnd} more...</Text>
						)}
					</>
				);
			})()}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					Controls: ↑↓ Navigate, Space Select, Enter Confirm,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} Cancel
				</Text>
				<Text dimColor>Hotkeys: Ctrl+D-Delete F-Force</Text>
				{selectedIndices.size > 0 && (
					<Text color="yellow">
						{selectedIndices.size} worktree{selectedIndices.size > 1 ? 's' : ''}{' '}
						selected{forceDelete ? ' (force deletion)' : ''}
					</Text>
				)}
			</Box>
		</Box>
	);
};

export default DeleteWorktree;
