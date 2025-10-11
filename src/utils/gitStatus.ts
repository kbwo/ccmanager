import {promisify} from 'util';
import {execFile, type ExecException} from 'child_process';
import {Cause, Effect, Either, Exit, Option} from 'effect';
import {pipe} from 'effect/Function';
import {GitError} from '../types/errors.js';
import {getWorktreeParentBranch} from './worktreeConfig.js';
import {createEffectConcurrencyLimited} from './concurrencyLimit.js';

const execFileAsync = promisify(execFile);

export interface GitStatus {
	filesAdded: number;
	filesDeleted: number;
	aheadCount: number;
	behindCount: number;
	parentBranch: string | null;
}

interface ExecResult {
	stdout: string;
	stderr: string;
}

interface GitStats {
	insertions: number;
	deletions: number;
}

const DEFAULT_GIT_STATS: GitStats = {insertions: 0, deletions: 0};

export const getGitStatus = (
	worktreePath: string,
): Effect.Effect<GitStatus, GitError> =>
	Effect.gen(function* () {
		const diffResult = yield* runGit(['diff', '--shortstat'], worktreePath);
		const stagedResult = yield* runGit(
			['diff', '--staged', '--shortstat'],
			worktreePath,
		);
		const branchResult = yield* runGit(
			['branch', '--show-current'],
			worktreePath,
		);
		const parentBranch = yield* fetchParentBranch(worktreePath);

		const diffStats = decodeGitStats(diffResult.stdout);
		const stagedStats = decodeGitStats(stagedResult.stdout);

		const filesAdded = diffStats.insertions + stagedStats.insertions;
		const filesDeleted = diffStats.deletions + stagedStats.deletions;

		const {aheadCount, behindCount} = yield* computeAheadBehind({
			worktreePath,
			currentBranch: branchResult.stdout.trim(),
			parentBranch,
		});

		return {
			filesAdded,
			filesDeleted,
			aheadCount,
			behindCount,
			parentBranch,
		};
	});

export const getGitStatusLimited = createEffectConcurrencyLimited(
	(worktreePath: string) => getGitStatus(worktreePath),
	10,
);

export function formatGitFileChanges(status: GitStatus): string {
	const parts: string[] = [];

	const colors = {
		green: '\x1b[32m',
		red: '\x1b[31m',
		reset: '\x1b[0m',
	};

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

	if (status.aheadCount > 0) {
		parts.push(`${colors.cyan}↑${status.aheadCount}${colors.reset}`);
	}
	if (status.behindCount > 0) {
		parts.push(`${colors.magenta}↓${status.behindCount}${colors.reset}`);
	}

	return parts.join(' ');
}

export function formatGitStatus(status: GitStatus): string {
	const fileChanges = formatGitFileChanges(status);
	const aheadBehind = formatGitAheadBehind(status);

	const parts = [];
	if (fileChanges) parts.push(fileChanges);
	if (aheadBehind) parts.push(aheadBehind);

	return parts.join(' ');
}

export function formatParentBranch(
	parentBranch: string | null,
	currentBranch: string,
): string {
	if (!parentBranch || parentBranch === currentBranch) {
		return '';
	}

	const colors = {
		dim: '\x1b[90m',
		reset: '\x1b[0m',
	};

	return `${colors.dim}(${parentBranch})${colors.reset}`;
}

function runGit(
	args: string[],
	worktreePath: string,
): Effect.Effect<ExecResult, GitError> {
	const command = `git ${args.join(' ')}`.trim();
	return Effect.catchAll(
		Effect.tryPromise({
			try: signal =>
				execFileAsync('git', args, {
					cwd: worktreePath,
					encoding: 'utf8',
					maxBuffer: 5 * 1024 * 1024,
					signal,
				}),
			catch: error => error,
		}),
		error => handleExecFailure(command, error),
	);
}

function fetchParentBranch(worktreePath: string): Effect.Effect<string | null> {
	return Effect.catchAll(getWorktreeParentBranch(worktreePath), () =>
		Effect.succeed<string | null>(null),
	);
}

function computeAheadBehind({
	worktreePath,
	currentBranch,
	parentBranch,
}: {
	worktreePath: string;
	currentBranch: string;
	parentBranch: string | null;
}): Effect.Effect<{aheadCount: number; behindCount: number}, GitError> {
	if (!currentBranch || !parentBranch || currentBranch === parentBranch) {
		return Effect.succeed({aheadCount: 0, behindCount: 0});
	}

	return Effect.map(
		Effect.catchAll(
			runGit(
				['rev-list', '--left-right', '--count', `${parentBranch}...HEAD`],
				worktreePath,
			),
			() => Effect.succeed<ExecResult>({stdout: '', stderr: ''}),
		),
		result => decodeAheadBehind(result.stdout),
	);
}

