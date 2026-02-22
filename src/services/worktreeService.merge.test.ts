import {describe, it, expect, afterAll, beforeEach} from 'vitest';
import {execSync} from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {Effect} from 'effect';
import {WorktreeService} from './worktreeService.js';

describe('WorktreeService mergeWorktreeEffect (real git)', () => {
	const testDir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'ccmanager-merge-test-')),
	);
	const mainRepoDir = path.join(testDir, 'main-repo');
	const sourceWorktreeDir = path.join(testDir, 'wt-source');
	const targetWorktreeDir = path.join(testDir, 'wt-target');

	const gitOpts = (cwd: string) => ({cwd, encoding: 'utf8' as const});

	const getCommitCount = (cwd: string): number => {
		const log = execSync('git log --oneline', gitOpts(cwd)).trim();
		return log.split('\n').filter(l => l.length > 0).length;
	};

	const getLastCommitMessage = (cwd: string): string => {
		return execSync('git log -1 --format=%s', gitOpts(cwd)).trim();
	};

	const branchContainsFile = (cwd: string, filename: string): boolean => {
		return fs.existsSync(path.join(cwd, filename));
	};

	// Set up a fresh repo with source and target worktrees before each test
	beforeEach(() => {
		// Clean up previous iteration
		if (fs.existsSync(mainRepoDir)) {
			// Remove worktrees before deleting repo
			try {
				execSync(
					`git worktree remove "${sourceWorktreeDir}" --force`,
					gitOpts(mainRepoDir),
				);
			} catch {
				/* ignore */
			}
			try {
				execSync(
					`git worktree remove "${targetWorktreeDir}" --force`,
					gitOpts(mainRepoDir),
				);
			} catch {
				/* ignore */
			}
			fs.rmSync(mainRepoDir, {recursive: true, force: true});
		}
		if (fs.existsSync(sourceWorktreeDir)) {
			fs.rmSync(sourceWorktreeDir, {recursive: true, force: true});
		}
		if (fs.existsSync(targetWorktreeDir)) {
			fs.rmSync(targetWorktreeDir, {recursive: true, force: true});
		}

		// Create main repository with initial commit
		fs.mkdirSync(mainRepoDir, {recursive: true});
		execSync('git init', gitOpts(mainRepoDir));
		execSync('git config user.email "test@test.com"', gitOpts(mainRepoDir));
		execSync('git config user.name "Test User"', gitOpts(mainRepoDir));
		fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Test Repo');
		execSync('git add README.md', gitOpts(mainRepoDir));
		execSync('git commit -m "Initial commit"', gitOpts(mainRepoDir));

		// Create target branch + worktree
		execSync('git branch target-branch', gitOpts(mainRepoDir));
		execSync(
			`git worktree add "${targetWorktreeDir}" target-branch`,
			gitOpts(mainRepoDir),
		);

		// Create source branch + worktree
		execSync('git branch source-branch', gitOpts(mainRepoDir));
		execSync(
			`git worktree add "${sourceWorktreeDir}" source-branch`,
			gitOpts(mainRepoDir),
		);

		// Add commits to source branch
		fs.writeFileSync(
			path.join(sourceWorktreeDir, 'feature-1.txt'),
			'feature 1',
		);
		execSync('git add feature-1.txt', gitOpts(sourceWorktreeDir));
		execSync('git commit -m "feat: add feature 1"', gitOpts(sourceWorktreeDir));

		fs.writeFileSync(
			path.join(sourceWorktreeDir, 'feature-2.txt'),
			'feature 2',
		);
		execSync('git add feature-2.txt', gitOpts(sourceWorktreeDir));
		execSync('git commit -m "feat: add feature 2"', gitOpts(sourceWorktreeDir));
	});

	afterAll(() => {
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, {recursive: true, force: true});
		}
	});

	it('should merge with default --no-ff args', async () => {
		const service = new WorktreeService(mainRepoDir);

		await Effect.runPromise(
			service.mergeWorktreeEffect('source-branch', 'target-branch'),
		);

		// Target should now have the source files
		expect(branchContainsFile(targetWorktreeDir, 'feature-1.txt')).toBe(true);
		expect(branchContainsFile(targetWorktreeDir, 'feature-2.txt')).toBe(true);

		// --no-ff creates a merge commit, so target should have:
		// initial commit + merge commit = 4 total (initial + 2 from source + merge commit)
		const count = getCommitCount(targetWorktreeDir);
		expect(count).toBe(4);

		// Last commit should be a merge commit
		const lastMsg = getLastCommitMessage(targetWorktreeDir);
		expect(lastMsg).toContain('Merge');
	});

	it('should merge with custom mergeArgs from MergeConfig', async () => {
		const service = new WorktreeService(mainRepoDir);

		await Effect.runPromise(
			service.mergeWorktreeEffect('source-branch', 'target-branch', 'merge', {
				mergeArgs: ['--squash'],
			}),
		);

		// Target should have the source files (staged by --squash)
		expect(branchContainsFile(targetWorktreeDir, 'feature-1.txt')).toBe(true);
		expect(branchContainsFile(targetWorktreeDir, 'feature-2.txt')).toBe(true);

		// --squash does not create a merge commit automatically;
		// git merge --squash stages changes but does not commit.
		// The service does NOT auto-commit for plain merge, so check that
		// there is no merge commit — changes are just staged.
		// Actually let's verify: with --squash there's no extra merge commit
		// The commit count on target should still be 1 (initial) since squash only stages
		const count = getCommitCount(targetWorktreeDir);
		expect(count).toBe(1);

		// Verify there are staged changes ready to commit
		const status = execSync(
			'git status --porcelain',
			gitOpts(targetWorktreeDir),
		).trim();
		expect(status).toContain('feature-1.txt');
		expect(status).toContain('feature-2.txt');
	});

	it('should rebase with default (empty) rebaseArgs', async () => {
		const service = new WorktreeService(mainRepoDir);

		await Effect.runPromise(
			service.mergeWorktreeEffect('source-branch', 'target-branch', 'rebase'),
		);

		// Target should now have the source files via ff-only merge after rebase
		expect(branchContainsFile(targetWorktreeDir, 'feature-1.txt')).toBe(true);
		expect(branchContainsFile(targetWorktreeDir, 'feature-2.txt')).toBe(true);

		// Rebase + ff-only: no merge commit, linear history
		// initial commit + 2 feature commits = 3
		const count = getCommitCount(targetWorktreeDir);
		expect(count).toBe(3);

		// Commit messages should be preserved
		const log = execSync(
			'git log --oneline',
			gitOpts(targetWorktreeDir),
		).trim();
		expect(log).toContain('feat: add feature 1');
		expect(log).toContain('feat: add feature 2');
	});

	it('should rebase with custom rebaseArgs from MergeConfig', async () => {
		const service = new WorktreeService(mainRepoDir);

		// --no-stat is a harmless rebase flag that suppresses diffstat
		await Effect.runPromise(
			service.mergeWorktreeEffect('source-branch', 'target-branch', 'rebase', {
				rebaseArgs: ['--no-stat'],
			}),
		);

		// Should still produce the same result — linear history
		expect(branchContainsFile(targetWorktreeDir, 'feature-1.txt')).toBe(true);
		expect(branchContainsFile(targetWorktreeDir, 'feature-2.txt')).toBe(true);

		const count = getCommitCount(targetWorktreeDir);
		expect(count).toBe(3);
	});

	it('should use default args when MergeConfig is provided but mergeArgs is undefined', async () => {
		const service = new WorktreeService(mainRepoDir);

		// Provide MergeConfig with only rebaseArgs — mergeArgs should default to --no-ff
		await Effect.runPromise(
			service.mergeWorktreeEffect('source-branch', 'target-branch', 'merge', {
				rebaseArgs: ['--no-stat'],
			}),
		);

		expect(branchContainsFile(targetWorktreeDir, 'feature-1.txt')).toBe(true);
		expect(branchContainsFile(targetWorktreeDir, 'feature-2.txt')).toBe(true);

		// --no-ff creates a merge commit: initial + 2 source + merge = 4
		const count = getCommitCount(targetWorktreeDir);
		expect(count).toBe(4);

		const lastMsg = getLastCommitMessage(targetWorktreeDir);
		expect(lastMsg).toContain('Merge');
	});

	it('should fail with GitError when target worktree not found', async () => {
		const service = new WorktreeService(mainRepoDir);

		const result = await Effect.runPromise(
			Effect.either(
				service.mergeWorktreeEffect('source-branch', 'nonexistent-branch'),
			),
		);

		expect(result._tag).toBe('Left');
		if (result._tag === 'Left') {
			expect(result.left.stderr).toContain('Target branch worktree not found');
		}
	});

	it('should fail with GitError on merge conflict', async () => {
		// Create a conflicting commit on the target branch
		fs.writeFileSync(
			path.join(targetWorktreeDir, 'feature-1.txt'),
			'conflicting content',
		);
		execSync('git add feature-1.txt', gitOpts(targetWorktreeDir));
		execSync(
			'git commit -m "conflict: add feature-1 on target"',
			gitOpts(targetWorktreeDir),
		);

		const service = new WorktreeService(mainRepoDir);

		const result = await Effect.runPromise(
			Effect.either(
				service.mergeWorktreeEffect('source-branch', 'target-branch'),
			),
		);

		expect(result._tag).toBe('Left');
		if (result._tag === 'Left') {
			expect(result.left._tag).toBe('GitError');
		}

		// Abort the failed merge to leave repo in clean state
		try {
			execSync('git merge --abort', gitOpts(targetWorktreeDir));
		} catch {
			/* ignore */
		}
	});
});
