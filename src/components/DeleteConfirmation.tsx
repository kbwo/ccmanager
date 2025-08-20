import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {shortcutManager} from '../services/shortcutManager.js';
import Confirmation from './Confirmation.js';

interface DeleteConfirmationProps {
	worktrees: Array<{path: string; branch?: string}>;
	onConfirm: (deleteBranch: boolean) => void;
	onCancel: () => void;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
	worktrees,
	onConfirm,
	onCancel,
}) => {
	// Check if any worktrees have branches
	const hasAnyBranches = worktrees.some(wt => wt.branch);

	const [deleteBranch, setDeleteBranch] = useState(true);
	const [view, setView] = useState<'options' | 'confirm'>(
		hasAnyBranches ? 'options' : 'confirm',
	);
	const [focusedOption, setFocusedOption] = useState<
		'deleteBranch' | 'keepBranch'
	>(deleteBranch ? 'deleteBranch' : 'keepBranch');

	// Menu items for branch options
	const branchOptions = [
		{
			label: `${deleteBranch ? '(•)' : '( )'} Delete the branches too`,
			value: 'deleteBranch',
		},
		{
			label: `${!deleteBranch ? '(•)' : '( )'} Keep the branches`,
			value: 'keepBranch',
		},
	];

	const handleBranchSelect = (item: {value: string}) => {
		// Don't toggle on Enter - only update focused option
		setFocusedOption(item.value as 'deleteBranch' | 'keepBranch');
	};

	const handleActionSelect = (value: string) => {
		if (value === 'confirm') {
			onConfirm(deleteBranch);
		} else {
			onCancel();
		}
	};

	// Handle keyboard input for branch options view
	const handleBranchOptionsInput = (
		input: string,
		key: {[key: string]: boolean},
	): boolean => {
		if (key['return']) {
			// Move to confirm view when Enter is pressed
			setView('confirm');
			return true;
		} else if (input === ' ') {
			// Toggle selection on space for radio buttons
			if (focusedOption === 'deleteBranch') {
				setDeleteBranch(true);
			} else {
				setDeleteBranch(false);
			}
			return true;
		}
		return false;
	};

	useInput((input, key) => {
		if (hasAnyBranches && view === 'options') {
			if (handleBranchOptionsInput(input, key)) {
				return;
			}
			if (shortcutManager.matchesShortcut('cancel', input, key)) {
				onCancel();
			}
		}
	});

	// Title component
	const title = (
		<Text bold color="red">
			⚠️ Delete Confirmation
		</Text>
	);

	// Message component
	const message = (
		<Box flexDirection="column">
			<Text>You are about to delete the following worktrees:</Text>
			{worktrees.length <= 10 ? (
				worktrees.map(wt => (
					<Text key={wt.path} color="red">
						• {wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached'} (
						{wt.path})
					</Text>
				))
			) : (
				<>
					{worktrees.slice(0, 8).map(wt => (
						<Text key={wt.path} color="red">
							• {wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached'}{' '}
							({wt.path})
						</Text>
					))}
					<Text color="red" dimColor>
						... and {worktrees.length - 8} more worktrees
					</Text>
				</>
			)}
		</Box>
	);

	if (hasAnyBranches && view === 'options') {
		return (
			<Box flexDirection="column">
				{title}
				<Box marginTop={1} marginBottom={1}>
					{message}
				</Box>

				<Box marginBottom={1} flexDirection="column">
					<Text bold>What do you want to do with the associated branches?</Text>
					<Box marginTop={1}>
						<SelectInput
							items={branchOptions}
							onSelect={handleBranchSelect}
							onHighlight={(item: {value: string}) => {
								setFocusedOption(item.value as 'deleteBranch' | 'keepBranch');
							}}
							initialIndex={deleteBranch ? 0 : 1}
							indicatorComponent={({isSelected}) => (
								<Text color={isSelected ? 'red' : undefined}>
									{isSelected ? '>' : ' '}
								</Text>
							)}
							itemComponent={({isSelected, label}) => (
								<Text
									color={isSelected ? 'red' : undefined}
									inverse={isSelected}
								>
									{label}
								</Text>
							)}
						/>
					</Box>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Use ↑↓/j/k to navigate, Space to toggle, Enter to continue,{' '}
						{shortcutManager.getShortcutDisplay('cancel')} to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// Confirmation view (either after selecting branch option or if no branches)
	const confirmHint = (
		<Text dimColor>
			Use ↑↓/j/k to navigate, Enter to select,{' '}
			{shortcutManager.getShortcutDisplay('cancel')} to cancel
		</Text>
	);

	const confirmMessage = (
		<Box flexDirection="column">
			{message}
			{hasAnyBranches && view === 'confirm' && (
				<Box marginTop={1} flexDirection="column">
					<Text bold>Branch option selected:</Text>
					<Text color="yellow">
						{deleteBranch ? '✓ Delete the branches too' : '✓ Keep the branches'}
					</Text>
				</Box>
			)}
		</Box>
	);

	return (
		<Confirmation
			title={title}
			message={confirmMessage}
			options={[
				{label: 'Confirm', value: 'confirm', color: 'green'},
				{label: 'Cancel', value: 'cancel', color: 'red'},
			]}
			onSelect={handleActionSelect}
			initialIndex={1} // Default to Cancel for safety
			hint={confirmHint}
			onCancel={onCancel}
			onEscape={
				hasAnyBranches && view === 'confirm'
					? () => setView('options')
					: undefined
			}
		/>
	);
};

export default DeleteConfirmation;
