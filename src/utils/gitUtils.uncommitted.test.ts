import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {execSync} from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {hasUncommittedChanges} from './gitUtils.js';

describe('hasUncommittedChanges', () => {
	// Use os.tmpdir() and unique suffix to avoid conflicts with parallel tests
	// Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
	const testDir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'ccmanager-uncommitted-test-')),
	);
	const mainRepoDir = path.join(testDir, 'main-repo');
	const worktreeDir = path.join(testDir, 'worktree-1');

	beforeAll(() => {
		// Clean up if exists
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, {recursive: true, force: true});
		}

		// Create test directory structure
		fs.mkdirSync(testDir, {recursive: true});

		// Create main repository
		fs.mkdirSync(mainRepoDir, {recursive: true});
		execSync('git init', {cwd: mainRepoDir});
		// Set git user for CI environment
		execSync('git config user.email "test@test.com"', {cwd: mainRepoDir});
		execSync('git config user.name "Test User"', {cwd: mainRepoDir});
		fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Main Repo');
		execSync('git add README.md', {cwd: mainRepoDir});
		execSync('git commit -m "Initial commit"', {cwd: mainRepoDir});

		// Create a branch and worktree
		execSync('git branch feature-branch', {cwd: mainRepoDir});
		execSync(`git worktree add ${worktreeDir} feature-branch`, {
			cwd: mainRepoDir,
		});
	});

	afterAll(() => {
		// Clean up worktree first
		try {
			execSync(`git worktree remove ${worktreeDir} --force`, {
				cwd: mainRepoDir,
			});
		} catch {
			// Ignore errors
		}

		// Clean up
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, {recursive: true, force: true});
		}
	});

	it('should return false for a clean worktree', () => {
		const result = hasUncommittedChanges(worktreeDir);
		expect(result).toBe(false);
	});

	it('should return true for a worktree with unstaged changes', () => {
		// Create an unstaged change
		fs.writeFileSync(path.join(worktreeDir, 'README.md'), '# Modified');

		const result = hasUncommittedChanges(worktreeDir);
		expect(result).toBe(true);

		// Restore the file
		execSync('git checkout README.md', {cwd: worktreeDir});
	});

	it('should return true for a worktree with staged but uncommitted changes', () => {
		// Create a staged change
		fs.writeFileSync(path.join(worktreeDir, 'new-file.txt'), 'new content');
		execSync('git add new-file.txt', {cwd: worktreeDir});

		const result = hasUncommittedChanges(worktreeDir);
		expect(result).toBe(true);

		// Reset the change
		execSync('git reset HEAD new-file.txt', {cwd: worktreeDir});
		fs.unlinkSync(path.join(worktreeDir, 'new-file.txt'));
	});

	it('should return true for a worktree with untracked files', () => {
		// Create an untracked file
		fs.writeFileSync(path.join(worktreeDir, 'untracked.txt'), 'untracked');

		const result = hasUncommittedChanges(worktreeDir);
		expect(result).toBe(true);

		// Clean up
		fs.unlinkSync(path.join(worktreeDir, 'untracked.txt'));
	});

	it('should return false for a clean main repository', () => {
		const result = hasUncommittedChanges(mainRepoDir);
		expect(result).toBe(false);
	});

	it('should return true for a main repository with uncommitted changes', () => {
		// Create an unstaged change
		fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Modified Main');

		const result = hasUncommittedChanges(mainRepoDir);
		expect(result).toBe(true);

		// Restore the file
		execSync('git checkout README.md', {cwd: mainRepoDir});
	});
});
