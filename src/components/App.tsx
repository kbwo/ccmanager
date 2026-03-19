import React, {useState, useEffect, useCallback} from 'react';
import {useApp, Box, Text} from 'ink';
import {Effect} from 'effect';
import Menu from './Menu.js';
import Dashboard from './Dashboard.js';
import Session from './Session.js';
import NewWorktree from './NewWorktree.js';
import DeleteWorktree from './DeleteWorktree.js';
import MergeWorktree from './MergeWorktree.js';
import Configuration from './Configuration.js';
import PresetSelector from './PresetSelector.js';
import RemoteBranchSelector from './RemoteBranchSelector.js';
import LoadingSpinner from './LoadingSpinner.js';
import type {NewWorktreeRequest} from './NewWorktree.js';
import SessionRename from './SessionRename.js';
import {SessionManager} from '../services/sessionManager.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {WorktreeService} from '../services/worktreeService.js';
import {
	worktreeNameGenerator,
	generateFallbackBranchName,
} from '../services/worktreeNameGenerator.js';
import {logger} from '../utils/logger.js';
import {
	Worktree,
	Session as ISession,
	DevcontainerConfig,
	GitProject,
	AmbiguousBranchError,
	RemoteBranchMatch,
} from '../types/index.js';
import {type AppError} from '../types/errors.js';
import {configReader} from '../services/config/configReader.js';
import {ConfigScope} from '../types/index.js';
import {ENV_VARS} from '../constants/env.js';
import {MULTI_PROJECT_ERRORS} from '../constants/error.js';
import {projectManager} from '../services/projectManager.js';
import {generateWorktreeDirectory} from '../utils/worktreeUtils.js';
import {sessionStore, type SessionMeta} from '../services/sessionStore.js';

type View =
	| 'menu'
	| 'project-list'
	| 'session'
	| 'new-worktree'
	| 'creating-worktree'
	| 'creating-session'
	| 'creating-session-preset'
	| 'delete-worktree'
	| 'deleting-worktree'
	| 'merge-worktree'
	| 'configuration'
	| 'preset-selector'
	| 'remote-branch-selector'
	| 'rename-session'
	| 'clearing';

interface AppProps {
	devcontainerConfig?: DevcontainerConfig;
	multiProject?: boolean;
	version: string;
}

