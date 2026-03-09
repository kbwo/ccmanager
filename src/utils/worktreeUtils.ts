import path from 'path';
import {execSync} from 'child_process';
import stripAnsi from 'strip-ansi';
import {Worktree, Session} from '../types/index.js';
import {getStatusDisplay} from '../constants/statusIcons.js';
import {
	formatGitFileChanges,
	formatGitAheadBehind,
	formatParentBranch,
} from './gitStatus.js';

// Constants
const MAX_BRANCH_NAME_LENGTH = 70; // Maximum characters for branch name display
const MIN_COLUMN_PADDING = 2; // Minimum spaces between columns

/**
 * Worktree item with formatted content for display.
 */
export interface WorktreeItem {
	worktree: Worktree;
	session?: Session;
	baseLabel: string;
	fileChanges: string;
	aheadBehind: string;
	parentBranch: string;
	lastCommitDate: string;
	error?: string;
	// Visible lengths (without ANSI codes) for alignment calculation
	lengths: {
		base: number;
		fileChanges: number;
		aheadBehind: number;
		parentBranch: number;
		lastCommitDate: number;
	};
}

const RELATIVE_DATE_WIDTH = 8; // max width: "12mo ago"

/**
 * Format a date as a fixed-width relative time string (e.g., "  2h ago", "  3d ago").
 * Padded to RELATIVE_DATE_WIDTH characters to prevent flickering on scroll.
 */
export function formatRelativeDate(date: Date): string {
	const now = Date.now();
	const diffMs = now - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);
	const diffWeek = Math.floor(diffDay / 7);
	const diffMonth = Math.floor(diffDay / 30);
	const diffYear = Math.floor(diffDay / 365);

	let result: string;
	if (diffYear > 0) result = `${diffYear}y ago`;
	else if (diffMonth > 0) result = `${diffMonth}mo ago`;
	else if (diffWeek > 0) result = `${diffWeek}w ago`;
	else if (diffDay > 0) result = `${diffDay}d ago`;
	else if (diffHour > 0) result = `${diffHour}h ago`;
	else if (diffMin > 0) result = `${diffMin}m ago`;
	else result = 'just now';

	return result.padStart(RELATIVE_DATE_WIDTH);
}

// Utility function to truncate strings with ellipsis
export function truncateString(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return str.substring(0, maxLength - 3) + '...';
}

function getGitRepositoryName(projectPath: string): string {
	try {
		const gitCommonDir = execSync('git rev-parse --git-common-dir', {
			cwd: projectPath,
			encoding: 'utf8',
		}).trim();

		const absoluteGitCommonDir = path.isAbsolute(gitCommonDir)
			? gitCommonDir
			: path.resolve(projectPath, gitCommonDir);

		// Handle submodule paths: if path contains .git/modules, use --show-toplevel
		// to get the submodule's actual working directory
		if (absoluteGitCommonDir.includes('.git/modules')) {
			const toplevel = execSync('git rev-parse --show-toplevel', {
				cwd: projectPath,
				encoding: 'utf8',
			}).trim();
			return path.basename(toplevel);
		}

		const mainWorkingDir = path.dirname(absoluteGitCommonDir);

		return path.basename(mainWorkingDir);
	} catch {
		return path.basename(projectPath);
	}
}

export function generateWorktreeDirectory(
	projectPath: string,
	branchName: string,
	pattern?: string,
): string {
	// Default pattern if not specified
	const defaultPattern = '../{branch}';
	const activePattern = pattern || defaultPattern;

	let sanitizedBranch: string | undefined;
	let projectName: string | undefined;

	const directory = activePattern.replace(/{(\w+)}/g, (placeholder, name) => {
		switch (name) {
			case 'branch':
			case 'branch-name':
				// Sanitize branch name for filesystem
				sanitizedBranch ??= branchName
					.replace(/\//g, '-') // Replace forward slashes with dashes
					.replace(/[^a-zA-Z0-9-_.]+/g, '') // Remove special characters except dash, dot, underscore
					.replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
					.toLowerCase(); // Convert to lowercase for consistency

				return sanitizedBranch;
			case 'project':
				projectName ??= getGitRepositoryName(projectPath);
				return projectName;
			default:
				return placeholder;
		}
	});

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
		const stateData = session?.stateMutex.getSnapshot();
		const status = stateData
			? ` [${getStatusDisplay(stateData.state, stateData.backgroundTaskCount, stateData.teamMemberCount)}]`
			: '';
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

		// Format last commit date as dim relative time
		const lastCommitDate = wt.lastCommitDate
			? `\x1b[90m${formatRelativeDate(wt.lastCommitDate)}\x1b[0m`
			: '';

		return {
			worktree: wt,
			session,
			baseLabel,
			fileChanges,
			aheadBehind,
			parentBranch,
			lastCommitDate,
			error,
			lengths: {
				base: stripAnsi(baseLabel).length,
				fileChanges: stripAnsi(fileChanges).length,
				aheadBehind: stripAnsi(aheadBehind).length,
				parentBranch: stripAnsi(parentBranch).length,
				lastCommitDate: stripAnsi(lastCommitDate).length,
			},
		};
	});
}

/**
 * Calculates column positions based on content widths.
 */
export function calculateColumnPositions(items: WorktreeItem[]) {
	// Calculate maximum widths from pre-calculated lengths
	let maxBranchLength = 0;
	let maxFileChangesLength = 0;
	let maxAheadBehindLength = 0;
	let maxParentBranchLength = 0;

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
		maxParentBranchLength = Math.max(
			maxParentBranchLength,
			item.lengths.parentBranch,
		);
	});

	// Simple column positioning
	const fileChangesColumn = maxBranchLength + MIN_COLUMN_PADDING;
	const aheadBehindColumn =
		fileChangesColumn + maxFileChangesLength + MIN_COLUMN_PADDING + 2;
	const parentBranchColumn =
		aheadBehindColumn + maxAheadBehindLength + MIN_COLUMN_PADDING + 2;
	const lastCommitDateColumn =
		parentBranchColumn + maxParentBranchLength + MIN_COLUMN_PADDING + 2;

	return {
		fileChanges: fileChangesColumn,
		aheadBehind: aheadBehindColumn,
		parentBranch: parentBranchColumn,
		lastCommitDate: lastCommitDateColumn,
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
		currentLength = columns.parentBranch + item.lengths.parentBranch;
	}
	if (item.lastCommitDate) {
		label =
			padTo(label, currentLength, columns.lastCommitDate) + item.lastCommitDate;
	}

	return label;
}
