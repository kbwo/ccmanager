import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {execSync} from 'child_process';
import {Effect} from 'effect';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {WorktreeService} from './worktreeService.js';

/**
 * Integration test for WorktreeService with real git submodules.
 *
 * This test creates a real git repository with submodules to verify
 * that worktree paths are correctly identified when running inside submodules.
 *
 * Issue: https://github.com/kbwo/ccmanager/issues/189
 */
describe('WorktreeService with real git submodules', {timeout: 10000}, () => {
	let tempDir: string;
	let rootProjectDir: string;
	let submoduleDir: string;
	let submoduleRepoDir: string;

	beforeAll(() => {
		// Create temp directory for test
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'ccmanager-worktree-service-submodule-test-'),
		);

		// Create the submodule source repository first
		submoduleRepoDir = path.join(tempDir, 'submodule-1-repo');
		fs.mkdirSync(submoduleRepoDir);
		execSync('git init', {cwd: submoduleRepoDir});
		execSync('git config user.email "test@test.com"', {cwd: submoduleRepoDir});
		execSync('git config user.name "Test"', {cwd: submoduleRepoDir});
		fs.writeFileSync(path.join(submoduleRepoDir, 'README.md'), '# Submodule 1');
		execSync('git add .', {cwd: submoduleRepoDir});
		execSync('git commit -m "Initial commit"', {cwd: submoduleRepoDir});

		// Create the root project
		rootProjectDir = path.join(tempDir, 'root-project');
		fs.mkdirSync(rootProjectDir);
		execSync('git init', {cwd: rootProjectDir});
		execSync('git config user.email "test@test.com"', {cwd: rootProjectDir});
		execSync('git config user.name "Test"', {cwd: rootProjectDir});
		fs.writeFileSync(path.join(rootProjectDir, 'README.md'), '# Root Project');
		execSync('git add .', {cwd: rootProjectDir});
		execSync('git commit -m "Initial commit"', {cwd: rootProjectDir});

		// Create modules directory and add submodule
		fs.mkdirSync(path.join(rootProjectDir, 'modules'));
		execSync(`git submodule add ${submoduleRepoDir} modules/submodule-1`, {
			cwd: rootProjectDir,
		});
		execSync('git commit -m "Add submodule"', {cwd: rootProjectDir});

		// The submodule working directory
		submoduleDir = path.join(rootProjectDir, 'modules', 'submodule-1');
	});

	afterAll(() => {
		// Clean up temp directory
		fs.rmSync(tempDir, {recursive: true, force: true});
	});

	it('should return worktree path as the submodule working directory, not gitdir', async () => {
		const service = new WorktreeService(submoduleDir);
		const worktrees = await Effect.runPromise(service.getWorktreesEffect());

		expect(worktrees).toHaveLength(1);
		// The path should be the actual working directory, not .git/modules/...
		const normalizedPath = fs.realpathSync.native(worktrees[0]!.path);
		const expectedPath = fs.realpathSync.native(submoduleDir);
		expect(normalizedPath).toBe(expectedPath);
	});

	it('should return correct gitRootPath for submodule', () => {
		const service = new WorktreeService(submoduleDir);
		const gitRootPath = service.getGitRootPath();

		// The gitRootPath should be the submodule working directory
		const normalizedPath = fs.realpathSync.native(gitRootPath);
		const expectedPath = fs.realpathSync.native(submoduleDir);
		expect(normalizedPath).toBe(expectedPath);
	});
});
