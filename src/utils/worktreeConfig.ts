import {promisify} from 'util';
import {exec, execSync, execFileSync} from 'child_process';

const execp = promisify(exec);

export function isWorktreeConfigEnabled(gitPath?: string): boolean {
	try {
		const result = execSync('git config extensions.worktreeConfig', {
			cwd: gitPath || process.cwd(),
			encoding: 'utf8',
		}).trim();
		return result === 'true';
	} catch {
		return false;
	}
}

export async function getWorktreeParentBranch(
	worktreePath: string,
	signal?: AbortSignal,
): Promise<string | null> {
	try {
		const result = await execp('git config --worktree ccmanager.parentBranch', {
			cwd: worktreePath,
			encoding: 'utf8',
			signal,
		});
		return result.stdout.trim() || null;
	} catch {
		return null;
	}
}

export function setWorktreeParentBranch(
	worktreePath: string,
	parentBranch: string,
): void {
	execFileSync(
		'git',
		['config', '--worktree', 'ccmanager.parentBranch', parentBranch],
		{
			cwd: worktreePath,
			encoding: 'utf8',
		},
	);
}
