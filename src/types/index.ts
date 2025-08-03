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
	autopilotState?: AutopilotMonitorState; // Auto-pilot monitoring state
}

export interface SessionManager {
	sessions: Map<string, Session>;
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
	copySessionData?: boolean; // Whether to copy Claude session data by default
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

export interface AutopilotConfig {
	enabled: boolean;
	provider: 'openai' | 'anthropic';
	model: string;
	maxGuidancesPerHour: number;
	analysisDelayMs: number;
	interventionThreshold: number; // Confidence threshold for intervention (0.0 = always intervene, 1.0 = never intervene)
	guidePrompt?: string; // Manual guidance instructions from user
	learningConfig?: LearningConfig; // Self-updating intelligence configuration
	apiKeys: {
		openai?: string;
		anthropic?: string;
	};
}

export interface AutopilotDecision {
	shouldIntervene: boolean;
	guidance?: string;
	confidence: number;
	reasoning: string;
}

export interface AutopilotMonitorState {
	isActive: boolean;
	guidancesProvided: number;
	lastGuidanceTime?: Date;
	analysisInProgress: boolean;
}

// Guidance Orchestration System Interfaces
export interface AnalysisContext {
	terminalOutput: string;
	projectPath?: string;
	sessionState: SessionState;
	worktreePath: string;
	userHistory?: UserInputPattern[];
	metadata?: Record<string, unknown>;
}

export interface GuidanceResult {
	shouldIntervene: boolean;
	confidence: number;
	guidance?: string;
	reasoning: string;
	source: string;
	priority: number;
	metadata?: Record<string, unknown>;
}

export interface GuidanceSource {
	readonly id: string;
	readonly priority: number;
	readonly canShortCircuit: boolean;

	analyze(context: AnalysisContext): Promise<GuidanceResult>;
}

export interface UserInputPattern {
	sessionId: string;
	timestamp: Date;
	input: string;
	context: string;
	inputType: 'instruction' | 'correction' | 'question';
	isGuidanceRelated?: boolean;
}

export interface LearningConfig {
	enabled: boolean; // Opt-in learning
	approvalRequired: boolean; // Always true for now
	retentionDays: number; // Default 30 days
	minPatternConfidence: number; // Default 0.7
}

export interface LearnedPattern {
	id: string;
	category: 'style' | 'workflow' | 'testing' | 'architecture' | 'communication';
	instruction: string;
	confidence: number;
	frequency: number;
	lastSeen: Date;
	approved: boolean;
}

export interface ConfigurationData {
	shortcuts?: ShortcutConfig;
	statusHooks?: StatusHookConfig;
	worktree?: WorktreeConfig;
	command?: CommandConfig;
	commandPresets?: CommandPresetsConfig; // New field for command presets
	autopilot?: AutopilotConfig;
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
	refreshProjects(): Promise<void>;

	// Recent projects methods
	getRecentProjects(limit?: number): RecentProject[];
	addRecentProject(project: GitProject): void;
	clearRecentProjects(): void;

	// Project validation
	validateGitRepository(path: string): Promise<boolean>;
}

export interface IWorktreeService {
	getWorktrees(): Worktree[];
	getGitRootPath(): string;
	createWorktree(
		worktreePath: string,
		branch: string,
		baseBranch: string,
		copySessionData?: boolean,
		copyClaudeDirectory?: boolean,
	): {success: boolean; error?: string};
	deleteWorktree(
		worktreePath: string,
		options?: {deleteBranch?: boolean},
	): {success: boolean; error?: string};
	mergeWorktree(
		worktreePath: string,
		targetBranch?: string,
	): {
		success: boolean;
		mergedBranch?: string;
		error?: string;
		deletedWorktree?: boolean;
	};
}
