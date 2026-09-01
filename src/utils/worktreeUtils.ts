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
const MAX_WORKTREE_DIR_NAME_LENGTH = 30; // Maximum characters for the worktree directory name suffix
const MIN_COLUMN_PADDING = 2; // Minimum spaces between columns

/**
 * One menu row: worktree metadata plus optional session (for multi-session worktrees).
 */
export interface SessionItem {
	worktree: Worktree;
	session?: Session;
	baseLabel: string;
	// Session state tag such as "[○ Idle]" (empty when the row has no session).
	// Kept out of baseLabel so it can be rendered as its own aligned column
	// directly left of the last-commit date; see calculateColumnPositions.
	status: string;
	// Name portion shown in the menu (branch + " (main)" + session name),
	// without status icons or git status columns. Used for search matching.
	searchableName: string;
	fileChanges: string;
	aheadBehind: string;
	parentBranch: string;
	lastCommitDate: string;
	error?: string;
	// Visible lengths (without ANSI codes) for alignment calculation
	lengths: {
		base: number;
		status: number;
		fileChanges: number;
		aheadBehind: number;
		parentBranch: number;
		lastCommitDate: number;
	};
}

/**
 * Format a date as a relative time string (e.g., "2h ago", "3d ago").
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

	if (diffYear > 0) return `${diffYear}y ago`;
	if (diffMonth > 0) return `${diffMonth}mo ago`;
	if (diffWeek > 0) return `${diffWeek}w ago`;
	if (diffDay > 0) return `${diffDay}d ago`;
	if (diffHour > 0) return `${diffHour}h ago`;
	if (diffMin > 0) return `${diffMin}m ago`;
	return 'just now';
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

/**
 * Sanitize a branch name into the form used for a worktree directory name:
 * slashes become dashes, characters outside [a-zA-Z0-9-_.] are stripped,
 * leading/trailing dashes are removed, and the result is lowercased.
 *
 * This is the single source of truth for that mapping. It is reused both to
 * generate worktree directories (see {@link generateWorktreeDirectory}) and to
 * decide whether an existing directory name already conveys the branch name
 * (see {@link formatWorktreeDirectorySuffix}), so a directory generated from a
 * branch is reliably recognized as a match.
 */
