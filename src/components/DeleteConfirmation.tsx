import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
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
	const [focusedOption, setFocusedOption] = useState<
		'deleteBranch' | 'keepBranch' | 'confirm' | 'cancel'
	>(hasAnyBranches ? 'deleteBranch' : 'confirm');

	// Helper functions for navigation
	const isRadioOption = (option: typeof focusedOption) =>
		option === 'deleteBranch' || option === 'keepBranch';

	const isActionButton = (option: typeof focusedOption) =>
		option === 'confirm' || option === 'cancel';

	const handleUpArrow = () => {
		if (!hasAnyBranches) {
			if (focusedOption === 'cancel') setFocusedOption('confirm');
			return;
		}

		const navigationMap = {
			keepBranch: 'deleteBranch',
			confirm: 'keepBranch',
			cancel: 'keepBranch',
		} as const;

		const next = navigationMap[focusedOption as keyof typeof navigationMap];
		if (next) setFocusedOption(next);
	};

	const handleDownArrow = () => {
		if (!hasAnyBranches) {
			if (focusedOption === 'confirm') setFocusedOption('cancel');
			return;
		}

		const navigationMap = {
			deleteBranch: 'keepBranch',
			keepBranch: 'confirm',
			confirm: 'cancel',
		} as const;

		const next = navigationMap[focusedOption as keyof typeof navigationMap];
		if (next) setFocusedOption(next);
	};

	const handleHorizontalArrow = (direction: 'left' | 'right') => {
		if (isActionButton(focusedOption)) {
			setFocusedOption(direction === 'left' ? 'confirm' : 'cancel');
		}
	};

	const handleSelect = () => {
		if (isRadioOption(focusedOption)) {
			setDeleteBranch(focusedOption === 'deleteBranch');
		} else if (focusedOption === 'confirm') {
			onConfirm(deleteBranch);
		} else if (focusedOption === 'cancel') {
			onCancel();
		}
	};

	useInput((input, key) => {
		if (key.upArrow) {
			handleUpArrow();
		} else if (key.downArrow) {
			handleDownArrow();
		} else if (key.leftArrow) {
			handleHorizontalArrow('left');
		} else if (key.rightArrow) {
			handleHorizontalArrow('right');
		} else if (input === ' ' && isRadioOption(focusedOption)) {
			setDeleteBranch(focusedOption === 'deleteBranch');
		} else if (key.return) {
			handleSelect();
		} else if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
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
							•{' '}
							{wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached'} (
							{wt.path})
						</Text>
					))
				) : (
					<>
						{worktrees.slice(0, 8).map(wt => (
							<Text key={wt.path} color="red">
								•{' '}
								{wt.branch ? wt.branch.replace('refs/heads/', '') : 'detached'} (
								{wt.path})
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
					<Box marginTop={1} flexDirection="column">
						<Box>
							<Text
								color={focusedOption === 'deleteBranch' ? 'red' : undefined}
								inverse={focusedOption === 'deleteBranch'}
							>
								{deleteBranch ? '(•)' : '( )'} Delete the branches too
							</Text>
						</Box>
						<Box>
							<Text
								color={focusedOption === 'keepBranch' ? 'green' : undefined}
								inverse={focusedOption === 'keepBranch'}
							>
								{!deleteBranch ? '(•)' : '( )'} Keep the branches
							</Text>
						</Box>
					</Box>
				</Box>
			)}

			<Box marginTop={1}>
				<Box marginRight={2}>
					<Text
						color={focusedOption === 'confirm' ? 'green' : 'white'}
						inverse={focusedOption === 'confirm'}
					>
						{' '}
						Confirm{' '}
					</Text>
				</Box>
				<Box>
					<Text
						color={focusedOption === 'cancel' ? 'red' : 'white'}
						inverse={focusedOption === 'cancel'}
					>
						{' '}
						Cancel{' '}
					</Text>
				</Box>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					Use ↑↓ to navigate options, Space/Enter to select,{' '}
					{shortcutManager.getShortcutDisplay('cancel')} to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default DeleteConfirmation;