function parseGitStats(statLine: string): Either.Either<GitStats, string> {
	const insertMatch = statLine.match(/(\d+) insertion/);
	const deleteMatch = statLine.match(/(\d+) deletion/);

	const insertions = insertMatch?.[1]
		? Number.parseInt(insertMatch[1]!, 10)
		: 0;
	const deletions = deleteMatch?.[1] ? Number.parseInt(deleteMatch[1]!, 10) : 0;

	if (Number.isNaN(insertions) || Number.isNaN(deletions)) {
		return Either.left(
			`Unable to parse git diff stats from "${statLine.trim()}"`,
		);
	}

	return Either.right({insertions, deletions});
}

function decodeGitStats(statLine: string): GitStats {
	return pipe(
		parseGitStats(statLine),
		Either.getOrElse(() => DEFAULT_GIT_STATS),
	);
}

function parseAheadBehind(
	stats: string,
): Either.Either<{aheadCount: number; behindCount: number}, string> {
	const trimmed = stats.trim();
	if (!trimmed) {
		return Either.right({aheadCount: 0, behindCount: 0});
	}

	const [behindRaw, aheadRaw] = trimmed.split('\t');
	const behind = behindRaw ? Number.parseInt(behindRaw, 10) : 0;
	const ahead = aheadRaw ? Number.parseInt(aheadRaw, 10) : 0;

	if (Number.isNaN(behind) || Number.isNaN(ahead)) {
		return Either.left(`Unable to parse ahead/behind stats from "${trimmed}"`);
	}

	return Either.right({
		aheadCount: Math.max(ahead, 0),
		behindCount: Math.max(behind, 0),
	});
}

function decodeAheadBehind(stats: string): {
	aheadCount: number;
	behindCount: number;
} {
	return pipe(
		parseAheadBehind(stats),
		Either.getOrElse(() => ({aheadCount: 0, behindCount: 0})),
	);
}

function handleExecFailure(
	command: string,
	error: unknown,
): Effect.Effect<ExecResult, GitError> {
	if (isAbortError(error)) {
		return Effect.interrupt as Effect.Effect<ExecResult, GitError>;
	}

	return Effect.fail(toGitError(command, error));
}

function isExecError(error: unknown): error is ExecException & {
	stdout?: string;
	stderr?: string;
	code?: string | number | null;
	killed?: boolean;
	signal?: NodeJS.Signals;
} {
	return (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		'code' in error
	);
}

function isAbortError(error: unknown): boolean {
	if (error instanceof Error && error.name === 'AbortError') {
		return true;
	}

	if (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as {code?: unknown}).code === 'ABORT_ERR'
	) {
		return true;
	}

	if (isExecError(error)) {
		return Boolean(error.killed && error.signal);
	}

	return false;
}

function toGitError(command: string, error: unknown): GitError {
	if (error instanceof GitError) {
		return error;
	}

	if (isExecError(error)) {
		const exitCodeRaw = error.code;
		const exitCode =
			typeof exitCodeRaw === 'number'
				? exitCodeRaw
				: Number.parseInt(String(exitCodeRaw ?? '-1'), 10) || -1;
		const stderr =
			typeof error.stderr === 'string' ? error.stderr : (error.message ?? '');

		return new GitError({
			command,
			exitCode,
			stderr,
			stdout:
				typeof error.stdout === 'string' && error.stdout.length > 0
					? error.stdout
					: undefined,
		});
	}

	if (error instanceof Error) {
		return new GitError({
			command,
			exitCode: -1,
			stderr: error.message,
		});
	}

	return new GitError({
		command,
		exitCode: -1,
		stderr: String(error),
	});
}

function gitErrorToMessage(error: GitError): string {
	const exitCode = Number.isFinite(error.exitCode) ? error.exitCode : -1;
	const details = [error.stderr, error.stdout]
		.filter(part => typeof part === 'string' && part.trim().length > 0)
		.map(part => part!.trim());
	const detail = details[0] ?? '';
	return detail
		? `git command "${error.command}" failed (exit code ${exitCode}): ${detail}`
		: `git command "${error.command}" failed (exit code ${exitCode})`;
}
