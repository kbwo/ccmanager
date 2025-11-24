import {spawn, IPty} from 'node-pty';
import {
	Session,
	SessionManager as ISessionManager,
	SessionState,
	DevcontainerConfig,
	StateDetectionStrategy,
} from '../types/index.js';
import {EventEmitter} from 'events';
import pkg from '@xterm/headless';
import {exec} from 'child_process';
import {promisify} from 'util';
import {configurationManager} from './configurationManager.js';
import {executeStatusHook} from '../utils/hookExecutor.js';
import {createStateDetector} from './stateDetector.js';
import {
	STATE_PERSISTENCE_DURATION_MS,
	STATE_CHECK_INTERVAL_MS,
} from '../constants/statePersistence.js';
import {Effect} from 'effect';
import {ProcessError, ConfigError} from '../types/errors.js';
import {autoApprovalVerifier} from './autoApprovalVerifier.js';
import {logger} from '../utils/logger.js';
const {Terminal} = pkg;
const execAsync = promisify(exec);
const TERMINAL_CONTENT_MAX_LINES = 300;

export interface SessionCounts {
	idle: number;
	busy: number;
	waiting_input: number;
	pending_auto_approval: number;
	total: number;
}

export class SessionManager extends EventEmitter implements ISessionManager {
	sessions: Map<string, Session>;
	private waitingWithBottomBorder: Map<string, boolean> = new Map();
	private busyTimers: Map<string, NodeJS.Timeout> = new Map();

	private async spawn(
		command: string,
		args: string[],
		worktreePath: string,
	): Promise<IPty> {
		const spawnOptions = {
			name: 'xterm-256color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: worktreePath,
			env: process.env,
		};

		return spawn(command, args, spawnOptions);
	}

	detectTerminalState(session: Session): SessionState {
		// Create a detector based on the session's detection strategy
		const strategy = session.detectionStrategy || 'claude';
		const detector = createStateDetector(strategy);
		const detectedState = detector.detectState(session.terminal, session.state);

		// If auto-approval is enabled and state is waiting_input, convert to pending_auto_approval
		if (
			detectedState === 'waiting_input' &&
			configurationManager.isAutoApprovalEnabled() &&
			!session.autoApprovalFailed
		) {
			return 'pending_auto_approval';
		}

		return detectedState;
	}

	private getTerminalContent(session: Session): string {
		const buffer = session.terminal.buffer.active;
		const lines: string[] = [];

		// Start from the bottom and work our way up
		for (
			let i = buffer.length - 1;
			i >= 0 && lines.length < TERMINAL_CONTENT_MAX_LINES;
			i--
		) {
			const line = buffer.getLine(i);
			if (line) {
				const text = line.translateToString(true);
				// Skip empty lines at the bottom
				if (lines.length > 0 || text.trim() !== '') {
					lines.unshift(text);
				}
			}
		}

		return lines.join('\n');
	}

	private handleAutoApproval(session: Session): void {
		// Get terminal content for verification
		const terminalContent = this.getTerminalContent(session);

		// Verify if permission is needed
		void Effect.runPromise(
			autoApprovalVerifier.verifyNeedsPermission(terminalContent),
		).then((needsPermission: boolean) => {
			if (needsPermission) {
				// Change state to waiting_input to ask for user permission
				logger.info(
					`[${session.id}] Auto-approval verification determined user permission needed`,
				);
				session.state = 'waiting_input';
				session.autoApprovalFailed = true;
				session.pendingState = undefined;
				session.pendingStateStart = undefined;
				this.emit('sessionStateChanged', session);
			} else {
				// Auto-approve by simulating Enter key press
				logger.info(
					`[${session.id}] Auto-approval granted, simulating user permission`,
				);
				session.process.write('\r');
			}
		});
	}

	constructor() {
		super();
		this.sessions = new Map();
	}