export function sanitizeNameForDirectory(value: string): string {
	return value
		.replace(/\//g, '-') // Replace forward slashes with dashes
		.replace(/[^a-zA-Z0-9-_.]+/g, '') // Remove special characters except dash, dot, underscore
		.replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
		.toLowerCase(); // Convert to lowercase for consistency
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
				sanitizedBranch ??= sanitizeNameForDirectory(branchName);
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

/**
 * Returns the worktree directory basename to show alongside the branch name,
 * or an empty string when it would be redundant (main worktree, detached,
 * or the directory name matches the branch).
 *
 * The visible suffix is truncated; the raw basename is also returned so
 * callers that want to make it searchable can include it untruncated.
 */
export function formatWorktreeDirectorySuffix(
	wt: Worktree,
	fullBranchName: string,
): {displaySuffix: string; rawName: string} {
	if (wt.isMainWorktree) return {displaySuffix: '', rawName: ''};
	if (!wt.branch) return {displaySuffix: '', rawName: ''};
	if (!wt.path) return {displaySuffix: '', rawName: ''};

	const dirName = path.basename(wt.path);
	if (!dirName) return {displaySuffix: '', rawName: ''};

	const normalizedDir = sanitizeNameForDirectory(dirName);
	if (!normalizedDir) return {displaySuffix: '', rawName: ''};

	const normalizedBranch = sanitizeNameForDirectory(fullBranchName);
	if (normalizedDir === normalizedBranch) {
		return {displaySuffix: '', rawName: ''};
	}

	// Also suppress when the directory matches just the tail segment of the
	// branch (e.g. branch "feature/foo" vs directory "foo").
	const tail = extractBranchParts(fullBranchName).name;
	if (tail && sanitizeNameForDirectory(tail) === normalizedDir) {
		return {displaySuffix: '', rawName: ''};
	}

	const visible = truncateString(dirName, MAX_WORKTREE_DIR_NAME_LENGTH);
	return {displaySuffix: ` @ ${visible}`, rawName: dirName};
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
 * One pass over sessions: group by worktree path and track latest lastAccessedAt per path.
 */
function indexSessionsByWorktree(sessions: Session[]): {
	byWorktreePath: Map<string, Session[]>;
	maxAccessAt: Map<string, number>;
} {
	const byWorktreePath = new Map<string, Session[]>();
	const maxAccessAt = new Map<string, number>();

	for (const s of sessions) {
		const path = s.worktreePath;
		let list = byWorktreePath.get(path);
		if (!list) {
			list = [];
			byWorktreePath.set(path, list);
		}
		list.push(s);

		const prevMax = maxAccessAt.get(path) ?? 0;
		if (s.lastAccessedAt > prevMax) {
			maxAccessAt.set(path, s.lastAccessedAt);
		}
	}

	return {byWorktreePath, maxAccessAt};
}

export function displaySuffix(
	session: Session,
	multipleForWorktree: boolean,
): string {
	if (multipleForWorktree) {
		return session.sessionName
			? `: ${session.sessionName}`
			: ` #${session.sessionNumber}`;
	}
	return session.sessionName ? `: ${session.sessionName}` : '';
}

type GitStatusColumns = Pick<
	SessionItem,
	'fileChanges' | 'aheadBehind' | 'parentBranch'
> & {
	error?: string;
};

function gitStatusColumns(
	wt: Worktree,
	fullBranchName: string,
): GitStatusColumns {
	if (wt.gitStatus) {
		return {
			fileChanges: formatGitFileChanges(wt.gitStatus),
			aheadBehind: formatGitAheadBehind(wt.gitStatus),
			parentBranch: formatParentBranch(
				wt.gitStatus.parentBranch,
				fullBranchName,
			),
		};
	}
	if (wt.gitStatusError) {
		return {
			fileChanges: '',
			aheadBehind: '',
			parentBranch: '',
			error: `\x1b[31m[git error]\x1b[0m`,
		};
	}
	return {
		fileChanges: '\x1b[90m[fetching...]\x1b[0m',
		aheadBehind: '',
		parentBranch: '',
	};
}

/**
 * Build a single SessionItem row for display.
 */
function buildSessionItem(
	wt: Worktree,
	session: Session | undefined,
	sessionSuffix: string,
): SessionItem {
	const stateData = session?.stateMutex.getSnapshot();
	const status = stateData
		? `[${getStatusDisplay(stateData.state, stateData.backgroundTaskCount, stateData.teamMemberCount)}]`
		: '';
	const fullBranchName = wt.branch
		? wt.branch.replace('refs/heads/', '')
		: 'detached';
	const branchName = truncateString(fullBranchName, MAX_BRANCH_NAME_LENGTH);
	const isMain = wt.isMainWorktree ? ' (main)' : '';
	const {displaySuffix: dirSuffix, rawName: rawDirName} =
		formatWorktreeDirectorySuffix(wt, fullBranchName);
	const baseLabel = `${branchName}${dirSuffix}${isMain}${sessionSuffix}`;
	// Use the full (untruncated) branch name so search still matches the tail
	// of long branch names; status icons are excluded so they don't match.
	const rawDirForSearch = rawDirName ? ` @ ${rawDirName}` : '';
	const searchableName = `${fullBranchName}${rawDirForSearch}${isMain}${sessionSuffix}`;
	const {fileChanges, aheadBehind, parentBranch, error} = gitStatusColumns(
		wt,
		fullBranchName,
	);
	const lastCommitDate = wt.lastCommitDate
		? `\x1b[90m${formatRelativeDate(wt.lastCommitDate)}\x1b[0m`
		: '';

	return {
		worktree: wt,
		session,
		baseLabel,
		status,
		searchableName,
		fileChanges,
		aheadBehind,
		parentBranch,
		lastCommitDate,
		error,
		lengths: {
			base: stripAnsi(baseLabel).length,
			status: stripAnsi(status).length,
			fileChanges: stripAnsi(fileChanges).length,
			aheadBehind: stripAnsi(aheadBehind).length,
			parentBranch: stripAnsi(parentBranch).length,
			lastCommitDate: stripAnsi(lastCommitDate).length,
		},
	};
}

/**
 * Prepares session items for display.
 * Supports multiple sessions per worktree.
 * When sortByLastSession is true, worktrees are sorted by the most recent
 * session lastAccessedAt timestamp (descending), and sessions within each
 * worktree are also sorted by lastAccessedAt.
 */
export function prepareSessionItems(
	worktrees: Worktree[],
	sessions: Session[],
	options?: {sortByLastSession?: boolean},
): SessionItem[] {
	const {byWorktreePath, maxAccessAt} = indexSessionsByWorktree(sessions);
	const items: SessionItem[] = [];

	const orderedWorktrees =
		options?.sortByLastSession && sessions.length > 0
			? [...worktrees].sort((a, b) => {
					const timeA = maxAccessAt.get(a.path);
					const timeB = maxAccessAt.get(b.path);
					if (timeA === undefined && timeB === undefined) return 0;
					return (timeB ?? 0) - (timeA ?? 0);
				})
			: worktrees;

	for (const wt of orderedWorktrees) {
		const wtSessions = byWorktreePath.get(wt.path) ?? [];

		if (wtSessions.length === 0) {
			items.push(buildSessionItem(wt, undefined, ''));
			continue;
		}

		const ordered =
			wtSessions.length > 1
				? [...wtSessions].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
				: wtSessions;
		const multiple = ordered.length > 1;

		for (const session of ordered) {
			items.push(
				buildSessionItem(wt, session, displaySuffix(session, multiple)),
			);
		}
	}

	return items;
}

/**
 * Column start positions for one rendered list, plus how the session state tag
 * (e.g. "[○ Idle]") is placed.
 */
export interface ColumnPositions {
	fileChanges: number;
	aheadBehind: number;
	parentBranch: number;
	status: number;
	lastCommitDate: number;
	/**
	 * true: the state tag gets its own column at `status`, so every row's tag
	 * starts at the same horizontal position, directly left of the commit date.
	 * false: the state tag is appended right after the branch name (the layout
	 * used before this column existed), because the aligned layout would not fit
	 * the terminal width given to calculateColumnPositions.
	 */
	alignStatus: boolean;
}

/**
 * Visible width of the name portion when the state tag is appended to it
 * instead of getting its own column.
 */
function inlineBaseLength(item: SessionItem): number {
	return (
		item.lengths.base + (item.lengths.status ? item.lengths.status + 1 : 0)
	);
}

/**
 * Calculates column positions based on content widths.
 *
 * `availableWidth` is the number of terminal columns the label may occupy
 * (i.e. terminal width minus whatever prefix the caller prepends). When the
 * aligned-status layout would not fit in it, the layout falls back to appending
 * the state tag to the name, which is narrower. Omit it to always align.
 */
export function calculateColumnPositions(
	items: SessionItem[],
	availableWidth?: number,
): ColumnPositions {
	// Calculate maximum widths from pre-calculated lengths
	let maxBranchLength = 0;
	let maxInlineBranchLength = 0;
	let maxStatusLength = 0;
	let maxFileChangesLength = 0;
	let maxAheadBehindLength = 0;
	let maxParentBranchLength = 0;
	let maxLastCommitDateLength = 0;

	items.forEach(item => {
		// Skip items with errors for alignment calculation
		if (item.error) return;

		maxBranchLength = Math.max(maxBranchLength, item.lengths.base);
		maxInlineBranchLength = Math.max(
			maxInlineBranchLength,
			inlineBaseLength(item),
		);
		maxStatusLength = Math.max(maxStatusLength, item.lengths.status);
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
		maxLastCommitDateLength = Math.max(
			maxLastCommitDateLength,
			item.lengths.lastCommitDate,
		);
	});

	// Simple column positioning. `branchWidth` is how much room the name portion
	// gets, `statusWidth` is 0 when the state tag rides along with the name.
	const layout = (branchWidth: number, statusWidth: number) => {
		const fileChanges = branchWidth + MIN_COLUMN_PADDING;
		const aheadBehind =
			fileChanges + maxFileChangesLength + MIN_COLUMN_PADDING + 2;
		const parentBranch =
			aheadBehind + maxAheadBehindLength + MIN_COLUMN_PADDING + 2;
		const status =
			parentBranch + maxParentBranchLength + MIN_COLUMN_PADDING + 2;
		const lastCommitDate =
			status + (statusWidth ? statusWidth + MIN_COLUMN_PADDING : 0);
		return {fileChanges, aheadBehind, parentBranch, status, lastCommitDate};
	};

	const aligned = layout(maxBranchLength, maxStatusLength);
	const fits =
		availableWidth === undefined ||
		aligned.lastCommitDate + maxLastCommitDateLength <= availableWidth;

	if (fits) {
		return {...aligned, alignStatus: true};
	}

	return {...layout(maxInlineBranchLength, 0), alignStatus: false};
}

// Pad string to column position
function padTo(str: string, visibleLength: number, column: number): string {
	return str + ' '.repeat(Math.max(0, column - visibleLength));
}

/**
 * Assembles the final worktree label with proper column alignment
 */
export function assembleSessionLabel(
	item: SessionItem,
	columns: ColumnPositions,
): string {
	const inlineStatus = item.status
		? `${item.baseLabel} ${item.status}`
		: item.baseLabel;

	// If there's an error, just show the base label with error appended.
	// Error rows carry no columns at all, so the state tag stays next to the name.
	if (item.error) {
		return `${inlineStatus} ${item.error}`;
	}

	let label = columns.alignStatus ? item.baseLabel : inlineStatus;
	let currentLength = columns.alignStatus
		? item.lengths.base
		: inlineBaseLength(item);

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
	if (columns.alignStatus && item.status) {
		label = padTo(label, currentLength, columns.status) + item.status;
		currentLength = columns.status + item.lengths.status;
	}
	if (item.lastCommitDate) {
		label =
			padTo(label, currentLength, columns.lastCommitDate) + item.lastCommitDate;
	}

	return label;
}

/**
 * Whether a worktree may be deleted by CCManager.
 *
 * Two worktrees are off limits:
 * - the main worktree, because git refuses to remove it and the repository
 *   would be left without a checkout;
 * - the worktree that contains the current working directory, because removing
 *   the directory CCManager is running in breaks the running process.
 *
 * Single source of truth for the rule, shared by the multi-select delete screen
 * and the per-row delete action.
 */
export function isDeletableWorktree(
	worktree: Pick<Worktree, 'path' | 'isMainWorktree'>,
	cwd: string = process.cwd(),
): boolean {
	if (worktree.isMainWorktree) return false;

	const resolvedCwd = path.resolve(cwd);
	const resolvedPath = path.resolve(worktree.path);
	if (
		resolvedCwd === resolvedPath ||
		resolvedCwd.startsWith(resolvedPath + path.sep)
	) {
		return false;
	}

	return true;
}
