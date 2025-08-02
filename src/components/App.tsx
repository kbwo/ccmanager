import React, {useState, useEffect, useCallback} from 'react';
import {useApp, Box, Text} from 'ink';
import Menu from './Menu.js';
import ProjectList from './ProjectList.js';
import Session from './Session.js';
import NewWorktree from './NewWorktree.js';
import DeleteWorktree from './DeleteWorktree.js';
import MergeWorktree from './MergeWorktree.js';
import Configuration from './Configuration.js';
import PresetSelector from './PresetSelector.js';
import {SessionManager} from '../services/sessionManager.js';
import {globalSessionManager} from '../services/globalSessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {
	Worktree,
	Session as SessionType,
	DevcontainerConfig,
	GitProject,
} from '../types/index.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {configurationManager} from '../services/configurationManager.js';
import {ENV_VARS} from '../constants/env.js';
import {MULTI_PROJECT_ERRORS} from '../constants/error.js';
import {recentProjectsService} from '../services/recentProjectsService.js';

type View =
	| 'menu'
	| 'project-list'
	| 'session'
	| 'new-worktree'
	| 'creating-worktree'
	| 'delete-worktree'
	| 'deleting-worktree'
	| 'merge-worktree'
	| 'configuration'
	| 'preset-selector'
	| 'clearing';

interface AppProps {
	devcontainerConfig?: DevcontainerConfig;
	multiProject?: boolean;
}

