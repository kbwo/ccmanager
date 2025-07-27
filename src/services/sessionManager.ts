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
import {WorktreeService} from './worktreeService.js';
import {createStateDetector} from './stateDetector.js';
const {Terminal} = pkg;
const execAsync = promisify(exec);

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
			name: 'xterm-color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: worktreePath,
			env: process.env,
		};

		return spawn(command, args, spawnOptions);
	}

	detectTerminalState(session: Session): SessionState {
		try {
			// Create a detector based on the session's detection strategy
			const strategy = session.detectionStrategy || 'claude';
			const detector = createStateDetector(strategy);
			return detector.detectState(session.terminal);
		} catch {
			// Return idle state if detection fails
			return 'idle';
		}
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
			isPrimaryCommand: options.isPrimaryCommand ?? true,
			commandConfig,
			detectionStrategy: options.detectionStrategy ?? 'claude',
			devcontainerConfig: options.devcontainerConfig,
		};

		// Set up persistent background data handler for state detection
		this.setupBackgroundHandler(session);

		this.sessions.set(worktreePath, session);

		this.emit('sessionCreated', session);

		return session;
	}

	async createSessionWithPreset(
		worktreePath: string,
		presetId?: string,
	): Promise<Session> {
		// Check if session already exists
		const existing = this.sessions.get(worktreePath);
		if (existing) {
			return existing;
		}

		// Get preset configuration
		let preset = presetId ? configurationManager.getPresetById(presetId) : null;
		if (!preset) {
			preset = configurationManager.getDefaultPreset();
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

		return this.createSessionInternal(worktreePath, ptyProcess, commandConfig, {
			isPrimaryCommand: true,
			detectionStrategy: preset.detectionStrategy,
		});
	}

	private setupDataHandler(session: Session): void {
		// This handler always runs for all data
		session.process.onData((data: string) => {
			// Write data to virtual terminal with error suppression
			try {
				session.terminal.write(data);
			} catch {
				// Suppress xterm.js parsing errors
			}

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

		// Set up interval-based state detection
		session.stateCheckInterval = setInterval(() => {
			const oldState = session.state;
			const newState = this.detectTerminalState(session);

			if (newState !== oldState) {
				session.state = newState;
				this.executeStatusHook(oldState, newState, session);
				this.emit('sessionStateChanged', session);
			}
		}, 100); // Check every 100ms

		// Setup exit handler
		this.setupExitHandler(session);
	}

	private cleanupSession(session: Session): void {
		// Clear the state check interval
		if (session.stateCheckInterval) {
			clearInterval(session.stateCheckInterval);
		}
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

			// If becoming active, emit a restore event with the output history
			if (active && session.outputHistory.length > 0) {
				this.emit('sessionRestore', session);
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

	getAllSessions(): Session[] {
		return Array.from(this.sessions.values());
	}

	private executeStatusHook(
		oldState: SessionState,
		newState: SessionState,
		session: Session,
	): void {
		const statusHooks = configurationManager.getStatusHooks();
		const hook = statusHooks[newState];

		if (hook && hook.enabled && hook.command) {
			// Get branch information
			const worktreeService = new WorktreeService();
			const worktrees = worktreeService.getWorktrees();
			const worktree = worktrees.find(wt => wt.path === session.worktreePath);
			const branch = worktree?.branch || 'unknown';

			// Execute the hook command in the session's worktree directory
			exec(
				hook.command,
				{
					cwd: session.worktreePath,
					env: {
						...process.env,
						CCMANAGER_OLD_STATE: oldState,
						CCMANAGER_NEW_STATE: newState,
						CCMANAGER_WORKTREE: session.worktreePath,
						CCMANAGER_WORKTREE_BRANCH: branch,
						CCMANAGER_SESSION_ID: session.id,
					},
				},
				(error, _stdout, stderr) => {
					if (error) {
						console.error(
							`Failed to execute ${newState} hook: ${error.message}`,
						);
					}
					if (stderr) {
						console.error(`Hook stderr: ${stderr}`);
					}
				},
			);
		}
	}

	async createSessionWithDevcontainer(
		worktreePath: string,
		devcontainerConfig: DevcontainerConfig,
		presetId?: string,
	): Promise<Session> {
		// Check if session already exists
		const existing = this.sessions.get(worktreePath);
		if (existing) {
			return existing;
		}

		// Execute devcontainer up command first
		try {
			await execAsync(devcontainerConfig.upCommand, {cwd: worktreePath});
		} catch (error) {
			throw new Error(
				`Failed to start devcontainer: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Get preset configuration
		let preset = presetId ? configurationManager.getPresetById(presetId) : null;
		if (!preset) {
			preset = configurationManager.getDefaultPreset();
		}

		// Parse the exec command to extract arguments
		const execParts = devcontainerConfig.execCommand.split(/\s+/);
		const devcontainerCmd = execParts[0] || 'devcontainer'; // Should be 'devcontainer'
		const execArgs = execParts.slice(1); // Rest of the exec command args

		// Build the full command: devcontainer exec [args] -- [preset command] [preset args]
		const fullArgs = [
			...execArgs,
			'--',
			preset.command,
			...(preset.args || []),
		];

		// Spawn the process within devcontainer - fallback will be handled by setupExitHandler
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

		return this.createSessionInternal(worktreePath, ptyProcess, commandConfig, {
			isPrimaryCommand: true,
			detectionStrategy: preset.detectionStrategy,
			devcontainerConfig,
		});
	}

	destroy(): void {
		// Clean up all sessions
		for (const worktreePath of this.sessions.keys()) {
			this.destroySession(worktreePath);
		}
	}
}
