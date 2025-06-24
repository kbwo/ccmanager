import {promisify} from 'util';
import {exec, execFile} from 'child_process';
import {getWorktreeParentBranch} from './worktreeConfig.js';
import {createConcurrencyLimited} from './concurrencyLimit.js';

const execp = promisify(exec);
const execFilePromisified = promisify(execFile);

export interface GitStatus {
	filesAdded: number;
	filesDeleted: number;
	aheadCount: number;
	behindCount: number;
	parentBranch: string;
}

export interface GitOperationResult<T> {
	success: boolean;
	data?: T;
	error?: string;
	skipped?: boolean;
}

export async function getGitStatus(
	worktreePath: string,
	defaultBranch: string,
	signal: AbortSignal,
): Promise<GitOperationResult<GitStatus>> {
	try {
		// Get unstaged changes
		const [diffResult, stagedResult, branchResult, parentBranch] =
			await Promise.all([
				execp('git diff --shortstat', {cwd: worktreePath, signal}).catch(
					() => EMPTY_EXEC_RESULT,
				),
				execp('git diff --staged --shortstat', {
					cwd: worktreePath,
					signal,
				}).catch(() => EMPTY_EXEC_RESULT),
				execp('git branch --show-current', {cwd: worktreePath, signal}).catch(
					() => EMPTY_EXEC_RESULT,
				),
				getWorktreeParentBranch(worktreePath, signal).then(
					parent => parent || defaultBranch,
				),
			]);

		// Parse file changes
		let filesAdded = 0;
		let filesDeleted = 0;

		if (diffResult.stdout) {
			const stats = parseGitStats(diffResult.stdout);
			filesAdded += stats.insertions;
			filesDeleted += stats.deletions;
		}
		if (stagedResult.stdout) {
			const stats = parseGitStats(stagedResult.stdout);
			filesAdded += stats.insertions;
			filesDeleted += stats.deletions;
		}

		// Get ahead/behind counts
		let aheadCount = 0;
		let behindCount = 0;

		const currentBranch = branchResult.stdout.trim();
		if (currentBranch && currentBranch !== parentBranch) {
			try {
				const aheadBehindResult = await execFilePromisified(
					'git',
					['rev-list', '--left-right', '--count', `${parentBranch}...HEAD`],
					{cwd: worktreePath, signal},
				);

				const [behind, ahead] = aheadBehindResult.stdout
					.trim()
					.split('\t')
					.map(n => parseInt(n, 10));
				aheadCount = ahead || 0;
				behindCount = behind || 0;
			} catch {
				// Branch comparison might fail
			}
		}

		return {
			success: true,
			data: {
				filesAdded,
				filesDeleted,
				aheadCount,
				behindCount,
				parentBranch,
			},
		};
	} catch (error) {
		let errorMessage = '';
		if (error instanceof Error) {
			errorMessage = error.message;
		} else {
			errorMessage = String(error);
		}
		return {
			success: false,
			error: errorMessage,
		};
	}
}

// Split git status formatting into file changes and ahead/behind
export function formatGitFileChanges(status: GitStatus): string {
	const parts: string[] = [];

	const colors = {
		green: '\x1b[32m',
		red: '\x1b[31m',
		reset: '\x1b[0m',
	};

	// File changes
	if (status.filesAdded > 0) {
		parts.push(`${colors.green}+${status.filesAdded}${colors.reset}`);
	}
	if (status.filesDeleted > 0) {
		parts.push(`${colors.red}-${status.filesDeleted}${colors.reset}`);
	}

	return parts.join(' ');
}

export function formatGitAheadBehind(status: GitStatus): string {
	const parts: string[] = [];

	const colors = {
		cyan: '\x1b[36m',
		magenta: '\x1b[35m',
		reset: '\x1b[0m',
	};

	// Ahead/behind - compact format with arrows
	if (status.aheadCount > 0) {
		parts.push(`${colors.cyan}↑${status.aheadCount}${colors.reset}`);
	}
	if (status.behindCount > 0) {
		parts.push(`${colors.magenta}↓${status.behindCount}${colors.reset}`);
	}

	return parts.join(' ');
}

// Keep the original function for backward compatibility
export function formatGitStatus(status: GitStatus): string {
	const fileChanges = formatGitFileChanges(status);
	const aheadBehind = formatGitAheadBehind(status);

	const parts = [];
	if (fileChanges) parts.push(fileChanges);
	if (aheadBehind) parts.push(aheadBehind);

	return parts.join(' ');
}

export function formatParentBranch(
	parentBranch: string,
	currentBranch: string,
): string {
	// Only show parent branch if different from current branch
	if (parentBranch === currentBranch) {
		return '';
	}

	const colors = {
		dim: '\x1b[90m',
		reset: '\x1b[0m',
	};

	return `${colors.dim}(${parentBranch})${colors.reset}`;
}

const EMPTY_EXEC_RESULT = {stdout: '', stderr: ''};

interface GitStats {
	insertions: number;
	deletions: number;
}

function parseGitStats(statLine: string): GitStats {
	let insertions = 0;
	let deletions = 0;

	// Parse git diff --shortstat output
	// Example: " 3 files changed, 42 insertions(+), 10 deletions(-)"
	const insertMatch = statLine.match(/(\d+) insertion/);
	const deleteMatch = statLine.match(/(\d+) deletion/);

	if (insertMatch && insertMatch[1]) {
		insertions = parseInt(insertMatch[1], 10);
	}
	if (deleteMatch && deleteMatch[1]) {
		deletions = parseInt(deleteMatch[1], 10);
	}

	return {insertions, deletions};
}

export const getGitStatusLimited = createConcurrencyLimited(getGitStatus, 10);
