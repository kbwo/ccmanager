import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {shortcutManager} from '../services/shortcutManager.js';

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

	// Menu items for actions
	const actionOptions = [
		{label: 'Confirm', value: 'confirm'},
		{label: 'Cancel', value: 'cancel'},
	];

	const handleBranchSelect = (item: {value: string}) => {
		// Don't toggle on Enter - only update focused option
		setFocusedOption(item.value as 'deleteBranch' | 'keepBranch');
	};

	const handleActionSelect = (item: {value: string}) => {
		if (item.value === 'confirm') {
			onConfirm(deleteBranch);
		} else {
			onCancel();
		}
	};

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		} else if (hasAnyBranches && view === 'options' && key.return) {
			// Move to confirm view when Enter is pressed in options
			setView('confirm');
		} else if (hasAnyBranches && view === 'confirm' && key.escape) {
			// Go back to options when Escape is pressed in confirm
			setView('options');
		} else if (hasAnyBranches && view === 'options' && input === ' ') {
			// Toggle selection on space for radio buttons
			if (focusedOption === 'deleteBranch') {
				setDeleteBranch(true);
			} else {
				setDeleteBranch(false);
			}
		}
	});

	return (
		<Box flexDirection="column">
			<Text bold color="red">
				⚠️ Delete Confirmation
			</Text>

			<Box marginTop={1} marginBottom={1} flexDirection="column">
				<Text>You are about to delete the following worktrees:</Text>
				{worktrees.length <= 10 ? (
					worktrees.map(wt => (
						<Text key={wt.path} color="red">
							• {wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached'}{' '}
							({wt.path})
						</Text>
					))
				) : (
					<>
						{worktrees.slice(0, 8).map(wt => (
							<Text key={wt.path} color="red">
								•{' '}
								{wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached'}{' '}
								({wt.path})
							</Text>
						))}
						<Text color="red" dimColor>
							... and {worktrees.length - 8} more worktrees
						</Text>
					</>
				)}
			</Box>

			{hasAnyBranches && view === 'options' && (
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
			)}

			{hasAnyBranches && view === 'confirm' && (
				<Box marginBottom={1} flexDirection="column">
					<Text bold>Branch option selected:</Text>
					<Text color="yellow">
						{deleteBranch ? '✓ Delete the branches too' : '✓ Keep the branches'}
					</Text>
				</Box>
			)}

			{(view === 'confirm' || !hasAnyBranches) && (
				<Box marginTop={1}>
					<SelectInput
						items={actionOptions}
						onSelect={handleActionSelect}
						initialIndex={1} // Default to Cancel for safety
						indicatorComponent={({isSelected}) => (
							<Text>{isSelected ? '>' : ' '}</Text>
						)}
						itemComponent={({isSelected, label}) => {
							const color = label === 'Confirm' ? 'green' : 'red';
							return (
								<Text color={isSelected ? color : 'white'} inverse={isSelected}>
									{' '}
									{label}{' '}
								</Text>
							);
						}}
					/>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>
					{hasAnyBranches && view === 'options' ? (
						<>
							Use ↑↓/j/k to navigate, Space to toggle, Enter to continue,{' '}
							{shortcutManager.getShortcutDisplay('cancel')} to cancel
						</>
					) : view === 'confirm' ? (
						<>
							Use ↑↓/j/k to navigate, Enter to select
							{hasAnyBranches ? ', Esc to go back' : ''},{' '}
							{shortcutManager.getShortcutDisplay('cancel')} to cancel
						</>
					) : (
						<>
							Use ↑↓/j/k to navigate, Enter to select,{' '}
							{shortcutManager.getShortcutDisplay('cancel')} to cancel
						</>
					)}
				</Text>
			</Box>
		</Box>
	);
};

export default DeleteConfirmation;
