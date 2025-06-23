import {IPty} from 'node-pty';
import type pkg from '@xterm/headless';

export type Terminal = InstanceType<typeof pkg.Terminal>;

export type SessionState = 'idle' | 'busy' | 'waiting_input';

export type TerminalMode = 'claude' | 'bash';

export interface Worktree {
	path: string;
	branch?: string;
	isMainWorktree: boolean;
	hasSession: boolean;
}

export interface Session {
	id: string;
	worktreePath: string;
	process: IPty;
	state: SessionState;
	output: string[]; // Recent output for state detection
	outputHistory: Buffer[]; // Full output history as buffers (Claude mode)
	lastActivity: Date;
	isActive: boolean;
	terminal: Terminal; // Virtual terminal for state detection (xterm Terminal instance)
	stateCheckInterval?: NodeJS.Timeout; // Interval for checking terminal state
	isPrimaryCommand?: boolean; // Track if process was started with main command args
	commandConfig?: CommandConfig; // Store command config for fallback

	// Dual-mode properties
	bashProcess?: IPty; // Bash PTY instance (created on-demand)
	currentMode: TerminalMode; // Current active mode
	bashHistory: Buffer[]; // Bash mode history for restoration
	bashState: 'idle' | 'running'; // Simple state tracking for bash
	bashWorkingDirectory?: string; // Bash PWD tracking
}

export interface SessionManager {
	sessions: Map<string, Session>;
	createSession(worktreePath: string): Promise<Session>;
	getSession(worktreePath: string): Session | undefined;
	destroySession(worktreePath: string): void;
	getAllSessions(): Session[];
}

export interface ShortcutKey {
	ctrl?: boolean;
	alt?: boolean;
	shift?: boolean;
	key: string;
}

export interface ShortcutConfig {
	returnToMenu: ShortcutKey;
	cancel: ShortcutKey;
	toggleMode: ShortcutKey; // Toggle between Claude and Bash modes
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
	returnToMenu: {ctrl: true, key: 'e'},
	cancel: {key: 'escape'},
	toggleMode: {ctrl: true, key: 't'},
};

export interface StatusHook {
	command: string;
	enabled: boolean;
}

export interface StatusHookConfig {
	idle?: StatusHook;
	busy?: StatusHook;
	waiting_input?: StatusHook;
}

export interface WorktreeConfig {
	autoDirectory: boolean;
	autoDirectoryPattern?: string; // Optional pattern for directory generation
}

export interface CommandConfig {
	command: string; // The main command to execute (default: 'claude')
	args?: string[]; // Arguments to pass to the command
	fallbackArgs?: string[]; // Fallback arguments if main command fails
}

export interface ConfigurationData {
	shortcuts?: ShortcutConfig;
	statusHooks?: StatusHookConfig;
	worktree?: WorktreeConfig;
	command?: CommandConfig;
}
