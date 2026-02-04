import path from 'path';
import {execSync} from 'child_process';

/**
 * Check if a worktree or repository has uncommitted changes.
 * This includes unstaged changes, staged changes, and untracked files.
 *
 * @param worktreePath - The path to the worktree or repository
 * @returns true if there are uncommitted changes, false if clean
 */
export function hasUncommittedChanges(worktreePath: string): boolean {
	try {
		const output = execSync('git status --porcelain', {
			cwd: worktreePath,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
		return output.length > 0;
	} catch {
		// Conservative default on error - treat as having changes
		return true;
	}
}

/**
 * Get the git repository root path from a given directory.
 * For worktrees, this returns the main repository root (parent of .git).
 * For submodules, this returns the submodule's working directory.
 *
 * @param cwd - The directory to start searching from
 * @returns The absolute path to the git repository root, or null if not in a git repo
 */
export function getGitRepositoryRoot(cwd: string): string | null {
	try {
		const gitCommonDir = execSync('git rev-parse --git-common-dir', {
			cwd,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();

		const absoluteGitCommonDir = path.isAbsolute(gitCommonDir)
			? gitCommonDir
			: path.resolve(cwd, gitCommonDir);

		// Handle submodule paths: if path contains .git/modules, use --show-toplevel
		// to get the submodule's actual working directory
		if (absoluteGitCommonDir.includes('.git/modules')) {
			const toplevel = execSync('git rev-parse --show-toplevel', {
				cwd,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
			}).trim();
			return toplevel;
		}

		// Handle worktree paths: if path contains .git/worktrees, find the real .git parent
		if (absoluteGitCommonDir.includes('.git/worktrees')) {
			const gitIndex = absoluteGitCommonDir.indexOf('.git');
			const gitPath = absoluteGitCommonDir.substring(0, gitIndex + 4);
			return path.dirname(gitPath);
		}

		// For regular .git directories, the parent is the repository root
		return path.dirname(absoluteGitCommonDir);
	} catch {
		return null;
	}
}
