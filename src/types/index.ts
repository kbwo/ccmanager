import {IPty} from 'node-pty';
import type pkg from '@xterm/headless';
import {GitStatus} from '../utils/gitStatus.js';

export type Terminal = InstanceType<typeof pkg.Terminal>;

export type SessionState = 'idle' | 'busy' | 'waiting_input';

export type StateDetectionStrategy = 'claude' | 'gemini' | 'codex';

export interface Worktree {
	path: string;
	branch?: string;
	isMainWorktree: boolean;
	hasSession: boolean;
	gitStatus?: GitStatus;
	gitStatusError?: string;
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
	isPrimaryCommand?: boolean; // Track if process was started with main command args
	commandConfig?: CommandConfig; // Store command config for fallback
	detectionStrategy?: StateDetectionStrategy; // State detection strategy for this session
	devcontainerConfig?: DevcontainerConfig; // Devcontainer configuration if session runs in container
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

export interface CommandConfig {
	command: string; // The main command to execute (default: 'claude')
	args?: string[]; // Arguments to pass to the command
	fallbackArgs?: string[]; // Fallback arguments if main command fails
}

export interface CommandPreset {
	id: string; // Unique identifier for the preset
	name: string; // User-friendly name for the preset
	command: string; // The main command to execute
	args?: string[]; // Arguments to pass to the command
	fallbackArgs?: string[]; // Fallback arguments if main command fails
	detectionStrategy?: StateDetectionStrategy; // State detection strategy (defaults to 'claude')
}

export interface CommandPresetsConfig {
	presets: CommandPreset[]; // List of available presets
	defaultPresetId: string; // ID of the default preset to use
	selectPresetOnStart?: boolean; // Whether to show preset selector before starting session
}

export interface DevcontainerConfig {
	upCommand: string; // Command to start devcontainer
	execCommand: string; // Command to execute in devcontainer
}

export interface ConfigurationData {
	shortcuts?: ShortcutConfig;
	statusHooks?: StatusHookConfig;
	worktree?: WorktreeConfig;
	command?: CommandConfig;
	commandPresets?: CommandPresetsConfig; // New field for command presets
}
