import {describe, it, expect, beforeEach, vi} from 'vitest';
import {WorktreeService} from './worktreeService.js';
import {execSync} from 'child_process';

// Mock child_process module
vi.mock('child_process');

describe('WorktreeService', () => {
	let service: WorktreeService;

	beforeEach(() => {
		vi.clearAllMocks();
		// Mock git rev-parse --git-common-dir to return a predictable path
		(execSync as any).mockImplementation((cmd: string) => {
			if (cmd === 'git rev-parse --git-common-dir') {
				return '/fake/path/.git\n';
			}
			throw new Error('Command not mocked: ' + cmd);
		});
		service = new WorktreeService('/fake/path');
	});

	describe('getDefaultBranch', () => {
		it('should return default branch from origin', () => {
			(execSync as any).mockImplementation((cmd: string) => {
				if (cmd === 'git rev-parse --git-common-dir') {
					return '/fake/path/.git\n';
				}
				if (cmd.includes('symbolic-ref')) {
					return 'main\n';
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const result = service.getDefaultBranch();

			expect(result).toBe('main');
			expect(execSync).toHaveBeenCalledWith(
				"git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'",
				expect.objectContaining({
					cwd: '/fake/path',
					encoding: 'utf8',
					shell: '/bin/bash',
				}),
			);
		});

		it('should fallback to main if origin HEAD fails', () => {
			(execSync as any).mockImplementation((cmd: string) => {
				if (cmd === 'git rev-parse --git-common-dir') {
					return '/fake/path/.git\n';
				}
				if (cmd.includes('symbolic-ref')) {
					throw new Error('No origin');
				}
				if (cmd.includes('rev-parse --verify main')) {
					return 'hash';
				}
				throw new Error('Not found');
			});

			const result = service.getDefaultBranch();

			expect(result).toBe('main');
		});
	});

	describe('getAllBranches', () => {
		it('should return all branches without duplicates', () => {
			(execSync as any).mockImplementation((cmd: string) => {
				if (cmd === 'git rev-parse --git-common-dir') {
					return '/fake/path/.git\n';
				}
				if (cmd.includes('branch -a')) {
					return `main
feature/test
origin/main
origin/feature/remote
origin/feature/test
`;
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const result = service.getAllBranches();

			expect(result).toEqual(['main', 'feature/test', 'feature/remote']);
		});

		it('should return empty array on error', () => {
			(execSync as any).mockImplementation((cmd: string) => {
				if (cmd === 'git rev-parse --git-common-dir') {
					return '/fake/path/.git\n';
				}
				throw new Error('Git error');
			});

			const result = service.getAllBranches();

			expect(result).toEqual([]);
		});
	});

	describe('createWorktree', () => {
		it('should create worktree with base branch when branch does not exist', () => {
			(execSync as any).mockImplementation((cmd: string) => {
				if (cmd === 'git rev-parse --git-common-dir') {
					return '/fake/path/.git\n';
				}
				if (cmd.includes('rev-parse --verify')) {
					throw new Error('Branch not found');
				}
				return '';
			});

			const result = service.createWorktree(
				'/path/to/worktree',
				'new-feature',
				'develop',
			);

			expect(result).toEqual({success: true});
			expect(execSync).toHaveBeenCalledWith(
				'git worktree add -b "new-feature" "/path/to/worktree" "develop"',
				expect.any(Object),
			);
		});

		it('should create worktree without base branch when branch exists', () => {
			(execSync as any).mockImplementation((cmd: string) => {
				if (cmd === 'git rev-parse --git-common-dir') {
					return '/fake/path/.git\n';
				}
				if (cmd.includes('rev-parse --verify')) {
					return 'hash';
				}
				return '';
			});

			const result = service.createWorktree(
				'/path/to/worktree',
				'existing-feature',
			);

			expect(result).toEqual({success: true});
			expect(execSync).toHaveBeenCalledWith(
				'git worktree add "/path/to/worktree" "existing-feature"',
				expect.any(Object),
			);
		});

		it('should create worktree from HEAD when no base branch specified', () => {
			(execSync as any).mockImplementation((cmd: string) => {
				if (cmd === 'git rev-parse --git-common-dir') {
					return '/fake/path/.git\n';
				}
				if (cmd.includes('rev-parse --verify')) {
					throw new Error('Branch not found');
				}
				return '';
			});

			const result = service.createWorktree('/path/to/worktree', 'new-feature');

			expect(result).toEqual({success: true});
			expect(execSync).toHaveBeenCalledWith(
				'git worktree add -b "new-feature" "/path/to/worktree"',
				expect.any(Object),
			);
		});
	});
});
