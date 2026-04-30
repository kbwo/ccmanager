import {spawn, type IPty, type IExitEvent} from './bunTerminal.js';
import {
	Session,
	SessionManager as ISessionManager,
	SessionState,
	DevcontainerConfig,
	StateDetectionStrategy,
	CommandPreset,
} from '../types/index.js';
import {EventEmitter} from 'events';
import pkg from '@xterm/headless';
import {SerializeAddon} from '@xterm/addon-serialize';
import {spawn as childSpawn} from 'child_process';
import {configReader} from './config/configReader.js';
import {executeStatusHook} from '../utils/hookExecutor.js';
import {createStateDetector} from './stateDetector/index.js';

/** Interval in milliseconds for polling terminal state detection. */
const STATE_CHECK_INTERVAL_MS = 100;
import {Effect, Either} from 'effect';
import {ProcessError, ConfigError} from '../types/errors.js';
import {autoApprovalVerifier} from './autoApprovalVerifier.js';
import {logger} from '../utils/logger.js';
import {Mutex, createInitialSessionStateData} from '../utils/mutex.js';
import {
	getBackgroundTaskTag,
	getTeamMemberTag,
} from '../constants/statusIcons.js';
import {getTerminalScreenContent} from '../utils/screenCapture.js';
import {injectTeammateMode} from '../utils/commandArgs.js';
import {preparePresetLaunch} from '../utils/presetPrompt.js';
const {Terminal} = pkg;
const TERMINAL_CONTENT_MAX_LINES = 300;
const TERMINAL_SCROLLBACK_LINES = 5000;
const TERMINAL_RESTORE_SCROLLBACK_LINES = 200;
// How long to suppress PTY → stdout forwarding after a viewport resize so the
// child process's SIGWINCH-triggered re-emission of static content does not
// duplicate already-displayed rows in the user's terminal.
const RESIZE_SUPPRESS_MS = 250;

export interface SessionCounts {
	idle: number;
	busy: number;
	waiting_input: number;
	pending_auto_approval: number;
	total: number;
	backgroundTasks: number;
	teamMembers: number;
}

export class SessionManager extends EventEmitter implements ISessionManager {
	sessions: Map<string, Session>;
	private waitingWithBottomBorder: Map<string, boolean> = new Map();
	private busyTimers: Map<string, NodeJS.Timeout> = new Map();
	private autoApprovalDisabledWorktrees: Set<string> = new Set();
	private restoringSessions: Set<string> = new Set();
	private bufferedRestoreData: Map<string, string[]> = new Map();
	private resizingSessions: Set<string> = new Set();
	private resizeSuppressTimers: Map<string, NodeJS.Timeout> = new Map();

	private async spawn(
		command: string,
		args: string[],
		worktreePath: string,
		options: {rawMode?: boolean} = {},
	): Promise<IPty> {
		const spawnOptions = {
			name: 'xterm-256color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: worktreePath,
			env: process.env,
			...(options.rawMode === undefined ? {} : {rawMode: options.rawMode}),
		};

		return spawn(command, args, spawnOptions);
	}

	private resolvePreset(presetId?: string): CommandPreset {
		let preset: CommandPreset | null = presetId
			? Either.getOrElse(
					configReader.getPresetByIdEffect(presetId),
					(): CommandPreset | null => null,
				)
			: null;

		if (!preset) {
			preset = configReader.getDefaultPreset();
		}

		if (!preset) {
			throw new ConfigError({
				configPath: 'configuration',
				reason: 'validation',
				details: presetId
					? `Preset with ID '${presetId}' not found and no default preset available`
					: 'No default preset available',
			});
		}

		return preset;
	}

	detectTerminalState(session: Session): SessionState {
		const stateData = session.stateMutex.getSnapshot();
		const detectedState = session.stateDetector.detectState(
			session.terminal,
			stateData.state,
		);

		// If auto-approval is enabled and state is waiting_input, convert to pending_auto_approval
		if (
			detectedState === 'waiting_input' &&
			configReader.isAutoApprovalEnabled() &&
			!stateData.autoApprovalFailed &&
			!this.autoApprovalDisabledWorktrees.has(session.worktreePath)
		) {
			return 'pending_auto_approval';
		}

		return detectedState;
	}

	detectBackgroundTask(session: Session): number {
		return session.stateDetector.detectBackgroundTask(session.terminal);
	}

	detectTeamMembers(session: Session): number {
		return session.stateDetector.detectTeamMembers(session.terminal);
	}

