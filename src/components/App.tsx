import React, {useState, useEffect} from 'react';
import {useApp, Box, Text} from 'ink';
import Menu from './Menu.js';
import Session from './Session.js';
import NewWorktree from './NewWorktree.js';
import DeleteWorktree from './DeleteWorktree.js';
import MergeWorktree from './MergeWorktree.js';
import Configuration from './Configuration.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {Worktree, Session as SessionType} from '../types/index.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {getDefaultWorktreesDir} from '../utils/defaultPaths.js';
import path from 'path';
import fs from 'fs';

type View =
	| 'menu'
	| 'session'
	| 'new-worktree'
	| 'creating-worktree'
	| 'delete-worktree'
	| 'deleting-worktree'
	| 'merge-worktree'
	| 'merging-worktree'
	| 'configuration';

interface AppProps {
	initialWorktreePath?: string;
	initialBranchName?: string;
	initialFromBranch?: string;
}

const App: React.FC<AppProps> = ({
	initialWorktreePath,
	initialBranchName,
	initialFromBranch,
}) => {
	const {exit} = useApp();
	const [view, setView] = useState<View>('menu');
	const [sessionManager] = useState(() => new SessionManager());
	const [worktreeService] = useState(() => new WorktreeService());
	const [activeSession, setActiveSession] = useState<SessionType | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [menuKey, setMenuKey] = useState(0); // Force menu refresh

	useEffect(() => {
		// Listen for session exits to return to menu automatically
		const handleSessionExit = (session: SessionType) => {
			// If the exited session is the active one, return to menu
			setActiveSession(current => {
				if (current && session.id === current.id) {
					// Session that exited is the active one, trigger return to menu
					setTimeout(() => {
						setActiveSession(null);
						setError(null);
						setView('menu');
						setMenuKey(prev => prev + 1);
						if (process.stdout.isTTY) {
							process.stdout.write('\x1B[2J\x1B[H');
						}
						process.stdin.resume();
						process.stdin.setEncoding('utf8');
					}, 0);
				}
				return current;
			});
		};

		sessionManager.on('sessionExit', handleSessionExit);

		// Cleanup on unmount
		return () => {
			sessionManager.off('sessionExit', handleSessionExit);
			sessionManager.destroy();
		};
	}, [sessionManager]);

	// Handle initial worktree path and branch from CLI arguments
	useEffect(() => {
		if (initialWorktreePath || initialBranchName) {
			// Get all available worktrees
			const worktrees = worktreeService.getWorktrees();

			let targetWorktree: Worktree | undefined;

			if (initialWorktreePath && initialBranchName) {
				// Both path and branch provided - find worktree that matches both
				const resolvedPath = path.resolve(initialWorktreePath);
				targetWorktree = worktrees.find(
					wt => wt.path === resolvedPath && wt.branch === initialBranchName,
				);
				if (!targetWorktree) {
					setError(
						`No worktree found at path '${initialWorktreePath}' with branch '${initialBranchName}'`,
					);
					return;
				}
			} else if (initialWorktreePath) {
				// Only path provided - validate and use the worktree at that path
				const resolvedPath = path.resolve(initialWorktreePath);
				targetWorktree = worktrees.find(wt => wt.path === resolvedPath);
				if (!targetWorktree) {
					// Path not in worktree list, but check if it's a valid git directory
					try {
						const stat = fs.statSync(resolvedPath);
						if (stat.isDirectory()) {
							const gitPath = path.join(resolvedPath, '.git');
							if (fs.existsSync(gitPath)) {
								// Valid git directory, create session directly
								const session = sessionManager.createSession(resolvedPath);
								setActiveSession(session);
								setView('session');
								return;
							}
						}
					} catch (_error) {
						// Path doesn't exist or is not accessible
					}
					setError(`Invalid worktree path: ${initialWorktreePath}`);
					return;
				}
			} else if (initialBranchName) {
				// Only branch provided - treat as new branch name to create
				// First check if a worktree with this branch already exists
				targetWorktree = worktrees.find(wt => wt.branch === initialBranchName);
				if (targetWorktree) {
					// Worktree already exists for this branch, open it
					const session = sessionManager.createSession(targetWorktree.path);
					setActiveSession(session);
					setView('session');
					return;
				}

				// Check if branch already exists in repository
				const allBranches = worktreeService.getAllBranches();
				if (allBranches.includes(initialBranchName)) {
					setError(
						`Branch '${initialBranchName}' already exists. Use --worktree to specify existing worktree path, or choose a different branch name.`,
					);
					return;
				}

				// Branch doesn't exist - create new branch and worktree
				const sanitizedBranch = initialBranchName
					.replace(/\//g, '-')
					.replace(/[^a-zA-Z0-9-_.]/g, '')
					.replace(/^-+|-+$/g, '')
					.toLowerCase();
				const worktreePath = path.join(
					getDefaultWorktreesDir(),
					sanitizedBranch,
				);

				// Use specified base branch or default
				const baseBranch =
					initialFromBranch || worktreeService.getDefaultBranch();

				// Validate that the base branch exists
				if (initialFromBranch && !allBranches.includes(initialFromBranch)) {
					setError(
						`Base branch '${initialFromBranch}' does not exist. Available branches: ${allBranches.join(', ')}`,
					);
					return;
				}

				// Create the worktree with new branch
				const result = worktreeService.createWorktree(
					worktreePath,
					initialBranchName,
					baseBranch,
				);
				if (result.success) {
					// Successfully created, open session for it
					const session = sessionManager.createSession(worktreePath);
					setActiveSession(session);
					setView('session');
					return;
				} else {
					setError(
						`Failed to create worktree for new branch '${initialBranchName}': ${result.error}`,
					);
					return;
				}
			}

			if (targetWorktree) {
				// Valid worktree found, create session and open it
				const session = sessionManager.createSession(targetWorktree.path);
				setActiveSession(session);
				setView('session');
			}
		}
	}, [
		initialWorktreePath,
		initialBranchName,
		initialFromBranch,
		sessionManager,
		worktreeService,
	]);

	const handleSelectWorktree = (worktree: Worktree) => {
		// Check if this is the new worktree option
		if (worktree.path === '') {
			setView('new-worktree');
			return;
		}

		// Check if this is the delete worktree option
		if (worktree.path === 'DELETE_WORKTREE') {
			setView('delete-worktree');
			return;
		}

		// Check if this is the merge worktree option
		if (worktree.path === 'MERGE_WORKTREE') {
			setView('merge-worktree');
			return;
		}

		// Check if this is the configuration option
		if (worktree.path === 'CONFIGURATION') {
			setView('configuration');
			return;
		}

		// Check if this is the exit application option
		if (worktree.path === 'EXIT_APPLICATION') {
			sessionManager.destroy();
			exit();
			return;
		}

		// Get or create session for this worktree
		let session = sessionManager.getSession(worktree.path);

		if (!session) {
			session = sessionManager.createSession(worktree.path);
		}

		setActiveSession(session);
		setView('session');
	};

	const handleReturnToMenu = () => {
		setActiveSession(null);
		setError(null);

		// Add a small delay to ensure Session cleanup completes
		setTimeout(() => {
			setView('menu');
			setMenuKey(prev => prev + 1); // Force menu refresh

			// Clear the screen when returning to menu
			if (process.stdout.isTTY) {
				process.stdout.write('\x1B[2J\x1B[H');
			}

			// Ensure stdin is in a clean state for Ink components
			if (process.stdin.isTTY) {
				// Flush any pending input to prevent escape sequences from leaking
				process.stdin.read();
				process.stdin.setRawMode(false);
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
			}
		}, 50); // Small delay to ensure proper cleanup
	};

	const handleCreateWorktree = async (
		path: string,
		branch: string,
		baseBranch: string,
	) => {
		setView('creating-worktree');
		setError(null);

		// Create the worktree
		const result = worktreeService.createWorktree(path, branch, baseBranch);

		if (result.success) {
			// Success - return to menu
			handleReturnToMenu();
		} else {
			// Show error
			setError(result.error || 'Failed to create worktree');
			setView('new-worktree');
		}
	};

	const handleCancelNewWorktree = () => {
		handleReturnToMenu();
	};

	const handleDeleteWorktrees = async (worktreePaths: string[]) => {
		setView('deleting-worktree');
		setError(null);

		// Delete the worktrees
		let hasError = false;
		for (const path of worktreePaths) {
			const result = worktreeService.deleteWorktree(path);
			if (!result.success) {
				hasError = true;
				setError(result.error || 'Failed to delete worktree');
				break;
			}
		}

		if (!hasError) {
			// Success - return to menu
			handleReturnToMenu();
		} else {
			// Show error
			setView('delete-worktree');
		}
	};

	const handleCancelDeleteWorktree = () => {
		handleReturnToMenu();
	};

	const handleMergeWorktree = async (
		sourceBranch: string,
		targetBranch: string,
		deleteAfterMerge: boolean,
		useRebase: boolean,
	) => {
		setView('merging-worktree');
		setError(null);

		// Perform the merge
		const mergeResult = worktreeService.mergeWorktree(
			sourceBranch,
			targetBranch,
			useRebase,
		);

		if (mergeResult.success) {
			// If user wants to delete the merged branch
			if (deleteAfterMerge) {
				const deleteResult =
					worktreeService.deleteWorktreeByBranch(sourceBranch);
				if (!deleteResult.success) {
					setError(deleteResult.error || 'Failed to delete merged worktree');
					setView('merge-worktree');
					return;
				}
			}
			// Success - return to menu
			handleReturnToMenu();
		} else {
			// Show error
			setError(mergeResult.error || 'Failed to merge branches');
			setView('merge-worktree');
		}
	};

	const handleCancelMergeWorktree = () => {
		handleReturnToMenu();
	};

	if (view === 'menu') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<Menu
					key={menuKey}
					sessionManager={sessionManager}
					onSelectWorktree={handleSelectWorktree}
				/>
			</Box>
		);
	}

	if (view === 'session' && activeSession) {
		return (
			<Box flexDirection="column">
				<Session
					key={activeSession.id}
					session={activeSession}
					sessionManager={sessionManager}
					onReturnToMenu={handleReturnToMenu}
				/>
				<Box marginTop={1}>
					<Text dimColor>
						Press {shortcutManager.getShortcutDisplay('returnToMenu')} to return
						to menu
					</Text>
				</Box>
			</Box>
		);
	}

	if (view === 'new-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<NewWorktree
					onComplete={handleCreateWorktree}
					onCancel={handleCancelNewWorktree}
				/>
			</Box>
		);
	}

	if (view === 'creating-worktree') {
		return (
			<Box flexDirection="column">
				<Text color="green">Creating worktree...</Text>
			</Box>
		);
	}

	if (view === 'delete-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<DeleteWorktree
					onComplete={handleDeleteWorktrees}
					onCancel={handleCancelDeleteWorktree}
				/>
			</Box>
		);
	}

	if (view === 'deleting-worktree') {
		return (
			<Box flexDirection="column">
				<Text color="red">Deleting worktrees...</Text>
			</Box>
		);
	}

	if (view === 'merge-worktree') {
		return (
			<Box flexDirection="column">
				{error && (
					<Box marginBottom={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
				<MergeWorktree
					onComplete={handleMergeWorktree}
					onCancel={handleCancelMergeWorktree}
				/>
			</Box>
		);
	}

	if (view === 'merging-worktree') {
		return (
			<Box flexDirection="column">
				<Text color="green">Merging worktrees...</Text>
			</Box>
		);
	}

	if (view === 'configuration') {
		return <Configuration onComplete={handleReturnToMenu} />;
	}

	return null;
};

export default App;
