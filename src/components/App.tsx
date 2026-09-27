import React, {useState, useEffect, useCallback, useRef} from 'react';
import {useApp, useInput, Box, Text} from 'ink';
import {Effect, type Either} from 'effect';
import Menu, {type MenuSnapshot} from './Menu.js';
import Dashboard from './Dashboard.js';
import Session from './Session.js';
import NewWorktree from './NewWorktree.js';
import DeleteWorktree from './DeleteWorktree.js';
import DeleteConfirmation from './DeleteConfirmation.js';
import Confirmation from './Confirmation.js';
import MergeWorktree from './MergeWorktree.js';
import Configuration from './Configuration.js';
import PresetSelector from './PresetSelector.js';
import RemoteBranchSelector from './RemoteBranchSelector.js';
import LoadingSpinner from './LoadingSpinner.js';
import type {NewWorktreeRequest} from './NewWorktree.js';
import SessionRename from './SessionRename.js';
import SessionActions, {type SessionActionType} from './SessionActions.js';
import RestoreSessions from './RestoreSessions.js';
import {SessionManager} from '../services/sessionManager.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {WorktreeService} from '../services/worktreeService.js';
import {
	worktreeNameGenerator,
	generateFallbackBranchName,
} from '../services/worktreeNameGenerator.js';
import {logger} from '../utils/logger.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {
	Worktree,
	Session as ISession,
	DevcontainerConfig,
	GitProject,
	MenuAction,
	AmbiguousBranchError,
	CreateWorktreeResult,
} from '../types/index.js';
import {type AppError, type ProcessError} from '../types/errors.js';
import {formatErrorMessage} from '../utils/errorMessage.js';
import {getCurrentRepositoryRoot} from '../utils/gitUtils.js';
import type {SessionRecord} from '../services/sessionRestoreStore.js';
import {
	discardRestorableSessions,
	listRestorableSessions,
	restoreSessions,
} from '../services/sessionRestorer.js';
import {configReader} from '../services/config/configReader.js';
import {ConfigScope} from '../types/index.js';
import {ENV_VARS} from '../constants/env.js';
import {MULTI_PROJECT_ERRORS} from '../constants/error.js';
import {projectManager} from '../services/projectManager.js';
import {
	worktreeCreationTracker,
	describeWorktreeCreationStage,
} from '../services/worktreeCreationTracker.js';
import {useWorktreeCreationJobs} from '../hooks/useWorktreeCreationJobs.js';
import {
	generateWorktreeDirectory,
	isDeletableWorktree,
} from '../utils/worktreeUtils.js';

type View =
	| 'menu'
	| 'project-list'
	| 'restore-sessions'
	| 'restoring-sessions'
	| 'session'
	| 'new-worktree'
	| 'creating-worktree'
	| 'worktree-hook-error'
	| 'creating-session'
	| 'creating-session-preset'
	| 'delete-worktree'
	| 'confirm-delete-worktree'
	| 'deleting-worktree'
	| 'merge-worktree'
	| 'configuration'
	| 'preset-selector'
	| 'remote-branch-selector'
	| 'rename-session'
	| 'name-new-session'
	| 'session-actions'
	| 'confirm-exit'
	| 'clearing';

/** Everything needed to create one worktree once its branch name is known. */
interface WorktreeCreationData {
	path: string;
	branch: string;
	baseBranch: string;
	copySessionData: boolean;
	copyClaudeDirectory: boolean;
	presetId?: string;
	initialPrompt?: string;
}

type WorktreeCreationEither = Either.Either<
	CreateWorktreeResult,
	AppError | AmbiguousBranchError