	private getTerminalContent(session: Session): string {
		// Use the new screen capture utility that correctly handles
		// both normal and alternate screen buffers
		return getTerminalScreenContent(
			session.terminal,
			TERMINAL_CONTENT_MAX_LINES,
		);
	}

	private handleAutoApproval(session: Session): void {
		// Cancel any existing verification before starting a new one
		this.cancelAutoApprovalVerification(
			session,
			'Restarting verification for pending auto-approval state',
		);

		const abortController = new AbortController();
		void session.stateMutex.update(data => ({
			...data,
			autoApprovalAbortController: abortController,
			autoApprovalReason: undefined,
		}));

		// Get terminal content for verification
		const terminalContent = this.getTerminalContent(session);

		// Verify if permission is needed
		void Effect.runPromise(
			autoApprovalVerifier.verifyNeedsPermission(terminalContent, {
				signal: abortController.signal,
				cwd: session.worktreePath,
			}),
		)
			.then(async autoApprovalResult => {
				if (abortController.signal.aborted) {
					logger.debug(
						`[${session.id}] Auto-approval verification aborted before completion`,
					);
					return;
				}

				// If state already moved away, skip handling
				const currentState = session.stateMutex.getSnapshot().state;
				if (currentState !== 'pending_auto_approval') {
					logger.debug(
						`[${session.id}] Skipping auto-approval handling; current state is ${currentState}`,
					);
					return;
				}

				if (autoApprovalResult.needsPermission) {
					// Change state to waiting_input to ask for user permission
					logger.info(
						`[${session.id}] Auto-approval verification determined user permission needed`,
					);
					await this.updateSessionState(session, 'waiting_input', {
						autoApprovalFailed: true,
						autoApprovalReason: autoApprovalResult.reason,
					});
				} else {
					// Auto-approve by simulating Enter key press
					logger.info(
						`[${session.id}] Auto-approval granted, simulating user permission`,
					);
					session.process.write('\r');
					// Force state to busy to prevent endless auto-approval
					// when the state detection still sees pending_auto_approval
					await this.updateSessionState(session, 'busy', {
						autoApprovalReason: undefined,
					});
				}
			})
			.catch(async (error: unknown) => {
				if (abortController.signal.aborted) {
					logger.debug(
						`[${session.id}] Auto-approval verification aborted (${(error as Error)?.message ?? 'aborted'})`,
					);
					return;
				}

				// On failure, fall back to requiring explicit permission
				logger.error(
					`[${session.id}] Auto-approval verification failed, requiring user permission`,
					error,
				);

				const currentState = session.stateMutex.getSnapshot().state;
				if (currentState === 'pending_auto_approval') {
					await this.updateSessionState(session, 'waiting_input', {
						autoApprovalFailed: true,
						autoApprovalReason:
							(error as Error | undefined)?.message ??
							'Auto-approval verification failed',
					});
				}
			})
			.finally(async () => {
				const currentController =
					session.stateMutex.getSnapshot().autoApprovalAbortController;
				if (currentController === abortController) {
					await session.stateMutex.update(data => ({
						...data,
						autoApprovalAbortController: undefined,
					}));
				}
			});
	}

	private cancelAutoApprovalVerification(
		session: Session,
		reason: string,
	): void {
		const stateData = session.stateMutex.getSnapshot();
		const controller = stateData.autoApprovalAbortController;
		if (!controller) {
			return;
		}

		if (!controller.signal.aborted) {
			controller.abort();
		}

		void session.stateMutex.update(data => ({
			...data,
			autoApprovalAbortController: undefined,
		}));
		logger.info(
			`[${session.id}] Cancelled auto-approval verification: ${reason}`,
		);
	}

	/**
	 * Update session state with automatic status hook execution.
	 * This method ensures that executeStatusHook is always called when state changes.
	 *
	 * @param session - The session to update
	 * @param newState - The new state to set
	 * @param additionalUpdates - Optional additional state data updates
	 */
	private async updateSessionState(
		session: Session,
		newState: SessionState,
		additionalUpdates: Partial<
			Omit<import('../utils/mutex.js').SessionStateData, 'state'>
		> = {},
	): Promise<void> {
		const oldState = session.stateMutex.getSnapshot().state;

		await session.stateMutex.update(data => ({
			...data,
			state: newState,
			...additionalUpdates,
		}));

		if (oldState !== newState) {
			// While busy, cursor-addressed footer redraws (spinner, token stats,
			// "accept edits on …" line) can push ghost frames into scrollback as
			// chat content scrolls. Once the busy turn ends, advance the restore
			// baseline so the next session restore replays only post-busy
			// scrollback and skips the ghost-bearing range.
			if (oldState === 'busy' && newState !== 'busy') {
				session.restoreScrollbackBaseLine =
					session.terminal.buffer.normal.baseY;
			}
			void Effect.runPromise(executeStatusHook(oldState, newState, session));
			this.emit('sessionStateChanged', session);
		}
	}

