import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {exec} from 'child_process';
import {promisify} from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {getGitRepositoryRoot} from './gitUtils.js';

const execAsync = promisify(exec);

/**
 * Integration test for getGitRepositoryRoot with real git submodules.
 *
 * This test creates a real git repository with submodules to verify
 * that repository roots are correctly identified when running inside submodules.
 *
 * Issue: https://github.com/kbwo/ccmanager/issues/189
 */
describe(
	'Submodule Recognition - getGitRepositoryRoot',
	{timeout: 10000},
	() => {
		let tempDir: string;
		let superprojectDir: string;
		let submodule1Dir: string;
		let submodule1RepoDir: string;

		beforeAll(async () => {
			tempDir = fs.mkdtempSync(
				path.join(os.tmpdir(), 'ccmanager-submodule-test-'),
			);
			superprojectDir = path.join(tempDir, 'superproject');
			submodule1RepoDir = path.join(tempDir, 'submodule-1-repo');
			submodule1Dir = path.join(superprojectDir, 'modules', 'submodule-1');

			fs.mkdirSync(superprojectDir, {recursive: true});
			fs.mkdirSync(submodule1RepoDir, {recursive: true});

			// Initialize superproject
			await execAsync('git init', {cwd: superprojectDir});
			await execAsync('git config user.name "Test"', {cwd: superprojectDir});
			await execAsync('git config user.email "test@test.com"', {
				cwd: superprojectDir,
			});
			fs.writeFileSync(
				path.join(superprojectDir, 'README.md'),
				'# Superproject\n',
			);
			await execAsync('git add .', {cwd: superprojectDir});
			await execAsync('git commit -m "Initial commit"', {cwd: superprojectDir});

			// Initialize submodule repo
			await execAsync('git init', {cwd: submodule1RepoDir});
			await execAsync('git config user.name "Test"', {cwd: submodule1RepoDir});
			await execAsync('git config user.email "test@test.com"', {
				cwd: submodule1RepoDir,
			});
			fs.writeFileSync(
				path.join(submodule1RepoDir, 'README.md'),
				'# Submodule 1\n',
			);
			await execAsync('git add .', {cwd: submodule1RepoDir});
			await execAsync('git commit -m "Initial commit"', {
				cwd: submodule1RepoDir,
			});

			// Add submodule to superproject
			await execAsync(
				`git submodule add ${submodule1RepoDir} modules/submodule-1`,
				{cwd: superprojectDir},
			);
			await execAsync('git add .', {cwd: superprojectDir});
			await execAsync('git commit -m "Add submodule"', {cwd: superprojectDir});
		});

		afterAll(() => {
			fs.rmSync(tempDir, {recursive: true, force: true});
		});

		it('should return submodule root when in submodule directory', () => {
			const root = getGitRepositoryRoot(submodule1Dir);
			const normalizedExpected = fs.realpathSync.native(submodule1Dir);
			const normalizedRoot = root ? fs.realpathSync.native(root) : root;
			expect(normalizedRoot).toBe(normalizedExpected);
		});

		it('should return superproject root when in superproject directory', () => {
			const root = getGitRepositoryRoot(superprojectDir);
			const normalizedExpected = fs.realpathSync.native(superprojectDir);
			const normalizedRoot = root ? fs.realpathSync.native(root) : root;
			expect(normalizedRoot).toBe(normalizedExpected);
		});
	},
);
