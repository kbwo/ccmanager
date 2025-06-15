import {IPty} from 'node-pty';
import type pkg from '@xterm/headless';

export type Terminal = InstanceType<typeof pkg.Terminal>;

export type SessionState = 'idle' | 'busy' | 'waiting_input';

export interface Worktree {
	path: string;
	branch: string;
	isMainWorktree: boolean;
	hasSession: boolean;
}

export interface Session {
	id: string;
	worktreePath: string;
	process: IPty;
	state: SessionState;
	output: string[]; // Recent output for state detection
	outputHistory: Buffer[]; // Full output history as buffers
	lastActivity: Date;
	isActive: boolean;
	terminal: Terminal; // Virtual terminal for state detection (xterm Terminal instance)
	stateCheckInterval?: NodeJS.Timeout; // Interval for checking terminal state
}

export interface SessionManager {
	sessions: Map<string, Session>;
	createSession(worktreePath: string): Session;
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
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
	returnToMenu: {ctrl: true, key: 'e'},
	cancel: {key: 'escape'},
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

export interface ConfigurationData {
	shortcuts?: ShortcutConfig;
	statusHooks?: StatusHookConfig;
	worktree?: WorktreeConfig;
}
