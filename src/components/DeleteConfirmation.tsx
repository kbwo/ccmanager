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
	const [view, setView] = useState<'options' | 'actions'>(
		hasAnyBranches ? 'options' : 'actions',
	);

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
		if (item.value === 'deleteBranch') {
			setDeleteBranch(true);
		} else {
			setDeleteBranch(false);
		}
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
		} else if (hasAnyBranches && view === 'options' && key.tab) {
			// Switch from options to actions
			setView('actions');
		} else if (hasAnyBranches && view === 'actions' && key.shift && key.tab) {
			// Switch from actions back to options
			setView('options');
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

			{hasAnyBranches && (
				<Box marginBottom={1} flexDirection="column">
					<Text bold>What do you want to do with the associated branches?</Text>
					<Box marginTop={1}>
						{view === 'options' ? (
							<SelectInput
								items={branchOptions}
								onSelect={handleBranchSelect}
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
						) : (
							<Box flexDirection="column">
								{branchOptions.map(option => (
									<Text key={option.value} dimColor>
										{option.label}
									</Text>
								))}
							</Box>
						)}
					</Box>
				</Box>
			)}

			<Box marginTop={1}>
				{view === 'actions' || !hasAnyBranches ? (
					<SelectInput
						items={actionOptions}
						onSelect={handleActionSelect}
						initialIndex={0}
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
				) : (
					<Box>
						<Box marginRight={2}>
							<Text dimColor> Confirm </Text>
						</Box>
						<Box>
							<Text dimColor> Cancel </Text>
						</Box>
					</Box>
				)}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					Use ↑↓/j/k to navigate, Space/Enter to select
					{hasAnyBranches ? ', Tab to switch sections' : ''},{' '}
					{shortcutManager.getShortcutDisplay('cancel')} to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default DeleteConfirmation;
