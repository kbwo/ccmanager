import React, {useState, useEffect} from 'react';
import {useApp, Box, Text} from 'ink';
import Menu from './Menu.js';
import Session from './Session.js';
import BashSession from './BashSession.js';
import NewWorktree from './NewWorktree.js';
import DeleteWorktree from './DeleteWorktree.js';
import MergeWorktree from './MergeWorktree.js';
import Configuration from './Configuration.js';
import PresetSelector from './PresetSelector.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {
	Worktree,
	Session as SessionType,
	TerminalMode,
} from '../types/index.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {configurationManager} from '../services/configurationManager.js';

type View =
	| 'menu'
	| 'session'
	| 'new-worktree'
	| 'creating-worktree'
	| 'delete-worktree'
	| 'deleting-worktree'
	| 'merge-worktree'
	| 'merging-worktree'
	| 'configuration'
	| 'preset-selector';

const App: React.FC = () => {
	const {exit} = useApp();
	const [view, setView] = useState<View>('menu');
	const [sessionMode, setSessionMode] = useState<TerminalMode>('claude');
	const [sessionManager] = useState(() => new SessionManager());
	const [worktreeService] = useState(() => new WorktreeService());
	const [activeSession, setActiveSession] = useState<SessionType | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [menuKey, setMenuKey] = useState(0); // Force menu refresh
	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	); // Store selected worktree for preset selection

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

	const handleSelectWorktree = async (worktree: Worktree) => {
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
			// Check if we should show preset selector
			if (configurationManager.getSelectPresetOnStart()) {
				setSelectedWorktree(worktree);
				setView('preset-selector');
				return;
			}

			try {
				// Use preset-based session creation with default preset
				session = await sessionManager.createSessionWithPreset(worktree.path);
			} catch (error) {
				setError(`Failed to create session: ${error}`);
				return;
			}
		}

		// Clear screen before entering session
		if (process.stdout.isTTY) {
			process.stdout.write('\x1B[2J\x1B[H');
		}

		setActiveSession(session);
		setSessionMode('claude'); // Always start in Claude mode
		setView('session');
	};

	const handlePresetSelected = async (presetId: string) => {
		if (!selectedWorktree) return;

		try {
			// Create session with selected preset
			const session = await sessionManager.createSessionWithPreset(
				selectedWorktree.path,
				presetId,
			);

			// Clear screen before entering session
			if (process.stdout.isTTY) {
				process.stdout.write('\x1B[2J\x1B[H');
			}

			setActiveSession(session);
			setSessionMode('claude');
			setView('session');
			setSelectedWorktree(null);
		} catch (error) {
			setError(`Failed to create session: ${error}`);
			setView('menu');
			setSelectedWorktree(null);
		}
	};

	const handlePresetSelectorCancel = () => {
		setSelectedWorktree(null);
		setView('menu');
		setMenuKey(prev => prev + 1);
	};

	const handleToggleMode = () => {
		// Clear screen before mode toggle to have a clean transition
		if (process.stdout.isTTY) {
			process.stdout.write('\x1B[2J\x1B[H');
		}
		setSessionMode(current => (current === 'claude' ? 'bash' : 'claude'));
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

	const handleDeleteWorktrees = async (
		worktreePaths: string[],
		deleteBranch: boolean,
	) => {
		setView('deleting-worktree');
		setError(null);

		// Delete the worktrees
		let hasError = false;
		for (const path of worktreePaths) {
			const result = worktreeService.deleteWorktree(path, {deleteBranch});
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
			<Menu
				key={menuKey}
				sessionManager={sessionManager}
				onSelectWorktree={handleSelectWorktree}
			/>
		);
	}

	if (view === 'session' && activeSession) {
		// SEPARATE COMPONENTS ARCHITECTURE: Route to Claude or Bash component
		const SessionComponent = sessionMode === 'claude' ? Session : BashSession;
		const currentModeDisplay = sessionMode === 'claude' ? 'Claude' : 'Bash';
		const toggleModeDisplay = sessionMode === 'claude' ? 'Bash' : 'Claude';

		return (
			<Box flexDirection="column" height="100%">
				<Box flexGrow={1}>
					<SessionComponent
						key={`${sessionMode}-${activeSession.id}`}
						session={activeSession}
						sessionManager={sessionManager}
						onToggleMode={handleToggleMode}
						onReturnToMenu={handleReturnToMenu}
					/>
				</Box>
				<Box
					borderStyle="single"
					borderColor={sessionMode === 'claude' ? 'blue' : 'green'}
					paddingX={1}
				>
					<Text color={sessionMode === 'claude' ? 'blue' : 'green'} bold>
						{currentModeDisplay}
					</Text>
					<Text dimColor>
						{' '}
						({shortcutManager.getShortcutDisplay('toggleMode')}:{' '}
						{toggleModeDisplay} |{' '}
						{shortcutManager.getShortcutDisplay('returnToMenu')}: Menu)
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

	if (view === 'preset-selector') {
		return (
			<PresetSelector
				onSelect={handlePresetSelected}
				onCancel={handlePresetSelectorCancel}
			/>
		);
	}

	return null;
};

export default App;