	constructor() {
		super();
		this.sessions = new Map();
	}

	private createTerminal(): pkg.Terminal {
		return new Terminal({
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			scrollback: TERMINAL_SCROLLBACK_LINES,
			allowProposedApi: true,
			logLevel: 'off',
		});
	}

	private shouldResetRestoreScrollback(data: string): boolean {
		return (
			data.includes('\x1b[2J') ||
			data.includes('\x1b[3J') ||
			data.includes('\x1bc')
		);
	}

	private getRestoreSnapshot(session: Session): string {
		const activeBuffer = session.terminal.buffer.active;
		if (activeBuffer.type !== 'normal') {
			return session.serializer.serialize({
				scrollback: 0,
			});
		}

		const normalBuffer = session.terminal.buffer.normal;
		const bufferLength = normalBuffer.length;
		if (bufferLength === 0) {
			return '';
		}

		const cursorRow = normalBuffer.cursorY + 1;
		const cursorCol = normalBuffer.cursorX + 1;

		// When the live viewport shows a transient footer (spinner activity,
		// token stats, persistent shift+tab footer, etc.), the renderer keeps
		// redrawing it in place and earlier copies have likely been pushed into
		// scrollback by chat output scrolling beneath it. Replaying that
		// scrollback would paint duplicated footer rows, so emit only the
		// viewport in this case.
		if (session.stateDetector.hasTransientRenderFooter(session.terminal)) {
			const viewportSnapshot = session.serializer.serialize({
				scrollback: 0,
				excludeAltBuffer: true,
			});
			return `${viewportSnapshot}\x1b[${cursorRow};${cursorCol}H`;
		}

		const scrollbackStart = Math.max(
			0,
			normalBuffer.baseY - TERMINAL_RESTORE_SCROLLBACK_LINES,
		);
		const rangeStart = Math.max(
			session.restoreScrollbackBaseLine,
			scrollbackStart,
		);
		const rangeEnd = bufferLength - 1;

		const snapshot = session.serializer.serialize({
			range: {
				start: rangeStart,
				end: rangeEnd,
			},
			excludeAltBuffer: true,
		});

		return `${snapshot}\x1b[${cursorRow};${cursorCol}H`;
	}

	private getViewportRedrawSnapshot(session: Session): string {
		const snapshot = session.serializer.serialize({scrollback: 0});
		if (snapshot.length === 0) {
			return '';
		}
		const activeBuffer = session.terminal.buffer.active;
		if (activeBuffer.type !== 'normal') {
			// Serialized alternate-buffer output already carries its own cursor
			// positioning, so do not append a cursor home sequence here.
			return snapshot;
		}
		const normalBuffer = session.terminal.buffer.normal;
		const cursorRow = normalBuffer.cursorY + 1;
		const cursorCol = normalBuffer.cursorX + 1;
		return `${snapshot}\x1b[${cursorRow};${cursorCol}H`;
	}

	/**
	 * Resize a session's PTY and headless terminal, then repaint the user's
	 * terminal viewport from the post-resize headless state. Live PTY → stdout
	 * forwarding is suppressed for a short window so the child's SIGWINCH
	 * redraw (which on Ink-based TUIs re-emits the full static history) cannot
	 * append duplicates below the repainted viewport.
	 */
	performResize(sessionId: string, cols: number, rows: number): void {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		try {
			session.process.resize(cols, rows);
		} catch {
			/* empty */
		}
		try {
			session.terminal.resize(cols, rows);
		} catch {
			/* empty */
		}

		this.resizingSessions.add(sessionId);
		const existing = this.resizeSuppressTimers.get(sessionId);
		if (existing !== undefined) {
			clearTimeout(existing);
		}
		const timer = setTimeout(() => {
			this.resizeSuppressTimers.delete(sessionId);
			this.resizingSessions.delete(sessionId);
		}, RESIZE_SUPPRESS_MS);
		this.resizeSuppressTimers.set(sessionId, timer);

		if (!session.isActive) {
			return;
		}

		const snapshot = this.getViewportRedrawSnapshot(session);
		if (snapshot.length === 0) {
			return;
		}

		// \x1b[?7h ... \x1b[?7l: SerializeAddon's wrapped-row encoding relies
		//   on auto-wrap (DECAWM) being enabled to advance the cursor across
		//   row boundaries (see PR #276). Session.tsx keeps DECAWM disabled
		//   for live TUI redraws, so re-enable it just for the snapshot write
		//   and restore the live default afterward.
		// \x1b[2J\x1b[H: clear the post-resize viewport so the snapshot paints
		//   onto a known canvas; rows that the child won't cover (e.g. trailing
		//   blanks after a height shrink) stay clean rather than retaining
		//   pre-resize content.
		this.emit(
			'sessionResize',
			session,
			`\x1b[?7h\x1b[2J\x1b[H${snapshot}\x1b[?7l`,
		);
	}

