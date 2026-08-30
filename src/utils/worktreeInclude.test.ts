import {describe, it, expect, beforeEach, afterAll} from 'vitest';
import {execSync} from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
	resolveWorktreeIncludeFiles,
	copyWorktreeIncludeFiles,
} from './worktreeInclude.js';

describe('worktreeInclude', () => {
	const testDir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'ccmanager-worktreeinclude-test-')),
	);
	let repoCount = 0;
	let gitRoot: string;

	beforeEach(() => {
		repoCount += 1;
		gitRoot = path.join(testDir, `repo-${repoCount}`);
		fs.mkdirSync(gitRoot, {recursive: true});
		execSync('git init', {cwd: gitRoot});
		execSync('git config user.email "test@test.com"', {cwd: gitRoot});
		execSync('git config user.name "Test User"', {cwd: gitRoot});
		fs.writeFileSync(path.join(gitRoot, 'README.md'), '# repo');
		execSync('git add README.md', {cwd: gitRoot});
		execSync('git commit -m "initial commit"', {cwd: gitRoot});
	});

	afterAll(() => {
		fs.rmSync(testDir, {recursive: true, force: true});
	});

	it('returns an empty list when no .worktreeinclude file exists', () => {
		fs.writeFileSync(path.join(gitRoot, '.env'), 'SECRET=1');
		expect(resolveWorktreeIncludeFiles(gitRoot)).toEqual([]);
	});

	it('selects a file that matches .worktreeinclude and is gitignored', () => {
		fs.writeFileSync(path.join(gitRoot, '.gitignore'), '.env\n');
		fs.writeFileSync(path.join(gitRoot, '.worktreeinclude'), '.env\n');
		fs.writeFileSync(path.join(gitRoot, '.env'), 'SECRET=1');

		expect(resolveWorktreeIncludeFiles(gitRoot)).toEqual(['.env']);
	});

	it('excludes a file that matches .worktreeinclude but is not gitignored', () => {
		fs.writeFileSync(path.join(gitRoot, '.worktreeinclude'), 'notes.txt\n');
		fs.writeFileSync(path.join(gitRoot, 'notes.txt'), 'not ignored');

		expect(resolveWorktreeIncludeFiles(gitRoot)).toEqual([]);
	});

	it('excludes a tracked file even when it matches .worktreeinclude', () => {
		fs.writeFileSync(path.join(gitRoot, '.gitignore'), 'tracked.env\n');
		fs.writeFileSync(path.join(gitRoot, '.worktreeinclude'), 'tracked.env\n');
		fs.writeFileSync(path.join(gitRoot, 'tracked.env'), 'SECRET=1');
		execSync('git add -f tracked.env', {cwd: gitRoot});
		execSync('git commit -m "track tracked.env"', {cwd: gitRoot});

		expect(resolveWorktreeIncludeFiles(gitRoot)).toEqual([]);
	});

	it('resolves every file under a directory glob pattern', () => {
		fs.writeFileSync(path.join(gitRoot, '.gitignore'), 'certs/\n');
		fs.writeFileSync(
			path.join(gitRoot, '.worktreeinclude'),
			'certs/local/**\n',
		);
		fs.mkdirSync(path.join(gitRoot, 'certs', 'local', 'nested'), {
			recursive: true,
		});
		fs.writeFileSync(path.join(gitRoot, 'certs', 'local', 'cert.pem'), 'cert');
		fs.writeFileSync(
			path.join(gitRoot, 'certs', 'local', 'nested', 'key.pem'),
			'key',
		);

		expect(resolveWorktreeIncludeFiles(gitRoot).sort()).toEqual([
			'certs/local/cert.pem',
			'certs/local/nested/key.pem',
		]);
	});

	describe('copyWorktreeIncludeFiles', () => {
		it('copies selected files into the target worktree, recreating nested directories', () => {
			fs.writeFileSync(path.join(gitRoot, '.gitignore'), '.env\ncerts/\n');
			fs.writeFileSync(
				path.join(gitRoot, '.worktreeinclude'),
				'.env\ncerts/local/**\n',
			);
			fs.writeFileSync(path.join(gitRoot, '.env'), 'SECRET=1');
			fs.mkdirSync(path.join(gitRoot, 'certs', 'local'), {recursive: true});
			fs.writeFileSync(
				path.join(gitRoot, 'certs', 'local', 'cert.pem'),
				'cert',
			);

			const targetWorktreePath = path.join(testDir, `target-${repoCount}`);
			fs.mkdirSync(targetWorktreePath, {recursive: true});

			copyWorktreeIncludeFiles(gitRoot, targetWorktreePath);

			expect(
				fs.readFileSync(path.join(targetWorktreePath, '.env'), 'utf8'),
			).toBe('SECRET=1');
			expect(
				fs.readFileSync(
					path.join(targetWorktreePath, 'certs', 'local', 'cert.pem'),
					'utf8',
				),
			).toBe('cert');
		});

		it('does not overwrite a file that already exists at the destination', () => {
			fs.writeFileSync(path.join(gitRoot, '.gitignore'), '.env\n');
			fs.writeFileSync(path.join(gitRoot, '.worktreeinclude'), '.env\n');
			fs.writeFileSync(path.join(gitRoot, '.env'), 'SOURCE');

			const targetWorktreePath = path.join(testDir, `target-${repoCount}`);
			fs.mkdirSync(targetWorktreePath, {recursive: true});
			fs.writeFileSync(path.join(targetWorktreePath, '.env'), 'EXISTING');

			copyWorktreeIncludeFiles(gitRoot, targetWorktreePath);

			expect(
				fs.readFileSync(path.join(targetWorktreePath, '.env'), 'utf8'),
			).toBe('EXISTING');
		});

		it('is a no-op when no .worktreeinclude file exists', () => {
			const targetWorktreePath = path.join(testDir, `target-${repoCount}`);
			fs.mkdirSync(targetWorktreePath, {recursive: true});

			expect(() =>
				copyWorktreeIncludeFiles(gitRoot, targetWorktreePath),
			).not.toThrow();
			expect(fs.readdirSync(targetWorktreePath)).toEqual([]);
		});
	});
});
