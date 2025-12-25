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
interface WorktreeItem {
	worktree: Worktree;
	session?: Session;
	baseLabel: string;
	fileChanges: string;
	aheadBehind: string;
	parentBranch: string;
	error?: string;
	// Visible lengths (without ANSI codes) for alignment calculation
	lengths: {
		base: number;
		fileChanges: number;
		aheadBehind: number;
		parentBranch: number;
	};
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
		const status = session
			? ` [${getStatusDisplay(session.stateMutex.getSnapshot().state)}]`
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
	});

	// Simple column positioning
	const fileChangesColumn = maxBranchLength + MIN_COLUMN_PADDING;
	const aheadBehindColumn =
		fileChangesColumn + maxFileChangesLength + MIN_COLUMN_PADDING + 2;
	const parentBranchColumn =
		aheadBehindColumn + maxAheadBehindLength + MIN_COLUMN_PADDING + 2;

	return {
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