	private async createSessionInternal(
		worktreePath: string,
		ptyProcess: IPty,
		options: {
			isPrimaryCommand?: boolean;
			command?: string;
			fallbackArgs?: string[];
			presetName?: string;
			detectionStrategy?: StateDetectionStrategy;
			devcontainerConfig?: DevcontainerConfig;
		} = {},
	): Promise<Session> {
		const existingSessions = this.getSessionsForWorktree(worktreePath);
		const maxNumber = existingSessions.reduce(
			(max, s) => Math.max(max, s.sessionNumber),
			0,
		);
		const terminal = this.createTerminal();
		const serializer = new SerializeAddon();
		terminal.loadAddon(serializer);
		const detectionStrategy = options.detectionStrategy ?? 'claude';
		const stateDetector = createStateDetector(detectionStrategy);

		const session: Session = {
			id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			worktreePath,
			sessionNumber: maxNumber + 1,
			sessionName: undefined,
			command: options.command ?? 'claude',
			fallbackArgs: options.fallbackArgs,
			lastAccessedAt: Date.now(),
			process: ptyProcess,
			output: [],
			lastActivity: new Date(),
			isActive: false,
			terminal,
			serializer,
			restoreScrollbackBaseLine: 0,
			stateCheckInterval: undefined, // Will be set in setupBackgroundHandler
			isPrimaryCommand: options.isPrimaryCommand ?? true,
			presetName: options.presetName,
			detectionStrategy,
			devcontainerConfig: options.devcontainerConfig ?? undefined,
			stateMutex: new Mutex(createInitialSessionStateData()),
			stateDetector,
		};

		// Set up persistent background data handler for state detection
		this.setupBackgroundHandler(session);

		this.sessions.set(session.id, session);

		this.emit('sessionCreated', session);

		return session;
	}

	/**
	 * Create session with command preset using Effect-based error handling
	 *
	 * @param {string} worktreePath - Path to the worktree
	 * @param {string} [presetId] - Optional preset ID, uses default if not provided
	 * @returns {Effect.Effect<Session, ProcessError | ConfigError, never>} Effect that may fail with ProcessError (spawn failure) or ConfigError (invalid preset)
	 *
	 * @example
	 * ```typescript
	 * // Use Effect.match for type-safe error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(effect, {
	 *     onFailure: (error) => ({ type: 'error', message: error.message }),
	 *     onSuccess: (session) => ({ type: 'success', data: session })
	 *   })
	 * );
	 * ```
	 */
	createSessionWithPresetEffect(
		worktreePath: string,
		presetId?: string,
		initialPrompt?: string,
	): Effect.Effect<Session, ProcessError | ConfigError, never> {
		return Effect.tryPromise({
			try: async () => {
				const preset = this.resolvePreset(presetId);
				const command = preset.command;
				const launch = preparePresetLaunch(preset, initialPrompt);
				const args = launch.args;

				// Spawn the process - fallback will be handled by setupExitHandler
				const ptyProcess = await this.spawn(command, args, worktreePath);

				const session = await this.createSessionInternal(
					worktreePath,
					ptyProcess,
					{
						isPrimaryCommand: true,
						command,
						fallbackArgs: preset.fallbackArgs,
						presetName: preset.name,
						detectionStrategy: preset.detectionStrategy,
					},
				);

				if (launch.stdinPayload) {
					session.process.write(launch.stdinPayload);
				}

				return session;
			},
			catch: (error: unknown) => {
				// If it's already a ConfigError, return it
				if (error instanceof ConfigError) {
					return error;
				}

				// Otherwise, wrap in ProcessError
				return new ProcessError({
					command: presetId
						? `createSessionWithPreset (preset: ${presetId})`
						: 'createSessionWithPreset (default preset)',
					message:
						error instanceof Error
							? error.message
							: 'Failed to create session with preset',
				});
			},
		});
	}