>;

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
	const [sessionManager, setSessionManager] = useState<SessionManager>(() =>
		globalSessionOrchestrator.getManagerForProject(),
	);
	const [worktreeService, setWorktreeService] = useState(
		() => new WorktreeService(),
	);
	// Sessions that were open when ccmanager last ran and can be started again.
	// Single-project mode only considers the repository being opened;
	// multi-project mode considers every recorded project at once.
	const [restorableSessions, setRestorableSessions] = useState<SessionRecord[]>(
		() =>
			listRestorableSessions(
				multiProject ? {} : {projectPath: getCurrentRepositoryRoot()},
			),
	);
	const [view, setView] = useState<View>(() =>
		restorableSessions.length > 0
			? 'restore-sessions'
			: multiProject
				? 'project-list'
				: 'menu',
	);
	const [activeSession, setActiveSession] = useState<ISession | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [worktreeHookError, setWorktreeHookError] = useState<string | null>(
		null,
	);
	const [menuKey, setMenuKey] = useState(0); // Force menu refresh
	const [menuSnapshots, setMenuSnapshots] = useState<
		Record<string, MenuSnapshot>
	>({});

	const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(
		null,
	); // Store selected worktree for preset selection
	// Name entered for the session about to be created via the preset
	// selector, carried alongside selectedWorktree until creation completes.
	const [pendingSessionName, setPendingSessionName] = useState<
		string | undefined
	>(undefined);
	const [renameTarget, setRenameTarget] = useState<{
		id: string;
		name?: string;
	} | null>(null);
	// Worktree awaiting a session name before an additional session is
	// started on it (only used when the worktree already has a session).
	const [pendingNewSessionWorktree, setPendingNewSessionWorktree] =
		useState<Worktree | null>(null);
	const [sessionActionsTarget, setSessionActionsTarget] = useState<{
		worktreePath: string;
		session?: ISession;
		// Present only when the actions menu was opened from a menu row, which is
		// the only entry point that knows the worktree; the Dashboard opens it
		// from a session alone and therefore offers no worktree deletion.
		worktree?: Worktree;
	} | null>(null);
	// Worktree awaiting confirmation of the per-row delete action
	const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(
		null,
	);
	const [selectedProject, setSelectedProject] = useState<GitProject | null>(
		null,
	); // Store selected project in multi-project mode
	const [configScope, setConfigScope] = useState<ConfigScope>('global'); // Store config scope for configuration view
	// Where to return to if the user cancels the exit confirmation
	const [exitConfirmSource, setExitConfirmSource] = useState<
		'menu' | 'project-list'
	>('menu');
	const [pendingMenuSessionLaunch, setPendingMenuSessionLaunch] = useState<{
		worktree: Worktree;
		presetId: string;
		initialPrompt: string;
	} | null>(null);

	// State for remote branch disambiguation
	const [pendingWorktreeCreation, setPendingWorktreeCreation] = useState<
		(WorktreeCreationData & {ambiguousError: AmbiguousBranchError}) | null
	>(null);

	// State for loading context - track flags for message composition
	const [loadingContext, setLoadingContext] = useState<{
		deleteBranch?: boolean;
		isPromptFlow?: boolean;
	}>({});

	// The worktree creation the user is watching on the 'creating-worktree'
	// screen. Pressing Return clears it and returns to the menu: the creation keeps
	// running, and because nobody is waiting on it any more it reports its
	// outcome on the menu instead of navigating. Kept in a ref as well because
	// the creation reads it after awaiting, when a render-time value is stale.
	const waitingCreationJobIdRef = useRef<string | null>(null);
	const [waitingCreationJobId, setWaitingCreationJobIdState] = useState<
		string | null
	>(null);
	const setWaitingCreationJobId = useCallback((id: string | null) => {
		waitingCreationJobIdRef.current = id;
		setWaitingCreationJobIdState(id);
	}, []);
	const creationJobs = useWorktreeCreationJobs();
	const waitingCreationJob = creationJobs.find(
		job => job.id === waitingCreationJobId,
	);

	// State for streaming devcontainer up logs
	const [devcontainerLogs, setDevcontainerLogs] = useState<string[]>([]);
	// False for a moment after entering a screen that reacts to a key press, so
	// a key press left over from the previous screen (e.g. the Return that
	// submitted the New Worktree form) does not trigger it immediately.
	const [acceptsScreenInput, setAcceptsScreenInput] = useState(false);
	const menuSnapshotKey = selectedProject?.path ?? process.cwd();

	const handleMenuSnapshotChange = useCallback(
		(snapshot: MenuSnapshot) => {
			setMenuSnapshots(previous => ({
				...previous,
				[menuSnapshotKey]: snapshot,
			}));
		},
		[menuSnapshotKey],
	);

	const updateMenuSnapshot = useCallback(
		(update: (snapshot: MenuSnapshot) => MenuSnapshot) => {
			setMenuSnapshots(previous => {
				const current = previous[menuSnapshotKey];
				if (!current) {
					return previous;
				}

				return {
					...previous,
					[menuSnapshotKey]: update(current),
				};
			});
		},
		[menuSnapshotKey],
	);

	useEffect(() => {
		setAcceptsScreenInput(false);
		if (view !== 'worktree-hook-error' && view !== 'creating-worktree') {
			return;
		}

		const timeout = setTimeout(() => {
			setAcceptsScreenInput(true);
		}, 100);

		return () => {
			clearTimeout(timeout);
		};
	}, [view]);

	useInput(
		() => {
			if (!acceptsScreenInput) {
				return;
			}

			setWorktreeHookError(null);
			handleReturnToMenu();
		},
		{isActive: view === 'worktree-hook-error'},
	);

	useInput(
		(_input, key) => {
			if (!acceptsScreenInput || !key.return) {
				return;
			}

			setWaitingCreationJobId(null);
			handleReturnToMenu();
		},
		{isActive: view === 'creating-worktree'},
	);

	const formatPostCreationHookWarning = (error: ProcessError): string =>
		`Post-creation hook failed: ${error.message}`;

	const formatPreCreationHookError = (error: AppError): string =>
		error._tag === 'ProcessError'
			? `Pre-creation hook failed: ${error.message}`
			: formatErrorMessage(error);

	// Helper function to create session with Effect-based error handling
	const createSessionWithEffect = useCallback(
		async (
			worktreePath: string,
			presetId?: string,
			initialPrompt?: string,
			sessionName?: string,
			// Off for sessions started in the background, whose devcontainer logs
			// would otherwise leak into whatever loading screen is showing.
			showDevcontainerLogs = true,
		): Promise<{
			success: boolean;
			session?: ISession;
			errorMessage?: string;
		}> => {
			if (showDevcontainerLogs) {
				setDevcontainerLogs([]);
			}
			const sessionEffect = devcontainerConfig
				? sessionManager.createSessionWithDevcontainerEffect(
						worktreePath,
						devcontainerConfig,
						presetId,
						initialPrompt,
						showDevcontainerLogs
							? (line: string) => {
									setDevcontainerLogs(prev => {
										const next = [...prev, line];
										// Keep only the last 10 lines to avoid unbounded growth
										return next.length > 10 ? next.slice(-10) : next;
									});
								}
							: undefined,
						sessionName,
					)
				: sessionManager.createSessionWithPresetEffect(
						worktreePath,
						presetId,
						initialPrompt,
						sessionName,
					);

			const result = await Effect.runPromise(Effect.either(sessionEffect));

			if (result._tag === 'Left') {
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

	// The view the app starts on once the restore offer is out of the way.
	const initialView: View = multiProject ? 'project-list' : 'menu';

	const handleRestorePreviousSessions = useCallback(() => {
		const records = restorableSessions;
		setRestorableSessions([]);
		setView('restoring-sessions');

		void (async () => {
			const outcome = await restoreSessions(records, {
				multiProject: !!multiProject,
			});

			if (outcome.failures.length > 0) {
				setError(
					`Could not restore ${outcome.failures.length} of ${records.length} sessions: ${outcome.failures
						.map(
							failure => `${failure.record.worktreePath} (${failure.message})`,
						)
						.join(', ')}`,
				);
			}

			navigateWithClear(initialView, () => {
				setMenuKey(prev => prev + 1);
			});
		})();
	}, [restorableSessions, multiProject, initialView, navigateWithClear]);

	const handleDiscardPreviousSessions = useCallback(() => {
		discardRestorableSessions(restorableSessions);
		setRestorableSessions([]);
		navigateWithClear(initialView);
	}, [restorableSessions, initialView, navigateWithClear]);

	const startSessionForWorktree = useCallback(
		async (
			worktree: Worktree,
			options?: {
				presetId?: string;
				initialPrompt?: string;
				session?: ISession;
				forceNew?: boolean;
				sessionName?: string;
			},
		) => {
			// If a specific session is provided, navigate to it directly
			if (options?.session) {
				navigateToSession(options.session);
				return;
			}

			// Check if there are running sessions for this worktree.
			// Navigate to the first one found (matches old getSession(path) behavior).
			// Skip when forceNew is set (S key — always create new session).
			if (!options?.forceNew) {
				const wtSessions = sessionManager.getSessionsForWorktree(worktree.path);
				if (wtSessions.length > 0 && wtSessions[0]) {
					navigateToSession(wtSessions[0]);
					return;
				}
			}

			if (!options?.presetId && configReader.getSelectPresetOnStart()) {
				setSelectedWorktree(worktree);
				setPendingSessionName(options?.sessionName);
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
				options?.sessionName,
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

	const handleMenuAction = async (action: MenuAction) => {
		switch (action.type) {
			case 'newWorktree':
				navigateWithClear('new-worktree');
				return;
			case 'newSession':
				setPendingNewSessionWorktree({
					path: action.worktreePath,
					branch: '',
					isMainWorktree: false,
					hasSession: true,
				});
				navigateWithClear('name-new-session');
				return;
			case 'renameSession':
				setRenameTarget({
					id: action.session.id,
					name: action.session.sessionName,
				});
				navigateWithClear('rename-session');
				return;
			case 'killSession':
				sessionManager.destroySession(action.sessionId);
				setMenuKey(prev => prev + 1);
				return;
			case 'sessionActions':
				setSessionActionsTarget({
					worktreePath: action.worktree.path,
					session: action.session,
					worktree: action.worktree,
				});
				navigateWithClear('session-actions');
				return;
			case 'deleteWorktree':
				navigateWithClear('delete-worktree');
				return;
			case 'mergeWorktree':
				navigateWithClear('merge-worktree');
				return;
			case 'configuration':
				setConfigScope(action.scope);
				navigateWithClear('configuration');
				return;
			case 'exit':
				if (multiProject && selectedProject) {
					handleBackToProjectList();
				} else {
					setExitConfirmSource('menu');
					navigateWithClear('confirm-exit');
				}
				return;
			case 'selectWorktree':
				await startSessionForWorktree(action.worktree, {
					session: action.session,
				});
				return;
		}
	};

	const handlePresetSelected = async (presetId: string) => {
		if (!selectedWorktree) return;

		const sessionName = pendingSessionName;

		// Set loading state before async operation
		setView('creating-session-preset');

		// Create session with selected preset using Effect
		const result = await createSessionWithEffect(
			selectedWorktree.path,
			presetId,
			undefined,
			sessionName,
		);

		if (!result.success) {
			setError(result.errorMessage!);
			setView('menu');
			setSelectedWorktree(null);
			setPendingSessionName(undefined);
			return;
		}

		// Success case
		navigateToSession(result.session!);
		setSelectedWorktree(null);
		setPendingSessionName(undefined);
	};

	const handlePresetSelectorCancel = () => {
		setSelectedWorktree(null);
		setPendingSessionName(undefined);
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

	const addCreatedWorktreeToMenuSnapshot = (created: WorktreeCreationData) => {
		updateMenuSnapshot(snapshot => ({
			...snapshot,
			worktrees: [
				...snapshot.worktrees.filter(
					worktree => worktree.path !== created.path,
				),
				{
					path: created.path,
					branch: created.branch,
					isMainWorktree: false,
					hasSession: false,
				},
			],
		}));
	};

	/**
	 * Starts tracking a new worktree creation and shows the waiting screen for
	 * it. The user can leave that screen with Return while the creation continues.
	 */
	const startWaitingForCreation = (
		job: Parameters<typeof worktreeCreationTracker.start>[0],
	): string => {
		const jobId = worktreeCreationTracker.start(job);
		setWaitingCreationJobId(jobId);
		setView('creating-worktree');
		return jobId;
	};

	/**
	 * Reports the outcome of a creation the user sent to the background. The
	 * user may be anywhere by now (another screen, a session, another project),
	 * so this never navigates: problems surface through the error message the
	 * menu shows, and the new worktree appears in the menu on its own because
	 * the menu reloads when a creation finishes.
	 */
	const reportBackgroundCreationOutcome = async (
		result: WorktreeCreationEither,
		creationData: WorktreeCreationData,
	) => {
		if (result._tag === 'Left') {
			const reason =
				result.left._tag === 'AmbiguousBranchError'
					? result.left.message
					: formatPreCreationHookError(result.left);
			setError(`Creating worktree ${creationData.branch} failed: ${reason}`);
			return;
		}

		const {worktree, postCreationHookError} = result.right;
		if (postCreationHookError) {
			// Same rule as when waiting: a failed post-creation hook means the
			// worktree may not be ready, so the prompt-first session is not started.
			setError(
				`Worktree ${creationData.branch} was created, but ${formatPostCreationHookWarning(postCreationHookError)}`,
			);
			return;
		}

		if (creationData.presetId && creationData.initialPrompt) {
			// Start the session without switching to it; it shows up in the menu.
			const sessionResult = await createSessionWithEffect(
				worktree.path,
				creationData.presetId,
				creationData.initialPrompt,
				undefined,
				false,
			);
			if (!sessionResult.success) {
				setError(sessionResult.errorMessage!);
			}
		}
	};

	/**
	 * Creates the worktree for a tracked creation job and handles the outcome.
	 * If the user is still waiting on the 'creating-worktree' screen, the
	 * outcome navigates as usual; otherwise it is reported in the background.
	 *
	 * @param onAmbiguous - What to do when the base branch exists on several
	 *   remotes: ask the user to pick one, or (when retrying after they already
	 *   picked) show the error.
	 */
	const runWorktreeCreation = async (
		jobId: string,
		creationData: WorktreeCreationData,
		onAmbiguous: 'select-remote' | 'show-error',
	) => {
		worktreeCreationTracker.update(jobId, {
			branch: creationData.branch,
			stage: 'creating',
		});

		const result = await Effect.runPromise(
			Effect.either(
				worktreeService.createWorktreeEffect(
					creationData.path,
					creationData.branch,
					creationData.baseBranch,
					creationData.copySessionData,
					creationData.copyClaudeDirectory,
				),
			),
		);
		worktreeCreationTracker.finish(jobId);

		if (result._tag === 'Right') {
			addCreatedWorktreeToMenuSnapshot({
				...creationData,
				path: result.right.worktree.path,
				branch: result.right.worktree.branch || creationData.branch,
			});
		}

		if (waitingCreationJobIdRef.current !== jobId) {
			await reportBackgroundCreationOutcome(result, creationData);
			return;
		}
		setWaitingCreationJobId(null);

		if (result._tag === 'Left') {
			if (result.left._tag === 'AmbiguousBranchError') {
				if (onAmbiguous === 'select-remote') {
					setPendingWorktreeCreation({
						...creationData,
						ambiguousError: result.left,
					});
					navigateWithClear('remote-branch-selector');
				} else {
					setError(result.left.message);
					setView('new-worktree');
				}
				return;
			}

			const errorMessage = formatPreCreationHookError(result.left);
			if (result.left._tag === 'ProcessError') {
				setError(null);
				setWorktreeHookError(errorMessage);
				setView('worktree-hook-error');
				return;
			}

			setError(errorMessage);
			setView('new-worktree');
			return;
		}

		const {worktree: createdWorktree, postCreationHookError} = result.right;
		if (postCreationHookError) {
			setError(null);
			setWorktreeHookError(
				formatPostCreationHookWarning(postCreationHookError),
			);
			setView('worktree-hook-error');
			return;
		}

		if (creationData.presetId && creationData.initialPrompt) {
			setLoadingContext({isPromptFlow: true});
			setPendingMenuSessionLaunch({
				worktree: {
					path: createdWorktree.path,
					branch: createdWorktree.branch || creationData.branch,
					isMainWorktree: false,
					hasSession: false,
				},
				presetId: creationData.presetId,
				initialPrompt: creationData.initialPrompt,
			});
		}

		handleReturnToMenu();
	};

	const handleCreateWorktree = async (request: NewWorktreeRequest) => {
		setError(null);

		const isPromptFlow = request.creationMode === 'prompt';
		const jobId = startWaitingForCreation({
			projectKey: menuSnapshotKey,
			branch: isPromptFlow ? undefined : request.branch,
			stage: isPromptFlow ? 'naming' : 'creating',
			copySessionData: request.copySessionData,
			isPromptFlow,
		});

		let branch = request.creationMode === 'manual' ? request.branch : '';
		let targetPath = request.path;
		if (request.creationMode === 'prompt') {
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

		await runWorktreeCreation(
			jobId,
			{
				path: targetPath,
				branch,
				baseBranch: request.baseBranch,
				copySessionData: request.copySessionData,
				copyClaudeDirectory: request.copyClaudeDirectory,
				presetId: isPromptFlow ? request.presetId : undefined,
				initialPrompt: isPromptFlow ? request.initialPrompt : undefined,
			},
			'select-remote',
		);
	};

	const handleCancelNewWorktree = () => {
		handleReturnToMenu();
	};

	const handleRemoteBranchSelected = async (selectedRemoteRef: string) => {
		if (!pendingWorktreeCreation) return;

		// Clear the pending creation data
		const creationData: WorktreeCreationData = {
			path: pendingWorktreeCreation.path,
			branch: pendingWorktreeCreation.branch,
			baseBranch: selectedRemoteRef,
			copySessionData: pendingWorktreeCreation.copySessionData,
			copyClaudeDirectory: pendingWorktreeCreation.copyClaudeDirectory,
			presetId: pendingWorktreeCreation.presetId,
			initialPrompt: pendingWorktreeCreation.initialPrompt,
		};
		setPendingWorktreeCreation(null);
		setError(null);

		// Retry worktree creation with the selected remote reference as the base
		const jobId = startWaitingForCreation({
			projectKey: menuSnapshotKey,
			branch: creationData.branch,
			stage: 'creating',
			copySessionData: creationData.copySessionData,
			isPromptFlow: Boolean(
				creationData.presetId && creationData.initialPrompt,
			),
		});
		await runWorktreeCreation(jobId, creationData, 'show-error');
	};

	const handleRemoteBranchSelectorCancel = () => {
		// Clear pending data and return to new worktree form
		setPendingWorktreeCreation(null);
		setView('new-worktree');
	};

	const handleDeleteWorktrees = async (
		worktreePaths: string[],
		deleteBranch: boolean,
		options?: {
			// Where to send the user when a deletion fails. Defaults to the
			// multi-select delete screen, which is where this flow starts.
			onError?: () => void;
		},
	) => {
		// Set loading context before showing loading view
		setLoadingContext({deleteBranch});
		setView('deleting-worktree');
		setError(null);

		// Yield to the event loop so Ink can paint `deleting-worktree` before git work runs.
		// Otherwise the confirmation UI stays visible until deletion finishes (no spinner).
		await new Promise<void>(resolve => {
			setTimeout(resolve, 0);
		});

		// Delete the worktrees sequentially using Effect
		let hasError = false;
		for (const path of worktreePaths) {
			// Destroy any running sessions for this worktree
			const wtSessions = sessionManager.getSessionsForWorktree(path);
			for (const s of wtSessions) {
				sessionManager.destroySession(s.id);
			}

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
			const deletedPaths = new Set(worktreePaths);
			updateMenuSnapshot(snapshot => ({
				...snapshot,
				worktrees: snapshot.worktrees.filter(
					worktree => !deletedPaths.has(worktree.path),
				),
			}));
			// Success - return to menu
			handleReturnToMenu();
		} else {
			// Show error
			if (options?.onError) {
				options.onError();
			} else {
				setView('delete-worktree');
			}
		}
	};

	const handleCancelDeleteWorktree = () => {
		handleReturnToMenu();
	};

	const handleSelectProject = (project: GitProject) => {
		// Handle special exit case
		if (project.path === 'EXIT_APPLICATION') {
			setExitConfirmSource('project-list');
			navigateWithClear('confirm-exit');
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

	const handleSessionActionFromDashboard = (
		session: ISession,
		project: GitProject,
	) => {
		const projectSessionManager =
			globalSessionOrchestrator.getManagerForProject(project.path);
		setSessionManager(projectSessionManager);
		setWorktreeService(new WorktreeService(project.path));
		setSessionActionsTarget({
			session,
			worktreePath: session.worktreePath,
		});
		navigateWithClear('session-actions');
	};

	const handleConfirmExit = () => {
		globalSessionOrchestrator.destroyAllSessions();
		exit();
	};

	const handleCancelExit = () => {
		navigateWithClear(exitConfirmSource, () => {
			setMenuKey(prev => prev + 1);
		});
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

	if (view === 'restore-sessions') {
		return (
			<RestoreSessions
				sessions={restorableSessions}
				showProject={multiProject}
				onRestore={handleRestorePreviousSessions}
				onDiscard={handleDiscardPreviousSessions}
			/>
		);
	}

	if (view === 'restoring-sessions') {
		return (
			<Box flexDirection="column">
				<LoadingSpinner message="Restoring previous sessions..." color="cyan" />
			</Box>
		);
	}

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
				onSessionAction={handleSessionActionFromDashboard}
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
				initialSnapshot={menuSnapshots[menuSnapshotKey]}
				onSnapshotChange={handleMenuSnapshotChange}
				onMenuAction={handleMenuAction}
				onSelectRecentProject={handleSelectProject}
				error={error}
				onDismissError={() => setError(null)}
				projectName={selectedProject?.name}
				projectKey={menuSnapshotKey}
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
		// The job leaves the tracker a moment before this screen navigates away.
		const message = waitingCreationJob
			? describeWorktreeCreationStage(waitingCreationJob)
			: 'Creating worktree...';

		return (
			<Box flexDirection="column">
				<LoadingSpinner message={message} color="cyan" />
				<Box marginTop={1}>
					<Text dimColor>
						Press Enter to return to the menu; creation continues in the
						background
					</Text>
				</Box>
			</Box>
		);
	}

	if (view === 'worktree-hook-error') {
		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text color="red">Worktree hook error</Text>
				</Box>
				<Box marginBottom={1}>
					<Text color="red">{worktreeHookError}</Text>
				</Box>
				<Text dimColor>Press any key to return to the menu</Text>
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
					projectPath={selectedProject?.path}
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

	if (view === 'rename-session' && renameTarget) {
		return (
			<SessionRename
				currentName={renameTarget.name}
				onRename={name => {
					sessionManager.renameSession(renameTarget.id, name);
					setRenameTarget(null);
					handleReturnToMenu();
				}}
				onCancel={() => {
					setRenameTarget(null);
					handleReturnToMenu();
				}}
			/>
		);
	}

	if (view === 'name-new-session' && pendingNewSessionWorktree) {
		const worktree = pendingNewSessionWorktree;
		return (
			<SessionRename
				title="New Session"
				placeholder="Enter session name (optional)"
				onRename={sessionName => {
					setPendingNewSessionWorktree(null);
					void startSessionForWorktree(worktree, {
						forceNew: true,
						sessionName,
					});
				}}
				onCancel={() => {
					setPendingNewSessionWorktree(null);
					handleReturnToMenu();
				}}
			/>
		);
	}

	if (view === 'session-actions' && sessionActionsTarget) {
		const {
			session: targetSession,
			worktreePath,
			worktree: targetWorktree,
		} = sessionActionsTarget;
		// A worktree row without a session has no session name to show; the
		// worktree path is rendered on its own line by SessionActions.
		const label = !targetSession
			? undefined
			: targetSession.sessionName
				? targetSession.sessionName
				: `Session #${targetSession.sessionNumber}`;

		const handleSessionAction = async (action: SessionActionType) => {
			setSessionActionsTarget(null);
			switch (action) {
				case 'newSession': {
					const newSessionWorktree = {
						path: worktreePath,
						branch: '',
						isMainWorktree: false,
						hasSession: true,
					};
					// Only prompt for a name when the worktree already has a
					// session — starting the very first one keeps the old,
					// no-prompt behavior.
					if (targetSession) {
						setPendingNewSessionWorktree(newSessionWorktree);
						navigateWithClear('name-new-session');
						return;
					}
					await startSessionForWorktree(newSessionWorktree, {forceNew: true});
					return;
				}
				case 'rename':
					if (!targetSession) return;
					setRenameTarget({
						id: targetSession.id,
						name: targetSession.sessionName,
					});
					navigateWithClear('rename-session');
					return;
				case 'kill':
					if (!targetSession) return;
					sessionManager.destroySession(targetSession.id);
					handleReturnToMenu();
					return;
				case 'deleteWorktree':
					if (!targetWorktree) return;
					setWorktreeToDelete(targetWorktree);
					navigateWithClear('confirm-delete-worktree');
					return;
			}
		};

		return (
			<SessionActions
				sessionLabel={label}
				worktreePath={worktreePath}
				hasSession={!!targetSession}
				canDeleteWorktree={
					!!targetWorktree && isDeletableWorktree(targetWorktree)
				}
				onSelect={handleSessionAction}
				onCancel={() => {
					setSessionActionsTarget(null);
					handleReturnToMenu();
				}}
			/>
		);
	}

	if (view === 'confirm-delete-worktree' && worktreeToDelete) {
		const target = worktreeToDelete;

		return (
			<DeleteConfirmation
				worktrees={[target]}
				onConfirm={deleteBranch => {
					setWorktreeToDelete(null);
					void handleDeleteWorktrees([target.path], deleteBranch, {
						// The multi-select delete screen was never opened in this flow,
						// so surface the failure on the menu instead.
						onError: handleReturnToMenu,
					});
				}}
				onCancel={() => {
					setWorktreeToDelete(null);
					handleReturnToMenu();
				}}
			/>
		);
	}

	if (view === 'confirm-exit') {
		const activeSessionCount =
			globalSessionOrchestrator.getAllActiveSessions().length;

		const exitMessage = (
			<Box flexDirection="column">
				<Text>Are you sure you want to exit CCManager?</Text>
				{activeSessionCount > 0 && (
					<Box marginTop={1}>
						<Text>
							{activeSessionCount} active session
							{activeSessionCount === 1 ? '' : 's'} will be terminated. They can
							be restored the next time CCManager starts.
						</Text>
					</Box>
				)}
			</Box>
		);

		const exitHint = (
			<Text dimColor>
				Use ↑↓/j/k to navigate, Enter to select,{' '}
				{shortcutManager.getShortcutDisplay('cancel')} to cancel
			</Text>
		);

		return (
			<Confirmation
				title={
					<Text bold color="yellow">
						Exit CCManager
					</Text>
				}
				message={exitMessage}
				options={[
					{label: 'Exit', value: 'exit', color: 'red'},
					{label: 'Cancel', value: 'cancel', color: 'green'},
				]}
				onSelect={value => {
					if (value === 'exit') {
						handleConfirmExit();
					} else {
						handleCancelExit();
					}
				}}
				initialIndex={1} // Default to Cancel for safety
				hint={exitHint}
				onCancel={handleCancelExit}
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
				{devcontainerLogs.length > 0 && (
					<Box flexDirection="column" marginTop={1} marginLeft={2}>
						{devcontainerLogs.map((line, i) => (
							<Text key={i} dimColor>
								{line}
							</Text>
						))}
					</Box>
				)}
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
				{devcontainerLogs.length > 0 && (
					<Box flexDirection="column" marginTop={1} marginLeft={2}>
						{devcontainerLogs.map((line, i) => (
							<Text key={i} dimColor>
								{line}
							</Text>
						))}
					</Box>
				)}
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
