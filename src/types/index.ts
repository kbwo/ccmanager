import {IPty} from 'node-pty';
import type pkg from '@xterm/headless';
import {GitStatus} from '../utils/gitStatus.js';

export type Terminal = InstanceType<typeof pkg.Terminal>;

export type SessionState =
	| 'idle'
	| 'busy'
	| 'waiting_input'
	| 'pending_auto_approval';

export type StateDetectionStrategy =
	| 'claude'
	| 'gemini'
	| 'codex'
	| 'cursor'
	| 'github-copilot'
	| 'cline';

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
	stateCheckInterval: NodeJS.Timeout | undefined; // Interval for checking terminal state
	isPrimaryCommand: boolean; // Track if process was started with main command args
	commandConfig: CommandConfig | undefined; // Store command config for fallback
	detectionStrategy: StateDetectionStrategy | undefined; // State detection strategy for this session
	devcontainerConfig: DevcontainerConfig | undefined; // Devcontainer configuration if session runs in container
	pendingState: SessionState | undefined; // State that's been detected but not yet confirmed
	pendingStateStart: number | undefined; // Timestamp when pending state was first detected
	autoApprovalFailed: boolean; // Whether auto-approval verification determined user permission is needed
	autoApprovalReason?: string; // Optional reason provided when auto-approval failed
	autoApprovalAbortController?: AbortController; // Abort controller to cancel in-flight auto-approval verification
}

export interface AutoApprovalResponse {
	needsPermission: boolean;
	reason?: string;
}

export interface SessionManager {
	sessions: Map<string, Session>;
	getSession(worktreePath: string): Session | undefined;
	destroySession(worktreePath: string): void;
	getAllSessions(): Session[];
	cancelAutoApproval(worktreePath: string, reason?: string): void;
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
	pending_auto_approval?: StatusHook;
}

export interface WorktreeHook {
	command: string;
	enabled: boolean;
}

export interface WorktreeHookConfig {
	post_creation?: WorktreeHook;
}

export interface WorktreeConfig {
	autoDirectory: boolean;
	autoDirectoryPattern?: string; // Optional pattern for directory generation
	copySessionData?: boolean; // Whether to copy Claude session data by default
	sortByLastSession?: boolean; // Whether to sort worktrees by last opened session
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
	worktreeHooks?: WorktreeHookConfig;
	worktree?: WorktreeConfig;
	command?: CommandConfig;
	commandPresets?: CommandPresetsConfig; // New field for command presets
	autoApproval?: {
		enabled: boolean; // Whether auto-approval is enabled
		customCommand?: string; // Custom verification command; must output JSON matching AutoApprovalResponse
	};
}

// Multi-project support interfaces
export interface GitProject {
	name: string; // Project name (directory name)
	path: string; // Full path to the git repository
	relativePath: string; // Relative path from CCMANAGER_MULTI_PROJECT_ROOT
	isValid: boolean; // Whether the project is a valid git repository
	error?: string; // Error message if project is invalid
}

export interface MultiProjectConfig {
	enabled: boolean; // Whether multi-project mode is enabled
	projectsDir: string; // Path to directory containing git projects (from CCMANAGER_MULTI_PROJECT_ROOT)
	rootMarker?: string; // Optional marker from CCMANAGER_MULTI_PROJECT_ROOT
}

export type MenuMode = 'normal' | 'multi-project';

export interface IMultiProjectService {
	discoverProjects(projectsDir: string): Promise<GitProject[]>;
	validateGitRepository(path: string): Promise<boolean>;
}

export interface RecentProject {
	path: string;
	name: string;
	lastAccessed: number;
}

export interface IProjectManager {
	currentMode: MenuMode;
	currentProject?: GitProject;
	projects: GitProject[];

	setMode(mode: MenuMode): void;
	selectProject(project: GitProject): void;
	getWorktreeService(projectPath?: string): IWorktreeService;

	// Recent projects methods
	getRecentProjects(limit?: number): RecentProject[];
	addRecentProject(project: GitProject): void;
	clearRecentProjects(): void;

	// Project validation
	validateGitRepository(path: string): Promise<boolean>;
}

// Branch resolution types
export interface RemoteBranchMatch {
	remote: string;
	branch: string;
	fullRef: string; // e.g., "origin/foo/bar-xyz"
}

export class AmbiguousBranchError extends Error {
	constructor(
		public branchName: string,
		public matches: RemoteBranchMatch[],
	) {
		super(
			`Ambiguous branch '${branchName}' found in multiple remotes: ${matches
				.map(m => m.fullRef)
				.join(', ')}. Please specify which remote to use.`,
		);
		this.name = 'AmbiguousBranchError';
	}
}

export interface IWorktreeService {
	getWorktreesEffect(options?: {
		sortByLastSession?: boolean;
	}): import('effect').Effect.Effect<
		Worktree[],
		import('../types/errors.js').GitError,
		never
	>;
	getGitRootPath(): string;
	createWorktreeEffect(
		worktreePath: string,
		branch: string,
		baseBranch: string,
		copySessionData?: boolean,
		copyClaudeDirectory?: boolean,
	): import('effect').Effect.Effect<
		Worktree,
		| import('../types/errors.js').GitError
		| import('../types/errors.js').FileSystemError,
		never
	>;
	deleteWorktreeEffect(
		worktreePath: string,
		options?: {deleteBranch?: boolean},
	): import('effect').Effect.Effect<
		void,
		import('../types/errors.js').GitError,
		never
	>;
	mergeWorktreeEffect(
		sourceBranch: string,
		targetBranch: string,
		useRebase?: boolean,
	): import('effect').Effect.Effect<
		void,
		import('../types/errors.js').GitError,
		never
	>;
}