	private setupDataHandler(session: Session): void {
		// This handler always runs for all data
		session.process.onData((data: string) => {
			// Write data to virtual terminal
			session.terminal.write(data);

			if (this.shouldResetRestoreScrollback(data)) {
				session.restoreScrollbackBaseLine =
					session.terminal.buffer.normal.baseY;
			}

			session.lastActivity = new Date();

			// Only emit data events when session is active
			if (session.isActive) {
				if (this.restoringSessions.has(session.id)) {
					const bufferedData = this.bufferedRestoreData.get(session.id) ?? [];
					bufferedData.push(data);
					this.bufferedRestoreData.set(session.id, bufferedData);
					return;
				}

				// During a viewport resize, the child process re-emits its full
				// static content to adapt to new line-wrapping. The headless
				// terminal already absorbed the data above, so the post-resize
				// snapshot we wrote on resize is in sync. Drop the live forward
				// here to keep the user's terminal from acquiring duplicated
				// rows below the snapshot.
				if (this.resizingSessions.has(session.id)) {
					return;
				}

				this.emit('sessionData', session, data);
			}
		});
	}

	/**
	 * Sets up exit handler for the session process.
	 * When the process exits with code 1 and it's the primary command,
	 * it will attempt a single retry using the configured command with fallback args.
	 * If fallbackArgs are not configured, it retries the configured command with no args.
	 */
	private setupExitHandler(session: Session): void {
		session.process.onExit(async (e: IExitEvent) => {
			// Check if we should attempt fallback
			if (e.exitCode === 1 && !e.signal && session.isPrimaryCommand) {
				try {
					let fallbackProcess: IPty;
					const fallbackArgs = injectTeammateMode(
						session.command,
						session.fallbackArgs ?? [],
						session.detectionStrategy,
					);

					// Check if we're in a devcontainer session
					if (session.devcontainerConfig) {
						// Parse the exec command to extract arguments
						const execParts =
							session.devcontainerConfig.execCommand.split(/\s+/);
						const devcontainerCmd = execParts[0] || 'devcontainer';
						const execArgs = execParts.slice(1);

						const fallbackFullArgs = [
							...execArgs,
							'--',
							session.command,
							...fallbackArgs,
						];

						fallbackProcess = await this.spawn(
							devcontainerCmd,
							fallbackFullArgs,
							session.worktreePath,
							{rawMode: false},
						);
					} else {
						fallbackProcess = await this.spawn(
							session.command,
							fallbackArgs,
							session.worktreePath,
						);
					}

					// Replace the process
					session.process = fallbackProcess;
					session.isPrimaryCommand = false;

					// Setup handlers for the new process (data and exit only)
					this.setupDataHandler(session);
					this.setupExitHandler(session);

					// Emit event to notify process replacement
					this.emit('sessionProcessReplaced', session);
				} catch (_error) {
					// Fallback failed, proceed with cleanup
					this.cleanupSession(session);
				}
			} else {
				// No fallback needed or possible, cleanup
				this.cleanupSession(session);
			}
		});
	}

