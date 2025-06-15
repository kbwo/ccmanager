import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {shortcutManager} from '../services/shortcutManager.js';
import {configurationManager} from '../services/configurationManager.js';
import {generateWorktreeDirectory} from '../utils/worktreeUtils.js';

interface NewWorktreeProps {
	onComplete: (path: string, branch: string) => void;
	onCancel: () => void;
}

type Step = 'path' | 'branch';

const NewWorktree: React.FC<NewWorktreeProps> = ({onComplete, onCancel}) => {
	const worktreeConfig = configurationManager.getWorktreeConfig();
	const isAutoDirectory = worktreeConfig.autoDirectory;

	// Adjust initial step based on auto directory mode
	const [step, setStep] = useState<Step>(isAutoDirectory ? 'branch' : 'path');
	const [path, setPath] = useState('');
	const [branch, setBranch] = useState('');
	const [generatedPath, setGeneratedPath] = useState('');

	useInput((input, key) => {
		if (shortcutManager.matchesShortcut('cancel', input, key)) {
			onCancel();
		}
	});

	const handlePathSubmit = (value: string) => {
		if (value.trim()) {
			setPath(value.trim());
			setStep('branch');
		}
	};

	const handleBranchSubmit = (value: string) => {
		if (value.trim()) {
			setBranch(value.trim());
			if (isAutoDirectory) {
				// Generate path from branch name
				const autoPath = generateWorktreeDirectory(
					value.trim(),
					worktreeConfig.autoDirectoryPattern,
				);
				onComplete(autoPath, value.trim());
			} else {
				onComplete(path, value.trim());
			}
		}
	};

	// Update generated path preview when branch changes in auto mode
	useEffect(() => {
		if (isAutoDirectory && branch) {
			const autoPath = generateWorktreeDirectory(
				branch,
				worktreeConfig.autoDirectoryPattern,
			);
			setGeneratedPath(autoPath);
		}
	}, [branch, isAutoDirectory, worktreeConfig.autoDirectoryPattern]);

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					Create New Worktree
				</Text>
			</Box>

			{step === 'path' && !isAutoDirectory ? (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Enter worktree path (relative to repository root):</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInput
							value={path}
							onChange={setPath}
							onSubmit={handlePathSubmit}
							placeholder="e.g., ../myproject-feature"
						/>
					</Box>
				</Box>
			) : step === 'branch' && !isAutoDirectory ? (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Enter branch name for worktree at <Text color="cyan">{path}</Text>
							:
						</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInput
							value={branch}
							onChange={setBranch}
							onSubmit={handleBranchSubmit}
							placeholder="e.g., feature/new-feature"
						/>
					</Box>
				</Box>
			) : (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Enter branch name (directory will be auto-generated):</Text>
					</Box>
					<Box>
						<Text color="cyan">{'> '}</Text>
						<TextInput
							value={branch}
							onChange={setBranch}
							onSubmit={handleBranchSubmit}
							placeholder="e.g., feature/new-feature"
						/>
					</Box>
					{generatedPath && (
						<Box marginTop={1}>
							<Text dimColor>
								Worktree will be created at: <Text color="green">{generatedPath}</Text>
							</Text>
						</Box>
					)}
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>
					Press {shortcutManager.getShortcutDisplay('cancel')} to cancel
				</Text>
			</Box>
		</Box>
	);
};

export default NewWorktree;