const App: React.FC<AppProps> = ({devcontainerConfig, multiProject}) => {
	const {exit} = useApp();
	const [view, setView] = useState<View>(
		multiProject ? 'project-list' : 'menu',
	);
	const [sessionManager, setSessionManager] = useState<SessionManager>(() =>
		globalSessionManager.getManagerForProject(),
	);
	const [worktreeService, setWorktreeService] = useState(
		() => new WorktreeService(),
	);
	const [activeSession, setActiveSession] = useState<SessionType | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [menuKey, setMenuKey] = useState(0); // Force menu refresh
	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	); // Store selected worktree for preset selection
	const [selectedProject, setSelectedProject] = useState<GitProject | null>(
		null,
	); // Store selected project in multi-project mode

	// Helper function to clear terminal screen
	const clearScreen = () => {
		if (process.stdout.isTTY) {
			process.stdout.write('\x1B[2J\x1B[H');
		}
	};

	// Helper function to navigate with screen clearing
	const navigateWithClear = useCallback(
		(newView: View, callback?: () => void) => {
			clearScreen();
			setView('clearing');
			setTimeout(() => {
				setView(newView);
				if (callback) callback();
			}, 10); // Small delay to ensure screen clear is processed
		},
		[],
	);

	useEffect(() => {
		// Listen for session exits to return to menu automatically
		const handleSessionExit = (session: SessionType) => {
			// If the exited session is the active one, return to menu
			setActiveSession(current => {
				if (current && session.id === current.id) {
					// Session that exited is the active one, trigger return to menu
					setActiveSession(null);
					setError(null);

					const targetView =
						multiProject && selectedProject
							? 'menu'
							: multiProject
								? 'project-list'
								: 'menu';

					navigateWithClear(targetView, () => {
						setMenuKey(prev => prev + 1);
						process.stdin.resume();
						process.stdin.setEncoding('utf8');
					});
				}
				return current;
			});
		};

		sessionManager.on('sessionExit', handleSessionExit);

		// Re-attach listener when session manager changes
		return () => {
			sessionManager.off('sessionExit', handleSessionExit);
			// Don't destroy sessions on unmount - they persist in memory
		};
	}, [sessionManager, multiProject, selectedProject, navigateWithClear]);

	const handleSelectWorktree = async (worktree: Worktree) => {
		// Check if this is the new worktree option
		if (worktree.path === '') {
			navigateWithClear('new-worktree');
			return;
		}

		// Check if this is the delete worktree option
		if (worktree.path === 'DELETE_WORKTREE') {
			navigateWithClear('delete-worktree');
			return;
		}

		// Check if this is the merge worktree option
		if (worktree.path === 'MERGE_WORKTREE') {
			navigateWithClear('merge-worktree');
			return;
		}

		// Check if this is the configuration option
		if (worktree.path === 'CONFIGURATION') {
			navigateWithClear('configuration');
			return;
		}

		// Check if this is the exit application option
		if (worktree.path === 'EXIT_APPLICATION') {
			// In multi-project mode with a selected project, go back to project list
			if (multiProject && selectedProject) {
				handleBackToProjectList();
			} else {
				// Only destroy all sessions when actually exiting the app
				globalSessionManager.destroyAllSessions();
				exit();
			}
			return;
		}

		// Get or create session for this worktree
		let session = sessionManager.getSession(worktree.path);

		if (!session) {
			// Check if we should show preset selector
			if (configurationManager.getSelectPresetOnStart()) {
				setSelectedWorktree(worktree);
				navigateWithClear('preset-selector');
				return;
			}

			try {
				// Use preset-based session creation with default preset
				if (devcontainerConfig) {
					session = await sessionManager.createSessionWithDevcontainer(
						worktree.path,
						devcontainerConfig,
					);
				} else {
					session = await sessionManager.createSessionWithPreset(worktree.path);
				}
			} catch (error) {
				setError(`Failed to create session: ${error}`);
				return;
			}
		}

		setActiveSession(session);
		navigateWithClear('session');
	};

	const handlePresetSelected = async (presetId: string) => {
		if (!selectedWorktree) return;

		try {
			// Create session with selected preset
			let session: SessionType;
			if (devcontainerConfig) {
				session = await sessionManager.createSessionWithDevcontainer(
					selectedWorktree.path,
					devcontainerConfig,
					presetId,
				);
			} else {
				session = await sessionManager.createSessionWithPreset(
					selectedWorktree.path,
					presetId,
				);
			}
			setActiveSession(session);
			navigateWithClear('session');
			setSelectedWorktree(null);
		} catch (error) {
			setError(`Failed to create session: ${error}`);
			setView('menu');
			setSelectedWorktree(null);
		}
	};

	const handlePresetSelectorCancel = () => {
		setSelectedWorktree(null);
		navigateWithClear('menu', () => {
			setMenuKey(prev => prev + 1);
		});
	};

	const handleReturnToMenu = () => {
		setActiveSession(null);
		// Don't clear error here - let user dismiss it manually

		const targetView =
			multiProject && selectedProject
				? 'menu'
				: multiProject
					? 'project-list'
					: 'menu';

		navigateWithClear(targetView, () => {
			setMenuKey(prev => prev + 1); // Force menu refresh

			// Ensure stdin is in a clean state for Ink components
			if (process.stdin.isTTY) {
				// Flush any pending input to prevent escape sequences from leaking
				process.stdin.read();
				process.stdin.setRawMode(false);
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
			}
		});
	};

	const handleCreateWorktree = async (
		path: string,
		branch: string,
		baseBranch: string,
		copySessionData: boolean,
		copyClaudeDirectory: boolean,
	) => {
		setView('creating-worktree');
		setError(null);

		// Create the worktree
		const result = worktreeService.createWorktree(
			path,
			branch,
			baseBranch,
			copySessionData,
			copyClaudeDirectory,
		);

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

	const handleSelectProject = (project: GitProject) => {
		// Handle special exit case
		if (project.path === 'EXIT_APPLICATION') {
			globalSessionManager.destroyAllSessions();
			exit();
			return;
		}

		// Set the selected project and update services
		setSelectedProject(project);
		setWorktreeService(new WorktreeService(project.path));
		// Get or create session manager for this project
		const projectSessionManager = globalSessionManager.getManagerForProject(
			project.path,
		);
		setSessionManager(projectSessionManager);
		// Add to recent projects
		recentProjectsService.addRecentProject(project);
		navigateWithClear('menu');
	};

	const handleBackToProjectList = () => {
		// Sessions persist in their project-specific managers
		setSelectedProject(null);
		setWorktreeService(new WorktreeService()); // Reset to default
		// Reset to global session manager for project list view
		setSessionManager(globalSessionManager.getManagerForProject());

		navigateWithClear('project-list', () => {
			setMenuKey(prev => prev + 1);
		});
	};

	if (view === 'project-list' && multiProject) {
		const projectsDir = process.env[ENV_VARS.MULTI_PROJECT_ROOT];
		if (!projectsDir) {
			return (
				<Box>
					<Text color="red">Error: {MULTI_PROJECT_ERRORS.NO_PROJECTS_DIR}</Text>
				</Box>
			);
		}

		return (
			<ProjectList
				projectsDir={projectsDir}
				onSelectProject={handleSelectProject}
				error={error}
				onDismissError={() => setError(null)}
			/>
		);
	}

	if (view === 'menu') {
		return (
			<Menu
				key={menuKey}
				sessionManager={sessionManager}
				worktreeService={worktreeService}
				onSelectWorktree={handleSelectWorktree}
				onSelectRecentProject={handleSelectProject}
				error={error}
				onDismissError={() => setError(null)}
				projectName={selectedProject?.name}
				multiProject={multiProject}
			/>
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
					onComplete={handleReturnToMenu}
					onCancel={handleReturnToMenu}
				/>
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

	if (view === 'clearing') {
		// Render nothing during the clearing phase to ensure clean transition
		return null;
	}

	return null;
};

export default App;