	private setupBackgroundHandler(session: Session): void {
		// Setup data handler
		this.setupDataHandler(session);

		// Set up interval-based state detection
		session.stateCheckInterval = setInterval(() => {
			const stateData = session.stateMutex.getSnapshot();
			const oldState = stateData.state;
			const detectedState = this.detectTerminalState(session);

			if (detectedState !== oldState) {
				// Cancel auto-approval verification if state is changing away from pending_auto_approval
				if (
					stateData.autoApprovalAbortController &&
					detectedState !== 'pending_auto_approval'
				) {
					this.cancelAutoApprovalVerification(
						session,
						`state changed to ${detectedState}`,
					);
				}

				const additionalUpdates: Partial<
					Omit<import('../utils/mutex.js').SessionStateData, 'state'>
				> = {};

				// If we previously blocked auto-approval and have moved out of a user prompt,
				// allow future auto-approval attempts.
				if (
					stateData.autoApprovalFailed &&
					detectedState !== 'waiting_input' &&
					detectedState !== 'pending_auto_approval'
				) {
					additionalUpdates.autoApprovalFailed = false;
					additionalUpdates.autoApprovalReason = undefined;
				}

				void this.updateSessionState(session, detectedState, additionalUpdates);
			}

			// Handle auto-approval if state is pending_auto_approval and no verification is in progress.
			// This ensures auto-approval is retried when the state remains pending_auto_approval
			// but the previous verification completed (success, failure, timeout, or abort).
			const currentStateData = session.stateMutex.getSnapshot();
			if (
				currentStateData.state === 'pending_auto_approval' &&
				!currentStateData.autoApprovalAbortController
			) {
				this.handleAutoApproval(session);
			}

			// Detect and update background task count
			const backgroundTaskCount = this.detectBackgroundTask(session);
			if (currentStateData.backgroundTaskCount !== backgroundTaskCount) {
				void session.stateMutex.update(data => ({
					...data,
					backgroundTaskCount,
				}));
			}

			// Detect and update team member count
			const teamMemberCount = this.detectTeamMembers(session);
			if (currentStateData.teamMemberCount !== teamMemberCount) {
				void session.stateMutex.update(data => ({
					...data,
					teamMemberCount,
				}));
			}
		}, STATE_CHECK_INTERVAL_MS);

		// Setup exit handler
		this.setupExitHandler(session);
	}

	private cleanupSession(session: Session): void {
		const stateData = session.stateMutex.getSnapshot();
		if (stateData.autoApprovalAbortController) {
			this.cancelAutoApprovalVerification(session, 'Session cleanup');
		}

		// Clear the state check interval
		if (session.stateCheckInterval) {
			clearInterval(session.stateCheckInterval);
			session.stateCheckInterval = undefined;
		}
		// Clear any pending state and update state to idle before destroying
		void this.updateSessionState(session, 'idle');
		this.destroySession(session.id);
		this.emit('sessionExit', session);
	}

	getSessionById(id: string): Session | undefined {
		return this.sessions.get(id);
	}

	getSessionsForWorktree(worktreePath: string): Session[] {
		return Array.from(this.sessions.values()).filter(
			s => s.worktreePath === worktreePath,
		);
	}

	setSessionActive(sessionId: string, active: boolean): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.isActive = active;

