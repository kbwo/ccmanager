import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {shortcutManager} from '../services/shortcutManager.js';

interface DeleteConfirmationProps {
	worktrees: Array<{path: string; branch: string}>;
	onConfirm: (deleteBranch: boolean) => void;
	onCancel: () => void;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
	worktrees,
	onConfirm,
	onCancel,
}) => {
	const [deleteBranch, setDeleteBranch] = useState(true);
	const [focusedOption, setFocusedOption] = useState<
		'deleteBranch' | 'keepBranch' | 'confirm' | 'cancel'
	>('deleteBranch');

	useInput((input, key) => {
		if (key.upArrow) {
			switch (focusedOption) {
				case 'keepBranch':
					setFocusedOption('deleteBranch');
					break;
				case 'confirm':
				case 'cancel':
					setFocusedOption('keepBranch');
					break;
			}
		} else if (key.downArrow) {
			switch (focusedOption) {
				case 'deleteBranch':
					setFocusedOption('keepBranch');
					break;
				case 'keepBranch':
					setFocusedOption('confirm');
					break;
				case 'confirm':
					setFocusedOption('cancel');
					break;
			}
		} else if (
			key.leftArrow &&
			(focusedOption === 'confirm' || focusedOption === 'cancel')
		) {
			setFocusedOption('confirm');
		} else if (
			key.rightArrow &&
			(focusedOption === 'confirm' || focusedOption === 'cancel')
		) {
			setFocusedOption('cancel');
		} else if (
			input === ' ' &&
			(focusedOption === 'deleteBranch' || focusedOption === 'keepBranch')
		) {
			setDeleteBranch(focusedOption === 'deleteBranch');
		} else if (key.return) {
			if (focusedOption === 'deleteBranch' || focusedOption === 'keepBranch') {
				setDeleteBranch(focusedOption === 'deleteBranch');
			} else if (focusedOption === 'confirm') {
				onConfirm(deleteBranch);
			} else if (focusedOption === 'cancel') {
				onCancel();
			}
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
				{worktrees.map(wt => (
					<Text key={wt.path} color="red">
						• {wt.branch.replace('refs/heads/', '')} ({wt.path})
					</Text>
				))}
			</Box>

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