const App: React.FC<AppProps> = ({
	devcontainerConfig,
	multiProject,
	version,
}) => {
	const {exit} = useApp();
	const [view, setView] = useState<View>(
		multiProject ? 'project-list' : 'menu',
	);
	const [sessionManager, setSessionManager] = useState<SessionManager>(() =>
		globalSessionOrchestrator.getManagerForProject(),
	);
	const [worktreeService, setWorktreeService] = useState(
		() => new WorktreeService(),
	);
	const [activeSession, setActiveSession] = useState<ISession | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [menuKey, setMenuKey] = useState(0); // Force menu refresh

	// Startup cleanup: remove stale session metas from previous runs.
	// On a fresh start no sessions are running, so this clears all leftover metas.
	useState(() => {
		sessionStore.cleanupStaleMetas(new Set());
	});
	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	); // Store selected worktree for preset selection
	const [renameSessionMeta, setRenameSessionMeta] =
		useState<SessionMeta | null>(null);
	const [selectedProject, setSelectedProject] = useState<GitProject | null>(
		null,
	); // Store selected project in multi-project mode
	const [configScope, setConfigScope] = useState<ConfigScope>('global'); // Store config scope for configuration view
	const [pendingMenuSessionLaunch, setPendingMenuSessionLaunch] = useState<{
		worktree: Worktree;
		presetId: string;
		initialPrompt: string;
	} | null>(null);

	// State for remote branch disambiguation
	const [pendingWorktreeCreation, setPendingWorktreeCreation] = useState<{
		path: string;
		branch: string;
		baseBranch: string;
		copySessionData: boolean;
		copyClaudeDirectory: boolean;
		presetId?: string;
		initialPrompt?: string;
		ambiguousError: AmbiguousBranchError;
	} | null>(null);

	// State for loading context - track flags for message composition
	const [loadingContext, setLoadingContext] = useState<{
		copySessionData?: boolean;
		deleteBranch?: boolean;
		isPromptFlow?: boolean;
		stage?: 'naming' | 'creating';
	}>({});

	// Helper function to format error messages based on error type using _tag discrimination
	const formatErrorMessage = (error: AppError): string => {
		switch (error._tag) {
			case 'ProcessError':
				return `Process error: ${error.message}`;
			case 'ConfigError':
				return `Configuration error (${error.reason}): ${error.details}`;
			case 'GitError':
				return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
			case 'FileSystemError':
				return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
			case 'ValidationError':
				return `Validation failed for ${error.field}: ${error.constraint}`;
		}
	};

	// Helper function to create session with Effect-based error handling
	const createSessionWithEffect = useCallback(
		async (
			worktreePath: string,
			presetId?: string,
			initialPrompt?: string,
			sessionMeta?: SessionMeta,
		): Promise<{
			success: boolean;
			session?: ISession;
			errorMessage?: string;
		}> => {
			// Create session meta if not provided
			const meta = sessionMeta ?? sessionStore.createSessionMeta(worktreePath);

			const sessionEffect = devcontainerConfig
				? sessionManager.createSessionWithDevcontainerEffect(
						worktreePath,
						devcontainerConfig,
						presetId,
						initialPrompt,
						meta,
					)
				: sessionManager.createSessionWithPresetEffect(
						worktreePath,
						presetId,
						initialPrompt,
						meta,
					);

			// Execute the Effect and handle both success and failure cases
			const result = await Effect.runPromise(Effect.either(sessionEffect));

			if (result._tag === 'Left') {
				// Clean up the meta we created on failure to prevent orphaned metas
				if (!sessionMeta) {
					sessionStore.removeSessionMeta(meta.id);
				}
				const errorMessage = formatErrorMessage(result.left);
				return {
					success: false,
					errorMessage: `Failed to create session: ${errorMessage}`,
				};
			}

			return {
				success: true,
				session: result.right,
			};
		},
		[sessionManager, devcontainerConfig],
	);

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

	const navigateToSession = useCallback((session: ISession) => {
		clearScreen();
		setView('clearing');
		setTimeout(() => {
			setActiveSession(session);
			setView('session');
		}, 10);
	}, []);

	const startSessionForWorktree = useCallback(
		async (
			worktree: Worktree,
			options?: {
				presetId?: string;
				initialPrompt?: string;
				sessionMeta?: SessionMeta;
				forceNew?: boolean;
			},
		) => {
			// If a sessionMeta is provided, try to find the existing running session
			if (options?.sessionMeta) {
				const existing = sessionManager.getSessionById(options.sessionMeta.id);
				if (existing) {
					navigateToSession(existing);
					return;
				}
				// Session meta exists but no running session — create with that meta
			}

			// Check if there are running sessions for this worktree.
			// Navigate to the first one found (matches old getSession(path) behavior).
			// Skip when forceNew is set (S key — always create new session).
			if (!options?.sessionMeta && !options?.forceNew) {
				const wtSessions = sessionManager.getSessionsForWorktree(worktree.path);
				if (wtSessions.length > 0 && wtSessions[0]) {
					navigateToSession(wtSessions[0]);
					return;
				}
			}

			if (!options?.presetId && configReader.getSelectPresetOnStart()) {
				setSelectedWorktree(worktree);
				navigateWithClear('preset-selector');
				return;
			}

			setView(
				options?.presetId ? 'creating-session-preset' : 'creating-session',
			);

			const result = await createSessionWithEffect(
				worktree.path,
				options?.presetId,
				options?.initialPrompt,
				options?.sessionMeta,
			);

			if (!result.success) {
				setError(result.errorMessage!);
				navigateWithClear('menu');
				return;
			}

			navigateToSession(result.session!);
		},
		[
			sessionManager,
			navigateWithClear,
			navigateToSession,
			createSessionWithEffect,
		],
	);

	useEffect(() => {
		// Listen for session exits to return to menu automatically
		const handleSessionExit = (session: ISession) => {
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
						// Ink's useInput in Menu will reconfigure stdin automatically
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

	useEffect(() => {
		if (view !== 'menu' || !pendingMenuSessionLaunch) {
			return;
		}

		let cancelled = false;

		void (async () => {
			if (cancelled) {
				return;
			}

			const launchRequest = pendingMenuSessionLaunch;
			setPendingMenuSessionLaunch(null);
			await startSessionForWorktree(launchRequest.worktree, {
				presetId: launchRequest.presetId,
				initialPrompt: launchRequest.initialPrompt,
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [view, pendingMenuSessionLaunch, startSessionForWorktree]);

	// Helper function to parse ambiguous branch error and create AmbiguousBranchError
	const parseAmbiguousBranchError = (
		errorMessage: string,
	): AmbiguousBranchError | null => {
		const pattern =
			/Ambiguous branch '(.+?)' found in multiple remotes: (.+?)\. Please specify which remote to use\./;
		const match = errorMessage.match(pattern);

		if (!match) {
			return null;
		}

		const branchName = match[1]!;
		const remoteRefsText = match[2]!;
		const remoteRefs = remoteRefsText.split(', ');

		// Parse remote refs into RemoteBranchMatch objects
		const matches: RemoteBranchMatch[] = remoteRefs.map(fullRef => {
			const parts = fullRef.split('/');
			const remote = parts[0]!;
			const branch = parts.slice(1).join('/');
			return {
				remote,
				branch,
				fullRef,
			};
		});

		return new AmbiguousBranchError(branchName, matches);
	};

	// Helper function to handle worktree creation results
	const handleWorktreeCreationResult = (
		result: {success: boolean; error?: string},
		creationData: {
			path: string;
			branch: string;
			baseBranch: string;
			copySessionData: boolean;
			copyClaudeDirectory: boolean;
			presetId?: string;
			initialPrompt?: string;
		},
	) => {
		if (result.success) {
			if (creationData.presetId && creationData.initialPrompt) {
				setPendingMenuSessionLaunch({
					worktree: {
						path: creationData.path,
						branch: creationData.branch,
						isMainWorktree: false,
						hasSession: false,
					},
					presetId: creationData.presetId,
					initialPrompt: creationData.initialPrompt,
				});
				handleReturnToMenu();
				return;
			}

			handleReturnToMenu();
			return;
		}

		const errorMessage = result.error || 'Failed to create worktree';
		const ambiguousError = parseAmbiguousBranchError(errorMessage);

		if (ambiguousError) {
			// Handle ambiguous branch error
			setPendingWorktreeCreation({
				...creationData,
				ambiguousError,
			});
			navigateWithClear('remote-branch-selector');
		} else {
			// Handle regular error
			setError(errorMessage);
			setView('new-worktree');
		}
	};

	const handleSelectWorktree = async (
		worktree: Worktree,
		sessionMeta?: SessionMeta,
	) => {
		// Check if this is the new worktree option
		if (worktree.path === '') {
			navigateWithClear('new-worktree');
			return;
		}

		// Check if this is a new session request
		if (worktree.path.startsWith('NEW_SESSION:')) {
			const worktreePath = worktree.path.substring('NEW_SESSION:'.length);
			await startSessionForWorktree(
				{
					path: worktreePath,
					branch: '',
					isMainWorktree: false,
					hasSession: true,
				},
				{forceNew: true},
			);
			return;
		}

		// Check if this is a rename session request
		if (worktree.path.startsWith('RENAME_SESSION:')) {
			const sessionId = worktree.path.substring('RENAME_SESSION:'.length);
			const meta = sessionMeta ?? sessionStore.getSessionMeta(sessionId);
			if (meta) {
				setRenameSessionMeta(meta);
				navigateWithClear('rename-session');
			}
			return;
		}

		// Check if this is a kill session request
		if (worktree.path.startsWith('KILL_SESSION:')) {
			const sessionId = worktree.path.substring('KILL_SESSION:'.length);
			// Destroy running session if exists
			const running = sessionManager.getSessionById(sessionId);
			if (running) {
				sessionManager.destroySession(sessionId);
			}
			// Also remove persisted meta
			sessionStore.removeSessionMeta(sessionId);
			// Refresh menu
			setMenuKey(prev => prev + 1);
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
			setConfigScope('global');
			navigateWithClear('configuration');
			return;
		}

		// Check if this is the project configuration option
		if (worktree.path === 'CONFIGURATION_PROJECT') {
			setConfigScope('project');
			navigateWithClear('configuration');
			return;
		}

		// Check if this is the global configuration option
		if (worktree.path === 'CONFIGURATION_GLOBAL') {
			setConfigScope('global');
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
				globalSessionOrchestrator.destroyAllSessions();
				exit();
			}
			return;
		}

		await startSessionForWorktree(worktree, {sessionMeta});
	};

	const handlePresetSelected = async (presetId: string) => {
		if (!selectedWorktree) return;

		// Set loading state before async operation
		setView('creating-session-preset');

		// Create session with selected preset using Effect
		const result = await createSessionWithEffect(
			selectedWorktree.path,
			presetId,
		);

		if (!result.success) {
			setError(result.errorMessage!);
			setView('menu');
			setSelectedWorktree(null);
			return;
		}

		// Success case
		navigateToSession(result.session!);
		setSelectedWorktree(null);
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
			// Ink's useInput in Menu will reconfigure stdin automatically
		});
	};

	const handleCreateWorktree = async (request: NewWorktreeRequest) => {
		setError(null);

		let branch = request.creationMode === 'manual' ? request.branch : '';
		let targetPath = request.path;
		if (request.creationMode === 'prompt') {
			setLoadingContext({
				copySessionData: request.copySessionData,
				isPromptFlow: true,
				stage: 'naming',
			});
			setView('creating-worktree');

			const allBranches = await Effect.runPromise(
				Effect.either(worktreeService.getAllBranchesEffect()),
			);
			const existingBranches =
				allBranches._tag === 'Right' ? allBranches.right : [];

			const generatedBranch = await Effect.runPromise(
				Effect.either(
					worktreeNameGenerator.generateBranchNameEffect(
						request.initialPrompt,
						request.baseBranch,
						existingBranches,
					),
				),
			);

			if (generatedBranch._tag === 'Left') {
				logger.warn(
					`Branch name generation failed, using fallback: ${formatErrorMessage(generatedBranch.left)}`,
				);
				branch = generateFallbackBranchName(existingBranches);
			} else {
				branch = generatedBranch.right;
			}
			if (request.autoDirectoryPattern) {
				targetPath = generateWorktreeDirectory(
					request.projectPath,
					branch,
					request.autoDirectoryPattern,
				);
			}
		}

		// Set loading context before showing loading view
		setLoadingContext({
			copySessionData: request.copySessionData,
			isPromptFlow: request.creationMode === 'prompt',
			stage: 'creating',
		});
		setView('creating-worktree');

		// Create the worktree using Effect
		const result = await Effect.runPromise(
			Effect.either(
				worktreeService.createWorktreeEffect(
					targetPath,
					branch,
					request.baseBranch,
					request.copySessionData,
					request.copyClaudeDirectory,
				),
			),
		);

		// Transform Effect result to legacy format for handleWorktreeCreationResult
		if (result._tag === 'Left') {
			// Handle error using pattern matching on _tag
			const errorMessage = formatErrorMessage(result.left);
			handleWorktreeCreationResult(
				{success: false, error: errorMessage},
				{
					path: targetPath,
					branch,
					baseBranch: request.baseBranch,
					copySessionData: request.copySessionData,
					copyClaudeDirectory: request.copyClaudeDirectory,
					presetId:
						request.creationMode === 'prompt' ? request.presetId : undefined,
					initialPrompt:
						request.creationMode === 'prompt'
							? request.initialPrompt
							: undefined,
				},
			);
		} else {
			// Success case
			const createdWorktree = result.right;
			handleWorktreeCreationResult(
				{success: true},
				{
					path: createdWorktree.path,
					branch: createdWorktree.branch || branch,
					baseBranch: request.baseBranch,
					copySessionData: request.copySessionData,
					copyClaudeDirectory: request.copyClaudeDirectory,
					presetId:
						request.creationMode === 'prompt' ? request.presetId : undefined,
					initialPrompt:
						request.creationMode === 'prompt'
							? request.initialPrompt
							: undefined,
				},
			);
		}
	};

	const handleCancelNewWorktree = () => {
		handleReturnToMenu();
	};

	const handleRemoteBranchSelected = async (selectedRemoteRef: string) => {
		if (!pendingWorktreeCreation) return;

		// Clear the pending creation data
		const creationData = pendingWorktreeCreation;
		setPendingWorktreeCreation(null);

		// Retry worktree creation with the resolved base branch
		// Set loading context before showing loading view
		setLoadingContext({
			copySessionData: creationData.copySessionData,
			isPromptFlow: Boolean(
				creationData.presetId && creationData.initialPrompt,
			),
			stage: 'creating',
		});
		setView('creating-worktree');
		setError(null);

		const result = await Effect.runPromise(
			Effect.either(
				worktreeService.createWorktreeEffect(
					creationData.path,
					creationData.branch,
					selectedRemoteRef, // Use the selected remote reference
					creationData.copySessionData,
					creationData.copyClaudeDirectory,
				),
			),
		);

		if (result._tag === 'Left') {
			// Handle error using pattern matching on _tag
			const errorMessage = formatErrorMessage(result.left);
			setError(errorMessage);
			setView('new-worktree');
		} else {
			handleWorktreeCreationResult(
				{success: true},
				{
					path: creationData.path,
					branch: creationData.branch,
					baseBranch: selectedRemoteRef,
					copySessionData: creationData.copySessionData,
					copyClaudeDirectory: creationData.copyClaudeDirectory,
					presetId: creationData.presetId,
					initialPrompt: creationData.initialPrompt,
				},
			);
		}
	};

	const handleRemoteBranchSelectorCancel = () => {
		// Clear pending data and return to new worktree form
		setPendingWorktreeCreation(null);
		setView('new-worktree');
	};

	const handleDeleteWorktrees = async (
		worktreePaths: string[],
		deleteBranch: boolean,
	) => {
		// Set loading context before showing loading view
		setLoadingContext({deleteBranch});
		setView('deleting-worktree');
		setError(null);

		// Delete the worktrees sequentially using Effect
		let hasError = false;
		for (const path of worktreePaths) {
			// Destroy any running sessions for this worktree
			const wtSessions = sessionManager.getSessionsForWorktree(path);
			for (const s of wtSessions) {
				sessionManager.destroySession(s.id);
			}
			// Remove persisted session metadata
			sessionStore.removeSessionsForWorktree(path);

			const result = await Effect.runPromise(
				Effect.either(
					worktreeService.deleteWorktreeEffect(path, {deleteBranch}),
				),
			);

			if (result._tag === 'Left') {
				// Handle error using pattern matching on _tag
				hasError = true;
				const errorMessage = formatErrorMessage(result.left);
				setError(errorMessage);
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
			globalSessionOrchestrator.destroyAllSessions();
			exit();
			return;
		}

		// Set the selected project and update services
		setSelectedProject(project);
		setWorktreeService(new WorktreeService(project.path));
		// Get or create session manager for this project
		const projectSessionManager =
			globalSessionOrchestrator.getManagerForProject(project.path);
		setSessionManager(projectSessionManager);
		// Add to recent projects
		projectManager.addRecentProject(project);
		navigateWithClear('menu');
	};

	const handleSelectSessionFromDashboard = (
		session: ISession,
		project: GitProject,
	) => {
		// Set the correct session manager for this project
		const projectSessionManager =
			globalSessionOrchestrator.getManagerForProject(project.path);
		setSessionManager(projectSessionManager);
		setWorktreeService(new WorktreeService(project.path));
		// Don't set selectedProject so session exit returns to Dashboard
		setActiveSession(session);
		navigateWithClear('session');
	};

	const handleBackToProjectList = () => {
		// Sessions persist in their project-specific managers
		setSelectedProject(null);
		setWorktreeService(new WorktreeService()); // Reset to default
		// Reset to global session manager for project list view
		setSessionManager(globalSessionOrchestrator.getManagerForProject());

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
			<Dashboard
				projectsDir={projectsDir}
				onSelectSession={handleSelectSessionFromDashboard}
				onSelectProject={handleSelectProject}
				error={error}
				onDismissError={() => setError(null)}
				version={version}
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
				version={version}
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
					projectPath={selectedProject?.path || process.cwd()}
					onComplete={handleCreateWorktree}
					onCancel={handleCancelNewWorktree}
				/>
			</Box>
		);
	}

	if (view === 'creating-worktree') {
		// Compose message based on loading context
		const message = loadingContext.isPromptFlow
			? loadingContext.stage === 'naming'
				? 'Generating branch name with Claude...'
				: 'Creating worktree from generated branch name...'
			: loadingContext.copySessionData
				? 'Creating worktree and copying session data...'
				: 'Creating worktree...';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color="cyan" />
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
					projectPath={selectedProject?.path}
					onComplete={handleDeleteWorktrees}
					onCancel={handleCancelDeleteWorktree}
				/>
			</Box>
		);
	}

	if (view === 'deleting-worktree') {
		// Compose message based on loading context
		const message = loadingContext.deleteBranch
			? 'Deleting worktrees and branches...'
			: 'Deleting worktrees...';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color="cyan" />
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
		return (
			<Configuration scope={configScope} onComplete={handleReturnToMenu} />
		);
	}

	if (view === 'rename-session' && renameSessionMeta) {
		return (
			<SessionRename
				sessionId={renameSessionMeta.id}
				currentName={renameSessionMeta.name}
				onRename={name => {
					sessionStore.renameSession(renameSessionMeta.id, name);
					// Also update the running session if it exists
					const runningSession = sessionManager.getSessionById(
						renameSessionMeta.id,
					);
					if (runningSession) {
						runningSession.sessionName = name;
					}
					setRenameSessionMeta(null);
					handleReturnToMenu();
				}}
				onCancel={() => {
					setRenameSessionMeta(null);
					handleReturnToMenu();
				}}
			/>
		);
	}

	if (view === 'preset-selector') {
		return (
			<PresetSelector
				onSelect={handlePresetSelected}
				onCancel={handlePresetSelectorCancel}
			/>
		);
	}

	if (view === 'remote-branch-selector' && pendingWorktreeCreation) {
		return (
			<RemoteBranchSelector
				branchName={pendingWorktreeCreation.ambiguousError.branchName}
				matches={pendingWorktreeCreation.ambiguousError.matches}
				onSelect={handleRemoteBranchSelected}
				onCancel={handleRemoteBranchSelectorCancel}
			/>
		);
	}

	if (view === 'creating-session') {
		// Compose message based on devcontainerConfig presence
		// Devcontainer operations take >5 seconds, so indicate extended duration
		const message = devcontainerConfig
			? 'Starting devcontainer (this may take a moment)...'
			: 'Creating session...';

		// Use yellow color for devcontainer operations (longer duration),
		// cyan for standard session creation
		const color = devcontainerConfig ? 'yellow' : 'cyan';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color={color} />
			</Box>
		);
	}

	if (view === 'creating-session-preset') {
		// Always display preset-specific message
		// Devcontainer operations take >5 seconds, so indicate extended duration
		const message = loadingContext.isPromptFlow
			? 'Creating session with preset and prompt...'
			: devcontainerConfig
				? 'Creating session with preset (this may take a moment)...'
				: 'Creating session with preset...';

		// Use yellow color for devcontainer, cyan for standard
		const color = devcontainerConfig ? 'yellow' : 'cyan';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color={color} />
			</Box>
		);
	}

	if (view === 'clearing') {
		// Render nothing during the clearing phase to ensure clean transition
		return null;
	}

	return null;
};

export default App;