			if (active) {
				session.lastAccessedAt = Date.now();
				this.restoringSessions.add(session.id);
				try {
					const restoreSnapshot = this.getRestoreSnapshot(session);
					if (restoreSnapshot.length > 0) {
						this.emit('sessionRestore', session, restoreSnapshot);
					}
				} finally {
					this.restoringSessions.delete(session.id);
					const bufferedData = this.bufferedRestoreData.get(session.id);
					if (bufferedData && bufferedData.length > 0) {
						this.bufferedRestoreData.delete(session.id);
						for (const chunk of bufferedData) {
							this.emit('sessionData', session, chunk);
						}
					}
				}
			} else {
				this.restoringSessions.delete(session.id);
				this.bufferedRestoreData.delete(session.id);
				this.resizingSessions.delete(session.id);
				const resizeTimer = this.resizeSuppressTimers.get(session.id);
				if (resizeTimer !== undefined) {
					clearTimeout(resizeTimer);
					this.resizeSuppressTimers.delete(session.id);
				}
			}
		}
	}

	cancelAutoApproval(sessionId: string, reason = 'User input received'): void {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		const stateData = session.stateMutex.getSnapshot();
		if (
			stateData.state !== 'pending_auto_approval' &&
			!stateData.autoApprovalAbortController
		) {
			return;
		}

		this.cancelAutoApprovalVerification(session, reason);

		if (stateData.state === 'pending_auto_approval') {
			// State change: pending_auto_approval -> waiting_input
			void this.updateSessionState(session, 'waiting_input', {
				autoApprovalFailed: true,
				autoApprovalReason: reason,
			});
		} else {
			// No state change, just update other fields
			void session.stateMutex.update(data => ({
				...data,
				autoApprovalFailed: true,
				autoApprovalReason: reason,
			}));
		}
	}

	toggleAutoApprovalForWorktree(worktreePath: string): boolean {
		if (this.autoApprovalDisabledWorktrees.has(worktreePath)) {
			this.autoApprovalDisabledWorktrees.delete(worktreePath);
			return false;
		} else {
			this.autoApprovalDisabledWorktrees.add(worktreePath);
			// Cancel auto-approval for all sessions in this worktree
			for (const session of this.getSessionsForWorktree(worktreePath)) {
				this.cancelAutoApproval(
					session.id,
					'Auto-approval disabled for worktree',
				);
			}
			return true;
		}
	}

	isAutoApprovalDisabledForWorktree(worktreePath: string): boolean {
		return this.autoApprovalDisabledWorktrees.has(worktreePath);
	}

	destroySession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			const stateData = session.stateMutex.getSnapshot();
			if (stateData.autoApprovalAbortController) {
				this.cancelAutoApprovalVerification(session, 'Session destroyed');
			}

			// Clear the state check interval
			if (session.stateCheckInterval) {
				clearInterval(session.stateCheckInterval);
			}
			try {
				session.process.kill();
			} catch (_error) {
				// Process might already be dead
			}
			// Clean up any pending timer
			const timer = this.busyTimers.get(sessionId);
			if (timer) {
				clearTimeout(timer);
				this.busyTimers.delete(sessionId);
			}
			this.sessions.delete(sessionId);
			this.waitingWithBottomBorder.delete(sessionId);
			this.restoringSessions.delete(sessionId);
			this.bufferedRestoreData.delete(sessionId);
			this.resizingSessions.delete(sessionId);
			const resizeTimer = this.resizeSuppressTimers.get(sessionId);
			if (resizeTimer !== undefined) {
				clearTimeout(resizeTimer);
				this.resizeSuppressTimers.delete(sessionId);
			}
			this.emit('sessionDestroyed', session);
		}
	}

	/**
	 * Terminate session and cleanup resources using Effect-based error handling
	 *
	 * @param {string} sessionId - Session identifier
	 * @returns {Effect.Effect<void, ProcessError, never>} Effect that may fail with ProcessError if session does not exist or cleanup fails
	 *
	 * @example
	 * ```typescript
	 * // Terminate session with error handling
	 * const result = await Effect.runPromise(
	 *   Effect.match(effect, {
	 *     onFailure: (error) => ({ type: 'error', message: error.message }),
	 *     onSuccess: () => ({ type: 'success' })
	 *   })
	 * );
	 * ```
	 */
	terminateSessionEffect(
		sessionId: string,
	): Effect.Effect<void, ProcessError, never> {
		return Effect.try({
			try: () => {
				const session = this.sessions.get(sessionId);
				if (!session) {
					throw new ProcessError({
						command: 'terminateSession',
						message: `Session not found: ${sessionId}`,
					});
				}

				const stateData = session.stateMutex.getSnapshot();
				if (stateData.autoApprovalAbortController) {
					this.cancelAutoApprovalVerification(session, 'Session terminated');
				}

				// Clear the state check interval
				if (session.stateCheckInterval) {
					clearInterval(session.stateCheckInterval);
				}

				// Try to kill the process - don't fail if process is already dead
				try {
					session.process.kill();
				} catch (_error) {
					// Process might already be dead, this is acceptable
				}

				// Clean up any pending timer
				const timer = this.busyTimers.get(sessionId);
				if (timer) {
					clearTimeout(timer);
					this.busyTimers.delete(sessionId);
				}

				this.sessions.delete(sessionId);
				this.waitingWithBottomBorder.delete(sessionId);
				this.resizingSessions.delete(sessionId);
				const resizeTimer = this.resizeSuppressTimers.get(sessionId);
				if (resizeTimer !== undefined) {
					clearTimeout(resizeTimer);
					this.resizeSuppressTimers.delete(sessionId);
				}
				this.emit('sessionDestroyed', session);
			},
			catch: (error: unknown) => {
				// If it's already a ProcessError, return it
				if (error instanceof ProcessError) {
					return error;
				}

				// Otherwise, wrap in ProcessError
				return new ProcessError({
					command: 'terminateSession',
					message:
						error instanceof Error
							? error.message
							: `Failed to terminate session: ${sessionId}`,
				});
			},
		});
	}

	getAllSessions(): Session[] {
		return Array.from(this.sessions.values());
	}

	/**
	 * Create session with devcontainer integration using Effect-based error handling
	 * @returns Effect that may fail with ProcessError (container/spawn failure) or ConfigError (invalid preset)
	 */
	createSessionWithDevcontainerEffect(
		worktreePath: string,
		devcontainerConfig: DevcontainerConfig,
		presetId?: string,
		initialPrompt?: string,
		onLog?: (line: string) => void,
	): Effect.Effect<Session, ProcessError | ConfigError, never> {
		return Effect.tryPromise({
			try: async () => {
				// Execute devcontainer up command, streaming output in real-time
				try {
					await new Promise<void>((resolve, reject) => {
						const parts = devcontainerConfig.upCommand.split(/\s+/);
						const cmd = parts[0]!;
						const args = parts.slice(1);
						const proc = childSpawn(cmd, args, {
							cwd: worktreePath,
							stdio: ['ignore', 'pipe', 'pipe'],
							shell: false,
						});

						const handleData = (data: Buffer) => {
							const text = data.toString();
							for (const line of text.split('\n')) {
								const trimmed = line.trimEnd();
								if (trimmed) {
									onLog?.(trimmed);
								}
							}
						};

						proc.stdout?.on('data', handleData);
						proc.stderr?.on('data', handleData);

						proc.on('error', err => {
							reject(err);
						});

						proc.on('close', code => {
							if (code === 0) {
								resolve();
							} else {
								reject(new Error(`Command exited with code ${code}`));
							}
						});
					});
				} catch (error) {
					throw new ProcessError({
						command: devcontainerConfig.upCommand,
						message: `Failed to start devcontainer: ${error instanceof Error ? error.message : String(error)}`,
					});
				}

				const preset = this.resolvePreset(presetId);

				// Parse the exec command to extract arguments
				const execParts = devcontainerConfig.execCommand.split(/\s+/);
				const devcontainerCmd = execParts[0] || 'devcontainer';
				const execArgs = execParts.slice(1);

				// Build the full command: devcontainer exec [args] -- [preset command] [preset args]
				const launch = preparePresetLaunch(preset, initialPrompt);
				const presetArgs = launch.args;
				const fullArgs = [...execArgs, '--', preset.command, ...presetArgs];

				// Spawn the process within devcontainer
				const ptyProcess = await this.spawn(
					devcontainerCmd,
					fullArgs,
					worktreePath,
					{rawMode: false},
				);

				const session = await this.createSessionInternal(
					worktreePath,
					ptyProcess,
					{
						isPrimaryCommand: true,
						command: preset.command,
						fallbackArgs: preset.fallbackArgs,
						presetName: preset.name,
						detectionStrategy: preset.detectionStrategy,
						devcontainerConfig,
					},
				);

				if (launch.stdinPayload) {
					session.process.write(launch.stdinPayload);
				}

				return session;
			},
			catch: (error: unknown) => {
				// If it's already a ConfigError or ProcessError, return it
				if (error instanceof ConfigError || error instanceof ProcessError) {
					return error;
				}

				// Otherwise, wrap in ProcessError
				return new ProcessError({
					command: `createSessionWithDevcontainer (${devcontainerConfig.execCommand})`,
					message:
						error instanceof Error
							? error.message
							: 'Failed to create session with devcontainer',
				});
			},
		});
	}

	destroy(): void {
		for (const sessionId of Array.from(this.sessions.keys())) {
			this.destroySession(sessionId);
		}
	}

	static getSessionCounts(sessions: Session[]): SessionCounts {
		const counts: SessionCounts = {
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: sessions.length,
			backgroundTasks: 0,
			teamMembers: 0,
		};

		sessions.forEach(session => {
			const stateData = session.stateMutex.getSnapshot();
			switch (stateData.state) {
				case 'idle':
					counts.idle++;
					break;
				case 'busy':
					counts.busy++;
					break;
				case 'waiting_input':
					counts.waiting_input++;
					break;
				case 'pending_auto_approval':
					counts.pending_auto_approval++;
					break;
			}
			counts.backgroundTasks += stateData.backgroundTaskCount;
			counts.teamMembers += stateData.teamMemberCount;
		});

		return counts;
	}

	static formatSessionCounts(counts: SessionCounts): string {
		if (counts.total === 0) {
			return '';
		}

		const parts: string[] = [];
		if (counts.idle > 0) {
			parts.push(`${counts.idle} Idle`);
		}
		if (counts.busy > 0) {
			parts.push(`${counts.busy} Busy`);
		}
		if (counts.waiting_input > 0) {
			parts.push(`${counts.waiting_input} Waiting`);
		}

		if (parts.length === 0) {
			return '';
		}

		const bgTag = getBackgroundTaskTag(counts.backgroundTasks);
		const bgSuffix = bgTag ? ` ${bgTag}` : '';
		const teamTag = getTeamMemberTag(counts.teamMembers);
		const teamSuffix = teamTag ? ` ${teamTag}` : '';
		return ` (${parts.join(' / ')}${bgSuffix}${teamSuffix})`;
	}
}
