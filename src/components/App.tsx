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
	const [menuKey, setMenuKey] = useState(0);
	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	);

	useEffect(() => {
		// Listen for session exits to return to menu automatically
		const handleSessionExit = (session: SessionType) => {
			setActiveSession(current => {
				if (current && session.id === current.id) {
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

		return () => {
			sessionManager.off('sessionExit', handleSessionExit);
			sessionManager.destroy();
		};
	}, [sessionManager]);

	const handleSelectWorktree = async (worktree: Worktree) => {
		// Handle special menu options
		if (worktree.path === '') {
			setView('new-worktree');
			return;
		}

		if (worktree.path === 'DELETE_WORKTREE') {
			setView('delete-worktree');
			return;
		}

		if (worktree.path === 'MERGE_WORKTREE') {
			setView('merge-worktree');
			return;
		}

		if (worktree.path === 'CONFIGURATION') {
			setView('configuration');
			return;
		}

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

		setActiveSession(session);
		setSessionMode('claude'); // Always start in Claude mode
		setView('session');
	};

	const handlePresetSelected = async (presetId: string) => {
		if (!selectedWorktree) return;

		try {
			const session = await sessionManager.createSessionWithPreset(
				selectedWorktree.path,
				presetId,
			);
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
		setSessionMode(current => (current === 'claude' ? 'bash' : 'claude'));
	};

	const handleReturnToMenu = () => {
		setActiveSession(null);
		setError(null);

		setTimeout(() => {
			setView('menu');
			setMenuKey(prev => prev + 1);

			if (process.stdout.isTTY) {
				process.stdout.write('\x1B[2J\x1B[H');
			}

			if (process.stdin.isTTY) {
				process.stdin.read();
				process.stdin.setRawMode(false);
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
			}
		}, 50);
	};

	const handleCreateWorktree = async (
		path: string,
		branch: string,
		baseBranch: string,
	) => {
		setView('creating-worktree');
		setError(null);

		const result = worktreeService.createWorktree(path, branch, baseBranch);

		if (result.success) {
			handleReturnToMenu();
		} else {
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
			handleReturnToMenu();
		} else {
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

		const mergeResult = worktreeService.mergeWorktree(
			sourceBranch,
			targetBranch,
			useRebase,
		);

		if (mergeResult.success) {
			if (deleteAfterMerge) {
				const deleteResult =
					worktreeService.deleteWorktreeByBranch(sourceBranch);
				if (!deleteResult.success) {
					setError(deleteResult.error || 'Failed to delete merged worktree');
					setView('merge-worktree');
					return;
				}
			}
			handleReturnToMenu();
		} else {
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
		if (sessionMode === 'claude') {
			return (
				<Session
					key={`claude-${activeSession.id}`}
					session={activeSession}
					sessionManager={sessionManager}
					onToggleMode={handleToggleMode}
					onReturnToMenu={handleReturnToMenu}
				/>
			);
		} else {
			return (
				<BashSession
					key={`bash-${activeSession.id}`}
					session={activeSession}
					sessionManager={sessionManager}
					onToggleMode={handleToggleMode}
					onReturnToMenu={handleReturnToMenu}
				/>
			);
		}
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
