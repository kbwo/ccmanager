import React, {useState, useEffect} from 'react';
import path from 'path';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Effect} from 'effect';
import {Worktree} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import DeleteConfirmation from './DeleteConfirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {useDynamicLimit} from '../hooks/useDynamicLimit.js';
import {filterWorktreesByQuery} from '../utils/filterByQuery.js';
import SearchableList from './SearchableList.js';

interface DeleteWorktreeProps {
	projectPath?: string;
	onComplete: (worktreePaths: string[], deleteBranch: boolean) => void;
	onCancel: () => void;
}

const DeleteWorktree: React.FC<DeleteWorktreeProps> = ({
	projectPath,
	onComplete,
	onCancel,
}) => {
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);
	const [confirmMode, setConfirmMode] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const [menuItems, setMenuItems] = useState<{label: string; value: string}[]>(
		[],
	);

	// Use the search mode hook
	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(menuItems.length, {
			isDisabled: confirmMode,
		});

	const limit = useDynamicLimit({
		isSearchMode,
		hasError: !!error,
	});

	useEffect(() => {
		let cancelled = false;

		const loadWorktrees = async () => {
			const worktreeService = new WorktreeService(projectPath);

			try {
				const allWorktrees = await Effect.runPromise(
					worktreeService.getWorktreesEffect(),
				);

				if (!cancelled) {
					// Filter out main worktree and current working directory worktree
					const resolvedCwd = path.resolve(process.cwd());
					const deletableWorktrees = allWorktrees.filter(wt => {
						if (wt.isMainWorktree) return false;
						const resolvedPath = path.resolve(wt.path);
						if (
							resolvedCwd === resolvedPath ||
							resolvedCwd.startsWith(resolvedPath + path.sep)
						) {
							return false;
						}
						return true;
					});
					setWorktrees(deletableWorktrees);
					setIsLoading(false);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : String(err));
					setIsLoading(false);
				}
			}
		};

		loadWorktrees();

		return () => {
			cancelled = true;
		};
	}, [projectPath]);

	// Build menu items from worktrees, filtering by search query
	useEffect(() => {
		const filteredWorktrees = filterWorktreesByQuery(worktrees, searchQuery);

		const items = filteredWorktrees.map(worktree => {
			const originalIndex = worktrees.indexOf(worktree);
			const branchName = worktree.branch
				? worktree.branch.replace('refs/heads/', '')
				: 'detached';
			const isSelected = selectedIndices.has(originalIndex);
			return {
				label: `${isSelected ? '[✓]' : '[ ]'} ${branchName} (${worktree.path})`,
				value: originalIndex.toString(),
			};
		});

		setMenuItems(items);
	}, [worktrees, searchQuery, selectedIndices]);

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

		// Don't process other keys if in search mode (handled by useSearchMode)
		if (isSearchMode) {
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

	if (isLoading) {
		return (
			<Box flexDirection="column">
				<Text color="cyan">Loading worktrees...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">Error loading worktrees:</Text>
				<Text color="red">{error}</Text>
				<Text dimColor>
					Press {shortcutManager.getShortcutDisplay('cancel')} to return to menu
				</Text>
			</Box>
		);
	}

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

			<SearchableList
				isSearchMode={isSearchMode}
				searchQuery={searchQuery}
				onSearchQueryChange={setSearchQuery}
				selectedIndex={selectedIndex}
				items={menuItems}
				limit={limit}
				placeholder="Type to filter worktrees..."
				noMatchMessage="No worktrees match your search"
			>
				<SelectInput
					items={menuItems}
					onSelect={handleSelect}
					onHighlight={(item: {value: string}) => {
						const index = parseInt(item.value, 10);
						setFocusedIndex(index);
					}}
					limit={limit}
					indicatorComponent={({isSelected}) => (
						<Text color={isSelected ? 'green' : undefined}>
							{isSelected ? '>' : ' '}
						</Text>
					)}
					itemComponent={({isSelected, label}) => {
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
			</SearchableList>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					{isSearchMode
						? 'Search Mode: Type to filter, Enter to exit search, ESC to exit search'
						: `Controls: ↑↓/j/k Navigate, Space Select, Enter Confirm, /-Search, ${shortcutManager.getShortcutDisplay('cancel')} Cancel`}
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
