import type {IPty} from '../services/bunTerminal.js';
import type pkg from '@xterm/headless';
import {GitStatus} from '../utils/gitStatus.js';
import {Mutex, SessionStateData} from '../utils/mutex.js';
import type {StateDetector} from '../services/stateDetector/types.js';

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
	| 'cline'
	| 'opencode'
	| 'kimi';

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
	output: string[]; // Recent output for state detection
	outputHistory: Buffer[]; // Full output history as buffers
	lastActivity: Date;
	isActive: boolean;
	terminal: Terminal; // Virtual terminal for state detection (xterm Terminal instance)
	stateCheckInterval: NodeJS.Timeout | undefined; // Interval for checking terminal state
	isPrimaryCommand: boolean; // Track if process was started with main command args
	detectionStrategy: StateDetectionStrategy | undefined; // State detection strategy for this session
	devcontainerConfig: DevcontainerConfig | undefined; // Devcontainer configuration if session runs in container
	/**
	 * Mutex-protected session state data.
	 * Access via stateMutex.runExclusive() or stateMutex.update() to ensure thread-safe operations.
	 * Contains: state, pendingState, pendingStateStart, autoApprovalFailed, autoApprovalReason, autoApprovalAbortController
	 */
	stateMutex: Mutex<SessionStateData>;
	/**
	 * State detector instance for this session.
	 * Created once during session initialization based on detectionStrategy.
	 */
	stateDetector: StateDetector;
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
	pre_creation?: WorktreeHook;
	post_creation?: WorktreeHook;
}

export interface WorktreeConfig {
	autoDirectory: boolean;
	autoDirectoryPattern?: string; // Optional pattern for directory generation
	copySessionData?: boolean; // Whether to copy Claude session data by default
	sortByLastSession?: boolean; // Whether to sort worktrees by last opened session
	autoUseDefaultBranch?: boolean; // Whether to automatically use default branch as base branch
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
	commandPresets?: CommandPresetsConfig;
	autoApproval?: {
		enabled: boolean; // Whether auto-approval is enabled
		customCommand?: string; // Custom verification command; must output JSON matching AutoApprovalResponse
		timeout?: number; // Timeout in seconds for auto-approval verification (default: 30)
		clearHistoryOnClear?: boolean; // Clear output history when screen clear escape sequence is detected
	};
}

// Per-project configuration support
export type ConfigScope = 'project' | 'global';

export interface AutoApprovalConfig {
	enabled: boolean;
	customCommand?: string;
	timeout?: number;
	clearHistoryOnClear?: boolean; // Clear output history when screen clear escape sequence is detected
}

export interface ProjectConfigurationData {
	shortcuts?: ShortcutConfig;
	statusHooks?: StatusHookConfig;
	worktreeHooks?: WorktreeHookConfig;
	worktree?: WorktreeConfig;
	commandPresets?: CommandPresetsConfig;
	autoApproval?: AutoApprovalConfig;
}

/**
 * Common interface for configuration readers.
 * Provides read-only access to configuration values.
 * Implemented by ConfigReader, ConfigEditor, GlobalConfigManager, ProjectConfigManager.
 */
export interface IConfigReader {
	// Shortcuts
	getShortcuts(): ShortcutConfig | undefined;

	// Status Hooks
	getStatusHooks(): StatusHookConfig | undefined;

	// Worktree Hooks
	getWorktreeHooks(): WorktreeHookConfig | undefined;

	// Worktree Config
	getWorktreeConfig(): WorktreeConfig | undefined;

	// Command Presets
	getCommandPresets(): CommandPresetsConfig | undefined;

	// Auto Approval
	getAutoApprovalConfig(): AutoApprovalConfig | undefined;

	// Reload config from disk
	reload(): void;
}

/**
 * Common interface for configuration editors.
 * Extends IConfigReader with write capabilities.
 * Implemented by ConfigEditor, GlobalConfigManager, ProjectConfigManager.
 */
export interface IConfigEditor extends IConfigReader {
	// Shortcuts
	setShortcuts(value: ShortcutConfig): void;

	// Status Hooks
	setStatusHooks(value: StatusHookConfig): void;

	// Worktree Hooks
	setWorktreeHooks(value: WorktreeHookConfig): void;

	// Worktree Config
	setWorktreeConfig(value: WorktreeConfig): void;

	// Command Presets
	setCommandPresets(value: CommandPresetsConfig): void;

	// Auto Approval
	setAutoApprovalConfig(value: AutoApprovalConfig): void;
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
	branchName: string;
	matches: RemoteBranchMatch[];

	constructor(branchName: string, matches: RemoteBranchMatch[]) {
		super(
			`Ambiguous branch '${branchName}' found in multiple remotes: ${matches
				.map(m => m.fullRef)
				.join(', ')}. Please specify which remote to use.`,
		);
		this.name = 'AmbiguousBranchError';
		this.branchName = branchName;
		this.matches = matches;
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
		| import('../types/errors.js').FileSystemError
		| import('../types/errors.js').ProcessError,
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
