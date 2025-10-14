import {describe, it, expect, beforeEach, vi} from 'vitest';
import {WorktreeService} from './worktreeService.js';
import {execSync} from 'child_process';
import {existsSync, statSync, Stats} from 'fs';
import {configurationManager} from './configurationManager.js';
import {Effect} from 'effect';
import {GitError} from '../types/errors.js';

// Mock child_process module
vi.mock('child_process');

// Mock fs module
vi.mock('fs');

// Mock worktreeConfigManager
vi.mock('./worktreeConfigManager.js', () => ({
	worktreeConfigManager: {
		initialize: vi.fn(),
		isAvailable: vi.fn(() => true),
		reset: vi.fn(),
	},
}));

// Mock configurationManager
vi.mock('./configurationManager.js', () => ({
	configurationManager: {
		getWorktreeHooks: vi.fn(),
	},
}));

// Mock HookExecutor
vi.mock('../utils/hookExecutor.js', () => ({
	executeWorktreePostCreationHook: vi.fn(),
}));

// Get the mocked function with proper typing
const mockedExecSync = vi.mocked(execSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedStatSync = vi.mocked(statSync);
const mockedGetWorktreeHooks = vi.mocked(configurationManager.getWorktreeHooks);

// Mock error interface for git command errors
interface MockGitError extends Error {
	status?: number;
	stderr?: string;
	stdout?: string;
}

describe('WorktreeService', () => {
	let service: WorktreeService;

	beforeEach(() => {
		vi.clearAllMocks();
		// Mock git rev-parse --git-common-dir to return a predictable path
		mockedExecSync.mockImplementation((cmd, _options) => {
			if (typeof cmd === 'string' && cmd === 'git rev-parse --git-common-dir') {
				return '/fake/path/.git\n';
			}
			throw new Error('Command not mocked: ' + cmd);
		});
		// Default mock for getWorktreeHooks to return empty config
		mockedGetWorktreeHooks.mockReturnValue({});
		service = new WorktreeService('/fake/path');
	});

	describe('getGitRootPath', () => {
		it('should always return an absolute path when git command returns absolute path', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (
					typeof cmd === 'string' &&
					cmd === 'git rev-parse --git-common-dir'
				) {
					return '/absolute/repo/.git\n';
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const service = new WorktreeService('/some/path');
			const result = service.getGitRootPath();

			expect(result).toBe('/absolute/repo');
			expect(result.startsWith('/')).toBe(true);
		});

		it('should convert relative path to absolute path', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (
					typeof cmd === 'string' &&
					cmd === 'git rev-parse --git-common-dir'
				) {
					return '.git\n';
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const service = new WorktreeService('/work/project');
			const result = service.getGitRootPath();

			// Should resolve relative .git to absolute path
			expect(result).toBe('/work/project');
			expect(result.startsWith('/')).toBe(true);
		});

		it('should handle relative paths with subdirectories', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (
					typeof cmd === 'string' &&
					cmd === 'git rev-parse --git-common-dir'
				) {
					return '../.git\n';
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const service = new WorktreeService('/work/project/subdir');
			const result = service.getGitRootPath();

			// Should resolve relative ../.git to absolute path
			expect(result).toBe('/work/project');
			expect(result.startsWith('/')).toBe(true);
		});

		it('should return absolute path on git command failure', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (
					typeof cmd === 'string' &&
					cmd === 'git rev-parse --git-common-dir'
				) {
					throw new Error('Not a git repository');
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const service = new WorktreeService('relative/path');
			const result = service.getGitRootPath();

			// Should convert relative path to absolute path
			expect(result.startsWith('/')).toBe(true);
			expect(result.endsWith('relative/path')).toBe(true);
		});

		it('should handle worktree paths correctly', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (
					typeof cmd === 'string' &&
					cmd === 'git rev-parse --git-common-dir'
				) {
					// Worktrees often return paths like: /path/to/main/.git/worktrees/feature
					return '/main/repo/.git/worktrees/feature\n';
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const service = new WorktreeService('/main/repo/feature-worktree');
			const result = service.getGitRootPath();

			// Should get the parent of .git directory
			expect(result).toBe('/main/repo');
			expect(result.startsWith('/')).toBe(true);
		});
	});

	describe('getDefaultBranchEffect', () => {
		it('should return Effect with default branch from origin', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('symbolic-ref')) {
						return 'main\n';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getDefaultBranchEffect();
			const result = await Effect.runPromise(effect);

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

		it('should fallback to main if origin HEAD fails', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('symbolic-ref')) {
						throw new Error('No origin');
					}
					if (cmd.includes('rev-parse --verify main')) {
						return 'hash';
					}
				}
				throw new Error('Not found');
			});

			const effect = service.getDefaultBranchEffect();
			const result = await Effect.runPromise(effect);

			expect(result).toBe('main');
		});
	});

	describe('getAllBranchesEffect', () => {
		it('should return Effect with all branches without duplicates', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
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
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getAllBranchesEffect();
			const result = await Effect.runPromise(effect);

			expect(result).toEqual(['main', 'feature/test', 'feature/remote']);
		});

		it('should return empty array on error', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (
					typeof cmd === 'string' &&
					cmd === 'git rev-parse --git-common-dir'
				) {
					return '/fake/path/.git\n';
				}
				throw new Error('Git error');
			});

			const effect = service.getAllBranchesEffect();
			const result = await Effect.runPromise(effect);

			expect(result).toEqual([]);
		});
	});

	describe('getCurrentBranchEffect', () => {
		it('should return Effect with current branch name on success', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git rev-parse --abbrev-ref HEAD') {
						return 'feature-branch\n';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getCurrentBranchEffect();
			const result = await Effect.runPromise(effect);

			expect(result).toBe('feature-branch');
			expect(execSync).toHaveBeenCalledWith(
				'git rev-parse --abbrev-ref HEAD',
				expect.objectContaining({
					cwd: '/fake/path',
					encoding: 'utf8',
				}),
			);
		});

		it('should return Effect with "unknown" when git command fails', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git rev-parse --abbrev-ref HEAD') {
						throw new Error('fatal: not a git repository');
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getCurrentBranchEffect();
			const result = await Effect.runPromise(effect);

			// Should fallback to 'unknown' instead of failing
			expect(result).toBe('unknown');
		});

		it('should return Effect with "unknown" when branch name is empty', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git rev-parse --abbrev-ref HEAD') {
						return '\n'; // Empty branch name
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getCurrentBranchEffect();
			const result = await Effect.runPromise(effect);

			// Should fallback to 'unknown' when no branch returned
			expect(result).toBe('unknown');
		});
	});

	describe('resolveBranchReference', () => {
		it('should return local branch when it exists', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (
						cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')
					) {
						return ''; // Local branch exists
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = (service as any).resolveBranchReference('foo/bar-xyz');
			expect(result).toBe('foo/bar-xyz');
		});

		it('should return single remote branch when local does not exist', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (
						cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')
					) {
						throw new Error('Local branch not found');
					}
					if (cmd === 'git remote') {
						return 'origin\nupstream\n';
					}
					if (
						cmd.includes(
							'show-ref --verify --quiet refs/remotes/origin/foo/bar-xyz',
						)
					) {
						return ''; // Remote branch exists in origin
					}
					if (
						cmd.includes(
							'show-ref --verify --quiet refs/remotes/upstream/foo/bar-xyz',
						)
					) {
						throw new Error('Remote branch not found in upstream');
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = (service as any).resolveBranchReference('foo/bar-xyz');
			expect(result).toBe('origin/foo/bar-xyz');
		});

		it('should throw AmbiguousBranchError when multiple remotes have the branch', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (
						cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')
					) {
						throw new Error('Local branch not found');
					}
					if (cmd === 'git remote') {
						return 'origin\nupstream\n';
					}
					if (
						cmd.includes(
							'show-ref --verify --quiet refs/remotes/origin/foo/bar-xyz',
						) ||
						cmd.includes(
							'show-ref --verify --quiet refs/remotes/upstream/foo/bar-xyz',
						)
					) {
						return ''; // Both remotes have the branch
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			expect(() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(service as any).resolveBranchReference('foo/bar-xyz');
			}).toThrow(
				"Ambiguous branch 'foo/bar-xyz' found in multiple remotes: origin/foo/bar-xyz, upstream/foo/bar-xyz. Please specify which remote to use.",
			);
		});

		it('should return original branch name when no branches exist', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git remote') {
						return 'origin\n';
					}
				}
				throw new Error('Branch not found');
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = (service as any).resolveBranchReference(
				'nonexistent-branch',
			);
			expect(result).toBe('nonexistent-branch');
		});

		it('should handle no remotes gracefully', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git remote') {
						return ''; // No remotes
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = (service as any).resolveBranchReference('some-branch');
			expect(result).toBe('some-branch');
		});

		it('should prefer local branch over remote branches', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (
						cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')
					) {
						return ''; // Local branch exists
					}
					// Remote commands should not be called when local exists
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = (service as any).resolveBranchReference('foo/bar-xyz');
			expect(result).toBe('foo/bar-xyz');
		});
	});

	describe('hasClaudeDirectoryInBranchEffect', () => {
		it('should return Effect with true when .claude directory exists in branch worktree', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/feature-branch
HEAD efgh5678
branch refs/heads/feature-branch
`;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			mockedExistsSync.mockImplementation(path => {
				return path === '/fake/path/feature-branch/.claude';
			});

			mockedStatSync.mockImplementation(
				() =>
					({
						isDirectory: () => true,
					}) as Stats,
			);

			const effect = service.hasClaudeDirectoryInBranchEffect('feature-branch');
			const result = await Effect.runPromise(effect);

			expect(result).toBe(true);
			expect(existsSync).toHaveBeenCalledWith(
				'/fake/path/feature-branch/.claude',
			);
			expect(statSync).toHaveBeenCalledWith(
				'/fake/path/feature-branch/.claude',
			);
		});

		it('should return Effect with false when .claude directory does not exist', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/feature-branch
HEAD efgh5678
branch refs/heads/feature-branch
`;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			mockedExistsSync.mockReturnValue(false);

			const effect = service.hasClaudeDirectoryInBranchEffect('feature-branch');
			const result = await Effect.runPromise(effect);

			expect(result).toBe(false);
			expect(existsSync).toHaveBeenCalledWith(
				'/fake/path/feature-branch/.claude',
			);
		});

		it('should return Effect with false when .claude exists but is not a directory', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/feature-branch
HEAD efgh5678
branch refs/heads/feature-branch
`;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			mockedExistsSync.mockReturnValue(true);
			mockedStatSync.mockImplementation(
				() =>
					({
						isDirectory: () => false,
					}) as Stats,
			);

			const effect = service.hasClaudeDirectoryInBranchEffect('feature-branch');
			const result = await Effect.runPromise(effect);

			expect(result).toBe(false);
		});

		it('should fallback to default branch when branch worktree not found', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main
`;
					}
					if (cmd.includes('symbolic-ref')) {
						return 'main\n';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			mockedExistsSync.mockReturnValue(true);
			mockedStatSync.mockImplementation(
				() =>
					({
						isDirectory: () => true,
					}) as Stats,
			);

			// When asking for main branch that doesn't have a separate worktree
			const effect = service.hasClaudeDirectoryInBranchEffect('main');
			const result = await Effect.runPromise(effect);

			expect(result).toBe(true);
			expect(existsSync).toHaveBeenCalledWith('/fake/path/.claude');
		});

		it('should return Effect with false when branch not found in any worktree', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main
`;
					}
					if (cmd.includes('symbolic-ref')) {
						return 'main\n';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.hasClaudeDirectoryInBranchEffect(
				'non-existent-branch',
			);
			const result = await Effect.runPromise(effect);

			expect(result).toBe(false);
		});

		it('should check main worktree when branch is default branch', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/other-branch
HEAD efgh5678
branch refs/heads/other-branch
`;
					}
					if (cmd.includes('symbolic-ref')) {
						return 'main\n';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			mockedExistsSync.mockReturnValue(true);
			mockedStatSync.mockImplementation(
				() =>
					({
						isDirectory: () => true,
					}) as Stats,
			);

			const effect = service.hasClaudeDirectoryInBranchEffect('main');
			const result = await Effect.runPromise(effect);

			expect(result).toBe(true);
			expect(existsSync).toHaveBeenCalledWith('/fake/path/.claude');
		});
	});

	describe('Effect-based getWorktrees', () => {
		it('should return Effect with worktree array on success', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/feature
HEAD efgh5678
branch refs/heads/feature
`;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getWorktreesEffect();
			const result = await Effect.runPromise(effect);

			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({
				path: '/fake/path',
				branch: 'main',
				isMainWorktree: true,
			});
			expect(result[1]).toMatchObject({
				path: '/fake/path/feature',
				branch: 'feature',
				isMainWorktree: false,
			});
		});

		it('should return Effect that fails with GitError when git command fails', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						const error: MockGitError = new Error(
							'fatal: not a git repository',
						);
						error.status = 128;
						error.stderr = 'fatal: not a git repository';
						throw error;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getWorktreesEffect();
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				expect(result.left).toBeInstanceOf(GitError);
				expect(result.left.command).toBe('git worktree list --porcelain');
				expect(result.left.exitCode).toBe(128);
				expect(result.left.stderr).toContain('not a git repository');
			} else {
				expect.fail('Should have returned Left with GitError');
			}
		});

		it('should fallback to single worktree when git worktree command not supported', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						const error: MockGitError = new Error('unknown command: worktree');
						error.status = 1;
						error.stderr = 'unknown command: worktree';
						throw error;
					}
					if (cmd === 'git rev-parse --abbrev-ref HEAD') {
						return 'main\n';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.getWorktreesEffect();
			const result = await Effect.runPromise(effect);

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				path: '/fake/path',
				branch: 'main',
				isMainWorktree: true,
			});
		});
	});

	describe('Effect-based createWorktree', () => {
		it('should return Effect with Worktree on success', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('rev-parse --verify')) {
						throw new Error('Branch not found');
					}
					if (cmd.includes('git worktree add')) {
						return '';
					}
				}
				return '';
			});

			const effect = service.createWorktreeEffect(
				'/path/to/worktree',
				'new-feature',
				'main',
			);
			const result = await Effect.runPromise(effect);

			expect(result).toMatchObject({
				path: '/path/to/worktree',
				branch: 'new-feature',
				isMainWorktree: false,
			});
		});

		it('should return Effect that fails with GitError on git command failure', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('rev-parse --verify')) {
						throw new Error('Branch not found');
					}
					if (cmd.includes('git worktree add')) {
						const error: MockGitError = new Error(
							'fatal: invalid reference: main',
						);
						error.status = 128;
						error.stderr = 'fatal: invalid reference: main';
						throw error;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.createWorktreeEffect(
				'/path/to/worktree',
				'new-feature',
				'main',
			);
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				expect(result.left).toBeInstanceOf(GitError);
				expect((result.left as GitError).exitCode).toBe(128);
				expect((result.left as GitError).stderr).toContain('invalid reference');
			} else {
				expect.fail('Should have returned Left with GitError');
			}
		});
	});

	describe('Effect-based deleteWorktree', () => {
		it('should return Effect with void on success', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/feature
HEAD efgh5678
branch refs/heads/feature
`;
					}
					if (cmd.includes('git worktree remove')) {
						return '';
					}
					if (cmd.includes('git branch -D')) {
						return '';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.deleteWorktreeEffect('/fake/path/feature');
			await Effect.runPromise(effect);

			expect(execSync).toHaveBeenCalledWith(
				expect.stringContaining('git worktree remove'),
				expect.any(Object),
			);
		});

		it('should return Effect that fails with GitError when worktree not found', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main
`;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.deleteWorktreeEffect('/fake/path/nonexistent');
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				expect(result.left).toBeInstanceOf(GitError);
				expect(result.left.stderr).toContain('Worktree not found');
			} else {
				expect.fail('Should have returned Left with GitError');
			}
		});

		it('should return Effect that fails with GitError when trying to delete main worktree', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main
`;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.deleteWorktreeEffect('/fake/path');
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				expect(result.left).toBeInstanceOf(GitError);
				expect(result.left.stderr).toContain('Cannot delete the main worktree');
			} else {
				expect.fail('Should have returned Left with GitError');
			}
		});
	});

	describe('Effect-based mergeWorktree', () => {
		it('should return Effect with void on successful merge', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/feature
HEAD efgh5678
branch refs/heads/feature
`;
					}
					if (cmd.includes('git merge')) {
						return 'Merge successful';
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.mergeWorktreeEffect('feature', 'main', false);
			await Effect.runPromise(effect);

			expect(execSync).toHaveBeenCalledWith(
				'git merge --no-ff "feature"',
				expect.any(Object),
			);
		});

		it('should return Effect that fails with GitError when target branch not found', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main
`;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.mergeWorktreeEffect(
				'feature',
				'nonexistent',
				false,
			);
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				expect(result.left).toBeInstanceOf(GitError);
				expect(result.left.stderr).toContain(
					'Target branch worktree not found',
				);
			} else {
				expect.fail('Should have returned Left with GitError');
			}
		});

		it('should return Effect that fails with GitError on merge conflict', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd === 'git worktree list --porcelain') {
						return `worktree /fake/path
HEAD abcd1234
branch refs/heads/main

worktree /fake/path/feature
HEAD efgh5678
branch refs/heads/feature
`;
					}
					if (cmd.includes('git merge')) {
						const error: MockGitError = new Error('CONFLICT: Merge conflict');
						error.status = 1;
						error.stderr = 'CONFLICT: Merge conflict in file.txt';
						throw error;
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const effect = service.mergeWorktreeEffect('feature', 'main', false);
			const result = await Effect.runPromise(Effect.either(effect));

			if (result._tag === 'Left') {
				expect(result.left).toBeInstanceOf(GitError);
				expect(result.left.exitCode).toBe(1);
				expect(result.left.stderr).toContain('Merge conflict');
			} else {
				expect.fail('Should have returned Left with GitError');
			}
		});
	});
});
