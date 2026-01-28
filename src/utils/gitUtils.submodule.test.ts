import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {execSync} from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {getGitRepositoryRoot} from './gitUtils.js';

describe('getGitRepositoryRoot with submodules', () => {
	// Use os.tmpdir() and unique suffix to avoid conflicts with parallel tests
	// Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
	const testDir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'ccmanager-submodule-test-')),
	);
	const rootProjectDir = path.join(testDir, 'root-project');
	const submodule1Dir = path.join(rootProjectDir, 'modules', 'submodule-1');

	beforeAll(() => {
		// Clean up if exists
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, {recursive: true, force: true});
		}

		// Create test directory structure
		fs.mkdirSync(testDir, {recursive: true});

		// Create submodule source repository
		const submodule1Source = path.join(testDir, 'submodule-1-source');
		fs.mkdirSync(submodule1Source, {recursive: true});
		execSync('git init', {cwd: submodule1Source});
		fs.writeFileSync(path.join(submodule1Source, 'README.md'), '# Submodule 1');
		execSync('git add README.md', {cwd: submodule1Source});
		execSync('git commit -m "Initial commit"', {cwd: submodule1Source});

		// Create root project
		fs.mkdirSync(rootProjectDir, {recursive: true});
		execSync('git init', {cwd: rootProjectDir});
		fs.writeFileSync(path.join(rootProjectDir, 'README.md'), '# Root Project');
		execSync('git add README.md', {cwd: rootProjectDir});
		execSync('git commit -m "Initial commit"', {cwd: rootProjectDir});

		// Add submodule
		execSync(`git submodule add ${submodule1Source} modules/submodule-1`, {
			cwd: rootProjectDir,
		});
		execSync('git commit -m "Add submodule"', {cwd: rootProjectDir});
	});

	afterAll(() => {
		// Clean up
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, {recursive: true, force: true});
		}
	});

	it('should return the submodule working directory, not the parent .git/modules path', () => {
		// When running from within a submodule
		const result = getGitRepositoryRoot(submodule1Dir);

		// Should return the submodule's working directory
		expect(result).toBe(submodule1Dir);

		// Should NOT return a path containing .git/modules
		expect(result).not.toContain('.git/modules');
	});

	it('should still work for regular repositories', () => {
		const result = getGitRepositoryRoot(rootProjectDir);

		expect(result).toBe(rootProjectDir);
		expect(path.basename(result!)).toBe('root-project');
	});
});
