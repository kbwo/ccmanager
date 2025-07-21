// Environment variable constants for multi-project configuration
export const MULTI_PROJECT_ENV_VARS = {
	MULTI_PROJECT_ROOT: 'CCMANAGER_MULTI_PROJECT_ROOT',
	PROJECTS_DIR: 'CCMANAGER_MULTI_PROJECT_ROOT',
} as const;

// Default values and messages
export const MULTI_PROJECT_DEFAULTS = {
	ERROR_NO_PROJECTS_DIR:
		'CCMANAGER_MULTI_PROJECT_ROOT environment variable is required in multi-project mode',
	ERROR_INVALID_PROJECTS_DIR:
		'CCMANAGER_MULTI_PROJECT_ROOT points to a non-existent directory',
	ERROR_NO_PROJECTS_FOUND:
		'No git repositories found in the projects directory',
	ERROR_CORRUPTED_REPO: 'Git repository is corrupted or inaccessible',
} as const;

// Multi-project UI constants
export const MULTI_PROJECT_UI = {
	MODE_NORMAL: 'Normal Mode',
	MODE_MULTI_PROJECT: 'Multi-Project Mode',
	EXPAND_INDICATOR: '▶',
	COLLAPSE_INDICATOR: '▼',
	PROJECT_INDENT: '  ',
	WORKTREE_INDENT: '    ',
} as const;
