import path from 'path';
import stripAnsi from 'strip-ansi';
import {Worktree, Session, ProjectContext} from '../types/index.js';
import {getStatusDisplay} from '../constants/statusIcons.js';
import {
	formatGitFileChanges,
	formatGitAheadBehind,
	formatParentBranch,
} from './gitStatus.js';
import {ContextBuilder} from '../services/contextBuilder.js';
import {configurationManager} from '../services/configurationManager.js';

// Constants
const MAX_BRANCH_NAME_LENGTH = 40; // Maximum characters for branch name display
const MIN_COLUMN_PADDING = 2; // Minimum spaces between columns

/**
 * Worktree item with formatted content for display.
 */
interface WorktreeItem {
	worktree: Worktree;
	session?: Session;
	baseLabel: string;
	fileChanges: string;
	aheadBehind: string;
	parentBranch: string;
	projectContext?: string; // Context info like "react/ts" or "node/js"
	error?: string;
	// Visible lengths (without ANSI codes) for alignment calculation
	lengths: {
		base: number;
		fileChanges: number;
		aheadBehind: number;
		parentBranch: number;
		projectContext: number;
	};
}

// Utility function to truncate strings with ellipsis
export function truncateString(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return str.substring(0, maxLength - 3) + '...';
}

export function generateWorktreeDirectory(
	branchName: string,
	pattern?: string,
): string {
	// Default pattern if not specified
	const defaultPattern = '../{branch}';
	const activePattern = pattern || defaultPattern;

	// Sanitize branch name for filesystem
	// Replace slashes with dashes, remove special characters
	const sanitizedBranch = branchName
		.replace(/\//g, '-') // Replace forward slashes with dashes
		.replace(/[^a-zA-Z0-9-_.]/g, '') // Remove special characters except dash, dot, underscore
		.replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
		.toLowerCase(); // Convert to lowercase for consistency

	// Replace placeholders in pattern
	const directory = activePattern
		.replace('{branch}', sanitizedBranch)
		.replace('{branch-name}', sanitizedBranch);

	// Ensure the path is relative to the repository root
	return path.normalize(directory);
}

export function extractBranchParts(branchName: string): {
	prefix?: string;
	name: string;
} {
	const parts = branchName.split('/');
	if (parts.length > 1) {
		return {
			prefix: parts[0],
			name: parts.slice(1).join('/'),
		};
	}
	return {name: branchName};
}

/**
 * Prepares worktree content for display with plain and colored versions.
 */
export function prepareWorktreeItems(
	worktrees: Worktree[],
	sessions: Session[],
): WorktreeItem[] {
	return worktrees.map(wt => {
		const session = sessions.find(s => s.worktreePath === wt.path);
		const status = session ? ` [${getStatusDisplay(session.state)}]` : '';
		const fullBranchName = wt.branch
			? wt.branch.replace('refs/heads/', '')
			: 'detached';
		const branchName = truncateString(fullBranchName, MAX_BRANCH_NAME_LENGTH);
		const isMain = wt.isMainWorktree ? ' (main)' : '';
		const baseLabel = `${branchName}${isMain}${status}`;

		let fileChanges = '';
		let aheadBehind = '';
		let parentBranch = '';
		let error = '';

		if (wt.gitStatus) {
			fileChanges = formatGitFileChanges(wt.gitStatus);
			aheadBehind = formatGitAheadBehind(wt.gitStatus);
			parentBranch = formatParentBranch(
				wt.gitStatus.parentBranch,
				fullBranchName,
			);
		} else if (wt.gitStatusError) {
			// Format error in red
			error = `\x1b[31m[git error]\x1b[0m`;
		} else {
			// Show fetching status in dim gray
			fileChanges = '\x1b[90m[fetching...]\x1b[0m';
		}

		return {
			worktree: wt,
			session,
			baseLabel,
			fileChanges,
			aheadBehind,
			parentBranch,
			error,
			lengths: {
				base: stripAnsi(baseLabel).length,
				fileChanges: stripAnsi(fileChanges).length,
				aheadBehind: stripAnsi(aheadBehind).length,
				parentBranch: stripAnsi(parentBranch).length,
				projectContext: 0, // Updated in async version
			},
		};
	});
}

/**
 * Async version that includes project context detection
 */
export async function prepareWorktreeItemsWithContext(
	worktrees: Worktree[],
	sessions: Session[],
): Promise<WorktreeItem[]> {
	// Get context-aware config
	const config = configurationManager.getConfiguration();
	const contextConfig = config.contextAware || {
		enabled: true,
		enableFrameworkDetection: true,
		enableGitIntegration: true,
		cacheIntervalMinutes: 5,
		frameworkPatterns: {},
	};

	const contextBuilder = new ContextBuilder(contextConfig);

	const items = await Promise.all(
		worktrees.map(async wt => {
			const session = sessions.find(s => s.worktreePath === wt.path);
			const status = session ? ` [${getStatusDisplay(session.state)}]` : '';
			const fullBranchName = wt.branch
				? wt.branch.replace('refs/heads/', '')
				: 'detached';
			const branchName = truncateString(fullBranchName, MAX_BRANCH_NAME_LENGTH);
			const isMain = wt.isMainWorktree ? ' (main)' : '';
			const baseLabel = `${branchName}${isMain}${status}`;

			let fileChanges = '';
			let aheadBehind = '';
			let parentBranch = '';
			let projectContext = '';
			let error = '';

			// Build project context if enabled
			if (contextConfig.enabled && contextConfig.enableFrameworkDetection) {
				try {
					const context = await contextBuilder.buildProjectContext(wt.path);
					projectContext = formatProjectContext(context);
				} catch {
					// Fallback to no context on error
					projectContext = '';
				}
			}

			if (wt.gitStatus) {
				fileChanges = formatGitFileChanges(wt.gitStatus);
				aheadBehind = formatGitAheadBehind(wt.gitStatus);
				parentBranch = formatParentBranch(
					wt.gitStatus.parentBranch,
					fullBranchName,
				);
			} else if (wt.gitStatusError) {
				// Format error in red
				error = `\x1b[31m[git error]\x1b[0m`;
			} else {
				// Show fetching status in dim gray
				fileChanges = '\x1b[90m[fetching...]\x1b[0m';
			}

			return {
				worktree: wt,
				session,
				baseLabel,
				fileChanges,
				aheadBehind,
				parentBranch,
				projectContext,
				error,
				lengths: {
					base: stripAnsi(baseLabel).length,
					fileChanges: stripAnsi(fileChanges).length,
					aheadBehind: stripAnsi(aheadBehind).length,
					parentBranch: stripAnsi(parentBranch).length,
					projectContext: stripAnsi(projectContext).length,
				},
			};
		}),
	);

	return items;
}

/**
 * Format project context for display
 */
function formatProjectContext(context: ProjectContext): string {
	const framework = context.projectType.framework;
	const language = context.projectType.language;

	if (framework === 'unknown' && language === 'unknown') {
		return '';
	}

	// Create short, colorized context display
	const frameworkShort = getFrameworkShort(framework);
	const languageShort = getLanguageShort(language);

	if (frameworkShort && languageShort) {
		return `\x1b[36m[${frameworkShort}/${languageShort}]\x1b[0m`; // Cyan
	} else if (frameworkShort) {
		return `\x1b[36m[${frameworkShort}]\x1b[0m`;
	} else if (languageShort) {
		return `\x1b[36m[${languageShort}]\x1b[0m`;
	}

	return '';
}

/**
 * Get short framework name for display
 */
function getFrameworkShort(framework: string): string {
	const shortNames: Record<string, string> = {
		react: 'react',
		next: 'next',
		vue: 'vue',
		express: 'express',
		nestjs: 'nest',
		typescript: 'ts',
		node: 'node',
	};
	return shortNames[framework] || '';
}

/**
 * Get short language name for display
 */
function getLanguageShort(language: string): string {
	const shortNames: Record<string, string> = {
		typescript: 'ts',
		javascript: 'js',
		python: 'py',
		go: 'go',
		rust: 'rust',
	};
	return shortNames[language] || '';
}

/**
 * Calculates column positions based on content widths.
 */
export function calculateColumnPositions(items: WorktreeItem[]) {
	// Calculate maximum widths from pre-calculated lengths
	let maxBranchLength = 0;
	let maxFileChangesLength = 0;
	let maxAheadBehindLength = 0;
	let maxProjectContextLength = 0;

	items.forEach(item => {
		// Skip items with errors for alignment calculation
		if (item.error) return;

		maxBranchLength = Math.max(maxBranchLength, item.lengths.base);
		maxFileChangesLength = Math.max(
			maxFileChangesLength,
			item.lengths.fileChanges,
		);
		maxAheadBehindLength = Math.max(
			maxAheadBehindLength,
			item.lengths.aheadBehind,
		);
		maxProjectContextLength = Math.max(
			maxProjectContextLength,
			item.lengths.projectContext || 0,
		);
	});

	// Simple column positioning
	const projectContextColumn = maxBranchLength + MIN_COLUMN_PADDING;
	const fileChangesColumn = projectContextColumn + maxProjectContextLength + MIN_COLUMN_PADDING;
	const aheadBehindColumn =
		fileChangesColumn + maxFileChangesLength + MIN_COLUMN_PADDING + 2;
	const parentBranchColumn =
		aheadBehindColumn + maxAheadBehindLength + MIN_COLUMN_PADDING + 2;

	return {
		projectContext: projectContextColumn,
		fileChanges: fileChangesColumn,
		aheadBehind: aheadBehindColumn,
		parentBranch: parentBranchColumn,
	};
}

// Pad string to column position
function padTo(str: string, visibleLength: number, column: number): string {
	return str + ' '.repeat(Math.max(0, column - visibleLength));
}

/**
 * Assembles the final worktree label with proper column alignment
 */
export function assembleWorktreeLabel(
	item: WorktreeItem,
	columns: ReturnType<typeof calculateColumnPositions>,
): string {
	// If there's an error, just show the base label with error appended
	if (item.error) {
		return `${item.baseLabel} ${item.error}`;
	}

	let label = item.baseLabel;
	let currentLength = item.lengths.base;

	// Add project context if available
	if (item.projectContext && columns.projectContext) {
		label = padTo(label, currentLength, columns.projectContext) + item.projectContext;
		currentLength = columns.projectContext + item.lengths.projectContext;
	}

	if (item.fileChanges) {
		label = padTo(label, currentLength, columns.fileChanges) + item.fileChanges;
		currentLength = columns.fileChanges + item.lengths.fileChanges;
	}
	if (item.aheadBehind) {
		label = padTo(label, currentLength, columns.aheadBehind) + item.aheadBehind;
		currentLength = columns.aheadBehind + item.lengths.aheadBehind;
	}
	if (item.parentBranch) {
		label =
			padTo(label, currentLength, columns.parentBranch) + item.parentBranch;
	}

	return label;
}