	private createSessionId(): string {
		return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	private createTerminal(): pkg.Terminal {
		return new Terminal({
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			allowProposedApi: true,
			logLevel: 'off',
		});
	}

	private async createSessionInternal(
		worktreePath: string,
		ptyProcess: IPty,
		commandConfig: {
			command: string;
			args?: string[];
			fallbackArgs?: string[];
		},
		options: {
			isPrimaryCommand?: boolean;
			detectionStrategy?: StateDetectionStrategy;
			devcontainerConfig?: DevcontainerConfig;
		} = {},
	): Promise<Session> {
		const id = this.createSessionId();
		const terminal = this.createTerminal();

		const session: Session = {
			id,
			worktreePath,
			process: ptyProcess,
			state: 'busy', // Session starts as busy when created
			output: [],
			outputHistory: [],
			lastActivity: new Date(),
			isActive: false,
			terminal,
			stateCheckInterval: undefined, // Will be set in setupBackgroundHandler
			isPrimaryCommand: options.isPrimaryCommand ?? true,
			commandConfig,
			detectionStrategy: options.detectionStrategy ?? 'claude',
			devcontainerConfig: options.devcontainerConfig ?? undefined,
			pendingState: undefined,
			pendingStateStart: undefined,
			autoApprovalFailed: false,
		};

		// Set up persistent background data handler for state detection
		this.setupBackgroundHandler(session);

		this.sessions.set(worktreePath, session);

		// Record the timestamp when this worktree was opened
		configurationManager.setWorktreeLastOpened(worktreePath, Date.now());

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
	): Effect.Effect<Session, ProcessError | ConfigError, never> {
		return Effect.tryPromise({
			try: async () => {
				// Check if session already exists
				const existing = this.sessions.get(worktreePath);
				if (existing) {
					return existing;
				}

				// Get preset configuration
				let preset = presetId
					? configurationManager.getPresetById(presetId)
					: null;
				if (!preset) {
					preset = configurationManager.getDefaultPreset();
				}

				// Validate preset exists
				if (!preset) {
					throw new ConfigError({
						configPath: 'configuration',
						reason: 'validation',
						details: presetId
							? `Preset with ID '${presetId}' not found and no default preset available`
							: 'No default preset available',
					});
				}

				const command = preset.command;
				const args = preset.args || [];
				const commandConfig = {
					command: preset.command,
					args: preset.args,
					fallbackArgs: preset.fallbackArgs,
				};

				// Spawn the process - fallback will be handled by setupExitHandler
				const ptyProcess = await this.spawn(command, args, worktreePath);

				return this.createSessionInternal(
					worktreePath,
					ptyProcess,
					commandConfig,
					{
						isPrimaryCommand: true,
						detectionStrategy: preset.detectionStrategy,
					},
				);
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

			// Store in output history as Buffer
			const buffer = Buffer.from(data, 'utf8');
			session.outputHistory.push(buffer);

			// Limit memory usage - keep max 10MB of output history
			const MAX_HISTORY_SIZE = 10 * 1024 * 1024; // 10MB
			let totalSize = session.outputHistory.reduce(
				(sum, buf) => sum + buf.length,
				0,
			);
			while (totalSize > MAX_HISTORY_SIZE && session.outputHistory.length > 0) {
				const removed = session.outputHistory.shift();
				if (removed) {
					totalSize -= removed.length;
				}
			}

			session.lastActivity = new Date();

			// Only emit data events when session is active
			if (session.isActive) {
				this.emit('sessionData', session, data);
			}
		});
	}

	/**
	 * Sets up exit handler for the session process.
	 * When the process exits with code 1 and it's the primary command,
	 * it will attempt to spawn a fallback process.
	 * If fallbackArgs are configured, they will be used.
	 * If no fallbackArgs are configured, the command will be retried with no arguments.
	 */
	private setupExitHandler(session: Session): void {
		session.process.onExit(async (e: {exitCode: number; signal?: number}) => {
			// Check if we should attempt fallback
			if (e.exitCode === 1 && !e.signal && session.isPrimaryCommand) {
				try {
					let fallbackProcess: IPty;
					// Use fallback args if available, otherwise use empty args
					const fallbackArgs = session.commandConfig?.fallbackArgs || [];

					// Check if we're in a devcontainer session
					if (session.devcontainerConfig) {
						// Parse the exec command to extract arguments
						const execParts =
							session.devcontainerConfig.execCommand.split(/\s+/);
						const devcontainerCmd = execParts[0] || 'devcontainer';
						const execArgs = execParts.slice(1);

						// Build fallback command for devcontainer
						const fallbackFullArgs = [
							...execArgs,
							'--',
							session.commandConfig?.command || 'claude',
							...fallbackArgs,
						];

						fallbackProcess = await this.spawn(
							devcontainerCmd,
							fallbackFullArgs,
							session.worktreePath,
						);
					} else {
						// Regular fallback without devcontainer
						fallbackProcess = await this.spawn(
							session.commandConfig?.command || 'claude',
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

		// Set up interval-based state detection with persistence
		session.stateCheckInterval = setInterval(() => {
			const oldState = session.state;
			const detectedState = this.detectTerminalState(session);
			const now = Date.now();

			// If detected state is different from current state
			if (detectedState !== oldState) {
				// If this is a new pending state or the pending state changed
				if (session.pendingState !== detectedState) {
					session.pendingState = detectedState;
					session.pendingStateStart = now;
				} else if (
					session.pendingState !== undefined &&
					session.pendingStateStart !== undefined
				) {
					// Check if the pending state has persisted long enough
					const duration = now - session.pendingStateStart;
					if (duration >= STATE_PERSISTENCE_DURATION_MS) {
						// Confirm the state change
						session.state = detectedState;
						session.pendingState = undefined;
						session.pendingStateStart = undefined;

						// Handle auto-approval if state is pending_auto_approval
						if (detectedState === 'pending_auto_approval') {
							this.handleAutoApproval(session);
						}
						// Execute status hook asynchronously (non-blocking) using Effect
						void Effect.runPromise(
							executeStatusHook(oldState, detectedState, session),
						);
						this.emit('sessionStateChanged', session);
					}
				}
			} else {
				// Detected state matches current state, clear any pending state
				session.pendingState = undefined;
				session.pendingStateStart = undefined;
			}
		}, STATE_CHECK_INTERVAL_MS);

		// Setup exit handler
		this.setupExitHandler(session);
	}

	private cleanupSession(session: Session): void {
		// Clear the state check interval
		if (session.stateCheckInterval) {
			clearInterval(session.stateCheckInterval);
			session.stateCheckInterval = undefined;
		}
		// Clear any pending state
		session.pendingState = undefined;
		session.pendingStateStart = undefined;
		// Update state to idle before destroying
		session.state = 'idle';
		this.emit('sessionStateChanged', session);
		this.destroySession(session.worktreePath);
		this.emit('sessionExit', session);
	}

	getSession(worktreePath: string): Session | undefined {
		return this.sessions.get(worktreePath);
	}

	setSessionActive(worktreePath: string, active: boolean): void {
		const session = this.sessions.get(worktreePath);
		if (session) {
			session.isActive = active;

			// If becoming active, record the timestamp when this worktree was opened
			if (active) {
				configurationManager.setWorktreeLastOpened(worktreePath, Date.now());

				// Emit a restore event with the output history if available
				if (session.outputHistory.length > 0) {
					this.emit('sessionRestore', session);
				}
			}
		}
	}

	destroySession(worktreePath: string): void {
		const session = this.sessions.get(worktreePath);
		if (session) {
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
			const timer = this.busyTimers.get(worktreePath);
			if (timer) {
				clearTimeout(timer);
				this.busyTimers.delete(worktreePath);
			}
			this.sessions.delete(worktreePath);
			this.waitingWithBottomBorder.delete(session.id);
			this.emit('sessionDestroyed', session);
		}
	}

	/**
	 * Terminate session and cleanup resources using Effect-based error handling
	 *
	 * @param {string} worktreePath - Path to the worktree
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
		worktreePath: string,
	): Effect.Effect<void, ProcessError, never> {
		return Effect.try({
			try: () => {
				const session = this.sessions.get(worktreePath);
				if (!session) {
					throw new ProcessError({
						command: 'terminateSession',
						message: `Session not found for worktree: ${worktreePath}`,
					});
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
				const timer = this.busyTimers.get(worktreePath);
				if (timer) {
					clearTimeout(timer);
					this.busyTimers.delete(worktreePath);
				}

				// Remove from sessions map and cleanup
				this.sessions.delete(worktreePath);
				this.waitingWithBottomBorder.delete(session.id);
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
							: `Failed to terminate session for ${worktreePath}`,
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
	): Effect.Effect<Session, ProcessError | ConfigError, never> {
		return Effect.tryPromise({
			try: async () => {
				// Check if session already exists
				const existing = this.sessions.get(worktreePath);
				if (existing) {
					return existing;
				}

				// Execute devcontainer up command first
				try {
					await execAsync(devcontainerConfig.upCommand, {cwd: worktreePath});
				} catch (error) {
					throw new ProcessError({
						command: devcontainerConfig.upCommand,
						message: `Failed to start devcontainer: ${error instanceof Error ? error.message : String(error)}`,
					});
				}

				// Get preset configuration
				let preset = presetId
					? configurationManager.getPresetById(presetId)
					: null;
				if (!preset) {
					preset = configurationManager.getDefaultPreset();
				}

				// Validate preset exists
				if (!preset) {
					throw new ConfigError({
						configPath: 'configuration',
						reason: 'validation',
						details: presetId
							? `Preset with ID '${presetId}' not found and no default preset available`
							: 'No default preset available',
					});
				}

				// Parse the exec command to extract arguments
				const execParts = devcontainerConfig.execCommand.split(/\s+/);
				const devcontainerCmd = execParts[0] || 'devcontainer';
				const execArgs = execParts.slice(1);

				// Build the full command: devcontainer exec [args] -- [preset command] [preset args]
				const fullArgs = [
					...execArgs,
					'--',
					preset.command,
					...(preset.args || []),
				];

				// Spawn the process within devcontainer
				const ptyProcess = await this.spawn(
					devcontainerCmd,
					fullArgs,
					worktreePath,
				);

				const commandConfig = {
					command: preset.command,
					args: preset.args,
					fallbackArgs: preset.fallbackArgs,
				};

				return this.createSessionInternal(
					worktreePath,
					ptyProcess,
					commandConfig,
					{
						isPrimaryCommand: true,
						detectionStrategy: preset.detectionStrategy,
						devcontainerConfig,
					},
				);
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
		// Clean up all sessions
		for (const worktreePath of this.sessions.keys()) {
			this.destroySession(worktreePath);
		}
	}

	static getSessionCounts(sessions: Session[]): SessionCounts {
		const counts: SessionCounts = {
			idle: 0,
			busy: 0,
			waiting_input: 0,
			pending_auto_approval: 0,
			total: sessions.length,
		};

		sessions.forEach(session => {
			switch (session.state) {
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

		return parts.length > 0 ? ` (${parts.join(' / ')})` : '';
	}
}
