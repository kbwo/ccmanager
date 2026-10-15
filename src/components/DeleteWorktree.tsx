import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import {Effect} from 'effect';
import {Worktree} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import DeleteConfirmation from './DeleteConfirmation.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {useDynamicLimit} from '../hooks/useDynamicLimit.js';
import {filterWorktreesByQuery} from '../utils/filterByQuery.js';
import SearchableList from './SearchableList.js';
import {
	formatRelativeDate,
	getLastModified,
	isDeletableWorktree,
} from '../utils/worktreeUtils.js';

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
	// Row positions within menuItems: the cursor row and the first visible row
	const [cursorRow, setCursorRow] = useState(0);
	const [firstVisibleRow, setFirstVisibleRow] = useState(0);
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
					const deletableWorktrees = allWorktrees.filter(wt =>
						isDeletableWorktree(wt),
					);
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

	const lastModifiedLabels = useMemo(() => {
		const labels = worktrees.map(worktree => {
			const lastModified = getLastModified(worktree.path);
			return lastModified ? formatRelativeDate(lastModified) : '-';
		});
		const width = Math.max(0, ...labels.map(label => label.length));
		return labels.map(label => label.padEnd(width));
	}, [worktrees]);

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
				label: `${isSelected ? '[✓]' : '[ ]'} ${lastModifiedLabels[originalIndex]} ${branchName} (${worktree.path})`,
				value: originalIndex.toString(),
			};
		});

		setMenuItems(items);
	}, [worktrees, searchQuery, selectedIndices, lastModifiedLabels]);

	// A changed filter shows a different set of rows, so start from the top
	useEffect(() => {
		setCursorRow(0);
		setFirstVisibleRow(0);
	}, [searchQuery]);

	const rowCount = menuItems.length;
	// limit is NaN when the terminal height is unknown; show every row then
	const visibleRowCount = Math.min(limit, rowCount) || rowCount;
	const cursor = Math.max(0, Math.min(cursorRow, rowCount - 1));
	// Scroll only as far as needed to keep the given row visible
	const scrollToShow = (row: number) =>
		Math.max(
			0,
			Math.min(
				Math.max(firstVisibleRow, row - visibleRowCount + 1),
				row,
				rowCount - visibleRowCount,
			),
		);
	const firstVisible = scrollToShow(cursor);

	const moveCursorTo = (row: number) => {
		setCursorRow(row);
		setFirstVisibleRow(scrollToShow(row));
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

		if (rowCount > 0 && (input === 'k' || key.upArrow)) {
			moveCursorTo((cursor - 1 + rowCount) % rowCount);
		} else if (rowCount > 0 && (input === 'j' || key.downArrow)) {
			moveCursorTo((cursor + 1) % rowCount);
		} else if (/^[1-9]$/.test(input)) {
			// Number keys jump to the Nth visible row
			const row = firstVisible + parseInt(input, 10) - 1;
			if (row < firstVisible + visibleRowCount) {
				moveCursorTo(row);
			}
		} else if (input === ' ' && rowCount > 0) {
			// Toggle selection on space
			const focusedIndex = parseInt(menuItems[cursor]!.value, 10);
			setSelectedIndices(prev => {
				const newSet = new Set(prev);
				if (newSet.has(focusedIndex)) {
					newSet.delete(focusedIndex);
				} else {
					newSet.add(focusedIndex);
				}
				return newSet;
			});
			// Advance to the next row; stay put on the last one
			if (cursor < rowCount - 1) {
				moveCursorTo(cursor + 1);
			}
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
					Select worktrees to delete (Space to select, Enter to confirm). The
					time is when each worktree directory was last modified:
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
				{/* Hand-written list: ink-select-input cannot have its cursor moved from outside, which Space needs */}
				<Box flexDirection="column">
					{menuItems
						.slice(firstVisible, firstVisible + visibleRowCount)
						.map((item, index) => {
							const isCursorRow = firstVisible + index === cursor;
							return (
								<Box key={item.value}>
									<Text color={isCursorRow ? 'green' : undefined}>
										{isCursorRow ? '>' : ' '}
									</Text>
									<Text
										color={isCursorRow ? 'green' : undefined}
										inverse={isCursorRow}
										dimColor={!isCursorRow && !item.label.includes('[✓]')}
									>
										{item.label}
									</Text>
								</Box>
							);
						})}
				</Box>
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
