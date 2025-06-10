import {spawn} from 'node-pty';
import {
	Session,
	SessionManager as ISessionManager,
	SessionState,
} from '../types/index.js';
import {EventEmitter} from 'events';
import {includesPromptBoxBottomBorder} from '../utils/promptDetector.js';

export class SessionManager extends EventEmitter implements ISessionManager {
	sessions: Map<string, Session>;
	private waitingWithBottomBorder: Map<string, boolean> = new Map();

	private stripAnsi(str: string): string {
		// Remove all ANSI escape sequences including cursor movement, color codes, etc.
		return str
			.replace(/\x1b\[[0-9;]*m/g, '') // Color codes (including 24-bit)
			.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences
			.replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences
			.replace(/\x1b[PX^_].*?\x1b\\/g, '') // DCS/PM/APC/SOS sequences
			.replace(/\x1b\[\?[0-9;]*[hl]/g, '') // Private mode sequences
			.replace(/\x1b[>=]/g, '') // Other escape sequences
			.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '') // Control characters except newline (\x0A)
			.replace(/\r/g, '') // Carriage returns
			.replace(/^[0-9;]+m/gm, '') // Orphaned color codes at line start
			.replace(/[0-9]+;[0-9]+;[0-9;]+m/g, ''); // Orphaned 24-bit color codes
	}

	detectSessionState(
		cleanData: string,
		currentState: SessionState,
		sessionId: string,
	): SessionState {
		const hasBottomBorder = includesPromptBoxBottomBorder(cleanData);
		const hasWaitingPrompt = cleanData.includes('│ Do you want');
		const wasWaitingWithBottomBorder =
			this.waitingWithBottomBorder.get(sessionId) || false;

		let newState = currentState;

		// Check if current state is waiting and this is just a prompt box bottom border
		if (hasWaitingPrompt) {
			newState = 'waiting_input';
			// Check if this same data also contains the bottom border
			if (hasBottomBorder) {
				this.waitingWithBottomBorder.set(sessionId, true);
			} else {
				this.waitingWithBottomBorder.set(sessionId, false);
			}
		} else if (
			currentState === 'waiting_input' &&
			hasBottomBorder &&
			!hasWaitingPrompt &&
			!wasWaitingWithBottomBorder
		) {
			// Keep the waiting state and mark that we've seen the bottom border
			newState = 'waiting_input';
			this.waitingWithBottomBorder.set(sessionId, true);
		} else if (cleanData.toLowerCase().includes('esc to interrupt')) {
			newState = 'busy';
			this.waitingWithBottomBorder.set(sessionId, false);
		} else {
			newState = 'idle';
			this.waitingWithBottomBorder.set(sessionId, false);
		}

		return newState;
	}

	constructor() {
		super();
		this.sessions = new Map();
	}

	createSession(worktreePath: string): Session {
		// Check if session already exists
		const existing = this.sessions.get(worktreePath);
		if (existing) {
			return existing;
		}

		const id = `session-${Date.now()}-${Math.random()
			.toString(36)
			.substr(2, 9)}`;

		// Parse Claude command arguments from environment variable
		const claudeArgs = process.env['CCMANAGER_CLAUDE_ARGS']
			? process.env['CCMANAGER_CLAUDE_ARGS'].split(' ')
			: [];

		const ptyProcess = spawn('claude', claudeArgs, {
			name: 'xterm-color',
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: worktreePath,
			env: process.env,
		});

		const session: Session = {
			id,
			worktreePath,
			process: ptyProcess,
			state: 'busy', // Session starts as busy when created
			output: [],
			outputHistory: [],
			lastActivity: new Date(),
			isActive: false,
		};

		// Set up persistent background data handler for state detection
		this.setupBackgroundHandler(session);

		this.sessions.set(worktreePath, session);

		this.emit('sessionCreated', session);

		return session;
	}

	private setupBackgroundHandler(session: Session): void {
		// This handler always runs for all data
		session.process.onData((data: string) => {
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

			// Also store for state detection
			session.output.push(data);
			// Keep only last 100 chunks for state detection
			if (session.output.length > 100) {
				session.output.shift();
			}

			session.lastActivity = new Date();

			// Strip ANSI codes for pattern matching
			const cleanData = this.stripAnsi(data);

			// Skip state monitoring if cleanData is empty
			if (!cleanData.trim()) {
				// Only emit data events when session is active
				if (session.isActive) {
					this.emit('sessionData', session, data);
				}
				return;
			}

			// Detect state based on the new data
			const oldState = session.state;
			const newState = this.detectSessionState(cleanData, oldState, session.id);

			// Update state if changed
			if (newState !== oldState) {
				session.state = newState;
				this.emit('sessionStateChanged', session);
			}

			// Only emit data events when session is active
			if (session.isActive) {
				this.emit('sessionData', session, data);
			}
		});

		session.process.onExit(() => {
			// Update state to idle before destroying
			session.state = 'idle';
			this.emit('sessionStateChanged', session);
			this.destroySession(session.worktreePath);
			this.emit('sessionExit', session);
		});
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
			try {
				session.process.kill();
			} catch (_error) {
				// Process might already be dead
			}
			this.sessions.delete(worktreePath);
			this.waitingWithBottomBorder.delete(session.id);
			this.emit('sessionDestroyed', session);
		}
	}

	getAllSessions(): Session[] {
		return Array.from(this.sessions.values());
	}

	destroy(): void {
		// Clean up all sessions
		for (const worktreePath of this.sessions.keys()) {
			this.destroySession(worktreePath);
		}
	}
}
