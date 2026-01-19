import path from 'path';
import {execSync} from 'child_process';

/**
 * Get the git repository root path from a given directory.
 * For worktrees, this returns the main repository root (parent of .git).
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
