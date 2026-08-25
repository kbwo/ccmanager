import {execSync} from 'child_process';
import {existsSync, statSync, mkdirSync, cpSync} from 'fs';
import path from 'path';
import {logger} from './logger.js';

/**
 * Filename for the convention shared across worktree-aware tools (Claude Code,
 * Conductor, OpenAI Codex, git-worktreeinclude, worktrunk): a gitignore-syntax
 * file at the repository root that lists gitignored files to carry into every
 * new worktree.
 */
export const WORKTREE_INCLUDE_FILENAME = '.worktreeinclude';

/**
 * Resolves which files a `.worktreeinclude` file selects, relative to `gitRoot`.
 *
 * A file is selected only when both hold:
 * - it matches a pattern in `.worktreeinclude` (gitignore syntax: comments,
 *   negation with `!`, anchoring with `/`, `**` globs)
 * - Git already ignores it (nested `.gitignore` files, `.git/info/exclude`,
 *   and `core.excludesfile` all apply)
 *
 * This mirrors the safety rule every tool that supports `.worktreeinclude`
 * documents: listing a pattern never makes a tracked file eligible, and it
 * never makes an otherwise-untracked-but-not-ignored file eligible either.
 *
 * @param gitRoot - Absolute path to the main checkout (repository root)
 * @returns Repository-relative paths (forward-slash separated, as Git reports them)
 */
export function resolveWorktreeIncludeFiles(gitRoot: string): string[] {
	const includeFilePath = path.join(gitRoot, WORKTREE_INCLUDE_FILENAME);
	if (!existsSync(includeFilePath) || !statSync(includeFilePath).isFile()) {
		return [];
	}

	let candidatesOutput: string;
	try {
		// --exclude-from applies ONLY .worktreeinclude's own patterns (no
		// --exclude-standard), so this lists untracked files matching those
		// patterns regardless of whether the repository's real .gitignore
		// covers them.
		candidatesOutput = execSync(
			`git ls-files --others --ignored --exclude-from="${WORKTREE_INCLUDE_FILENAME}" -z`,
			{cwd: gitRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
		);
	} catch (error) {
		logger.error('Failed to resolve .worktreeinclude candidates', {
			gitRoot,
			error: String(error),
		});
		return [];
	}

	const candidates = candidatesOutput
		.split('\0')
		.filter(entry => entry.length > 0);
	if (candidates.length === 0) {
		return [];
	}

	// Confirm each candidate against the repository's real ignore rules.
	// git check-ignore --stdin echoes back only the paths it is asked about
	// that ARE ignored, so this is the second half of the intersection.
	let ignoredOutput: string;
	try {
		ignoredOutput = execSync('git check-ignore --stdin -z', {
			cwd: gitRoot,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
			input: candidates.join('\0') + '\0',
		});
	} catch (error) {
		// Exit code 1 (no matches) surfaces as a thrown error; anything already
		// written to stdout before that is still the correct partial result.
		const execError = error as {stdout?: string};
		ignoredOutput = execError.stdout ?? '';
	}

	return ignoredOutput.split('\0').filter(entry => entry.length > 0);
}

/**
 * Copies the files a `.worktreeinclude` file selects from the main checkout
 * into a freshly created worktree. No-ops when no `.worktreeinclude` file
 * exists. Never overwrites a file that already exists at the destination.
 *
 * @param gitRoot - Absolute path to the main checkout (repository root)
 * @param targetWorktreePath - Absolute path to the newly created worktree
 */
export function copyWorktreeIncludeFiles(
	gitRoot: string,
	targetWorktreePath: string,
): void {
	const relativePaths = resolveWorktreeIncludeFiles(gitRoot);

	for (const relativePath of relativePaths) {
		const sourcePath = path.join(gitRoot, relativePath);
		const targetPath = path.join(targetWorktreePath, relativePath);

		if (!existsSync(sourcePath)) {
			continue;
		}
		if (existsSync(targetPath)) {
			logger.warn(
				'Skipping .worktreeinclude copy, destination already exists',
				{
					relativePath,
					targetPath,
				},
			);
			continue;
		}

		mkdirSync(path.dirname(targetPath), {recursive: true});
		cpSync(sourcePath, targetPath, {recursive: true, preserveTimestamps: true});
	}
}
