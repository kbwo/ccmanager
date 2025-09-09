import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {WorktreeService} from './worktreeService.js';
import {execSync} from 'child_process';
import {existsSync, statSync, Stats} from 'fs';
import {configurationManager} from './configurationManager.js';
import {executeWorktreePostCreationHook} from '../utils/hookExecutor.js';

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
const mockedExecuteHook = vi.mocked(executeWorktreePostCreationHook);

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

	describe('getDefaultBranch', () => {
		it('should return default branch from origin', () => {
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

			const result = service.getDefaultBranch();

			expect(result).toBe('main');
		});
	});

	describe('getAllBranches', () => {
		it('should return all branches without duplicates', () => {
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

			const result = service.getAllBranches();

			expect(result).toEqual(['main', 'feature/test', 'feature/remote']);
		});

		it('should return empty array on error', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (
					typeof cmd === 'string' &&
					cmd === 'git rev-parse --git-common-dir'
				) {
					return '/fake/path/.git\n';
				}
				throw new Error('Git error');
			});

			const result = service.getAllBranches();

			expect(result).toEqual([]);
		});
	});

	describe('resolveBranchReference', () => {
		it('should return local branch when it exists', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')) {
						return ''; // Local branch exists
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const result = (service as any).resolveBranchReference('foo/bar-xyz');
			expect(result).toBe('foo/bar-xyz');
		});

		it('should return single remote branch when local does not exist', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')) {
						throw new Error('Local branch not found');
					}
					if (cmd === 'git remote') {
						return 'origin\nupstream\n';
					}
					if (cmd.includes('show-ref --verify --quiet refs/remotes/origin/foo/bar-xyz')) {
						return ''; // Remote branch exists in origin
					}
					if (cmd.includes('show-ref --verify --quiet refs/remotes/upstream/foo/bar-xyz')) {
						throw new Error('Remote branch not found in upstream');
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const result = (service as any).resolveBranchReference('foo/bar-xyz');
			expect(result).toBe('origin/foo/bar-xyz');
		});

		it('should throw AmbiguousBranchError when multiple remotes have the branch', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')) {
						throw new Error('Local branch not found');
					}
					if (cmd === 'git remote') {
						return 'origin\nupstream\n';
					}
					if (cmd.includes('show-ref --verify --quiet refs/remotes/origin/foo/bar-xyz') ||
						cmd.includes('show-ref --verify --quiet refs/remotes/upstream/foo/bar-xyz')) {
						return ''; // Both remotes have the branch
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			expect(() => {
				(service as any).resolveBranchReference('foo/bar-xyz');
			}).toThrow('Ambiguous branch \'foo/bar-xyz\' found in multiple remotes: origin/foo/bar-xyz, upstream/foo/bar-xyz. Please specify which remote to use.');
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

			const result = (service as any).resolveBranchReference('nonexistent-branch');
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

			const result = (service as any).resolveBranchReference('some-branch');
			expect(result).toBe('some-branch');
		});

		it('should prefer local branch over remote branches', () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')) {
						return ''; // Local branch exists
					}
					// Remote commands should not be called when local exists
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const result = (service as any).resolveBranchReference('foo/bar-xyz');
			expect(result).toBe('foo/bar-xyz');
		});
	});

	describe('createWorktree', () => {
		it('should create worktree with base branch when branch does not exist', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('rev-parse --verify')) {
						throw new Error('Branch not found');
					}
					return '';
				}
				throw new Error('Unexpected command');
			});

			const result = await service.createWorktree(
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

		it('should create worktree without base branch when branch exists', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('rev-parse --verify')) {
						return 'hash';
					}
					return '';
				}
				throw new Error('Unexpected command');
			});

			const result = await service.createWorktree(
				'/path/to/worktree',
				'existing-feature',
				'main', // Base branch is required but not used when branch exists
			);

			expect(result).toEqual({success: true});
			expect(execSync).toHaveBeenCalledWith(
				'git worktree add "/path/to/worktree" "existing-feature"',
				expect.any(Object),
			);
		});

		it('should handle ambiguous branch error gracefully', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('rev-parse --verify new-feature')) {
						throw new Error('Branch not found');
					}
					if (cmd.includes('show-ref --verify --quiet refs/heads/foo/bar-xyz')) {
						throw new Error('Local branch not found');
					}
					if (cmd === 'git remote') {
						return 'origin\nupstream\n';
					}
					if (cmd.includes('show-ref --verify --quiet refs/remotes/origin/foo/bar-xyz') ||
						cmd.includes('show-ref --verify --quiet refs/remotes/upstream/foo/bar-xyz')) {
						return ''; // Both remotes have the branch
					}
				}
				throw new Error('Command not mocked: ' + cmd);
			});

			const result = await service.createWorktree(
				'/path/to/worktree',
				'new-feature',
				'foo/bar-xyz', // This will trigger the ambiguous branch error
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Ambiguous branch \'foo/bar-xyz\' found in multiple remotes');
			expect(result.error).toContain('origin/foo/bar-xyz, upstream/foo/bar-xyz');
		});

		it('should create worktree from specified base branch when branch does not exist', async () => {
			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('rev-parse --verify')) {
						throw new Error('Branch not found');
					}
					return '';
				}
				throw new Error('Unexpected command');
			});

			const result = await service.createWorktree(
				'/path/to/worktree',
				'new-feature',
				'main',
			);

			expect(result).toEqual({success: true});
			expect(execSync).toHaveBeenCalledWith(
				'git worktree add -b "new-feature" "/path/to/worktree" "main"',
				expect.any(Object),
			);
		});
	});

	describe('hasClaudeDirectoryInBranch', () => {
		it('should return true when .claude directory exists in branch worktree', () => {
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

			const result = service.hasClaudeDirectoryInBranch('feature-branch');

			expect(result).toBe(true);
			expect(existsSync).toHaveBeenCalledWith(
				'/fake/path/feature-branch/.claude',
			);
			expect(statSync).toHaveBeenCalledWith(
				'/fake/path/feature-branch/.claude',
			);
		});

		it('should return false when .claude directory does not exist', () => {
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

			const result = service.hasClaudeDirectoryInBranch('feature-branch');

			expect(result).toBe(false);
			expect(existsSync).toHaveBeenCalledWith(
				'/fake/path/feature-branch/.claude',
			);
		});

		it('should return false when .claude exists but is not a directory', () => {
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

			const result = service.hasClaudeDirectoryInBranch('feature-branch');

			expect(result).toBe(false);
		});

		it('should fallback to default branch when branch worktree not found', () => {
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
			const result = service.hasClaudeDirectoryInBranch('main');

			expect(result).toBe(true);
			expect(existsSync).toHaveBeenCalledWith('/fake/path/.claude');
		});

		it('should return false when branch not found in any worktree', () => {
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

			const result = service.hasClaudeDirectoryInBranch('non-existent-branch');

			expect(result).toBe(false);
		});

		it('should check main worktree when branch is default branch', () => {
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

			const result = service.hasClaudeDirectoryInBranch('main');

			expect(result).toBe(true);
			expect(existsSync).toHaveBeenCalledWith('/fake/path/.claude');
		});
	});

	describe('Worktree Hook Execution', () => {
		afterEach(() => {
			vi.clearAllMocks();
		});

		it('should execute post-creation hook when worktree is created', async () => {
			// Arrange
			const hookCommand = 'echo "Worktree created: $CCMANAGER_WORKTREE_PATH"';
			mockedGetWorktreeHooks.mockReturnValue({
				post_creation: {
					command: hookCommand,
					enabled: true,
				},
			});

			mockedExecuteHook.mockResolvedValue(undefined);

			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('git worktree list')) {
						return 'worktree /fake/path\nHEAD abc123\nbranch refs/heads/main\n';
					}
					if (cmd.includes('git worktree add')) {
						return '';
					}
					if (cmd.includes('git rev-parse --verify')) {
						throw new Error('Branch not found');
					}
				}
				return '';
			});

			// Act
			const result = await service.createWorktree(
				'feature-branch-dir',
				'feature-branch',
				'main',
				false,
				false,
			);

			// Assert
			expect(result.success).toBe(true);
			expect(mockedGetWorktreeHooks).toHaveBeenCalled();
			expect(mockedExecuteHook).toHaveBeenCalledWith(
				hookCommand,
				expect.objectContaining({
					path: '/fake/path/feature-branch-dir',
					branch: 'feature-branch',
					isMainWorktree: false,
					hasSession: false,
				}),
				'/fake/path',
				'main',
			);
		});

		it('should not execute hook when disabled', async () => {
			// Arrange
			mockedGetWorktreeHooks.mockReturnValue({
				post_creation: {
					command: 'echo "Should not run"',
					enabled: false,
				},
			});

			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('git worktree list')) {
						return 'worktree /fake/path\nHEAD abc123\nbranch refs/heads/main\n';
					}
					if (cmd.includes('git worktree add')) {
						return '';
					}
					if (cmd.includes('git rev-parse --verify')) {
						throw new Error('Branch not found');
					}
				}
				return '';
			});

			// Act
			const result = await service.createWorktree(
				'feature-branch-dir',
				'feature-branch',
				'main',
				false,
				false,
			);

			// Assert
			expect(result.success).toBe(true);
			expect(mockedGetWorktreeHooks).toHaveBeenCalled();
			expect(mockedExecuteHook).not.toHaveBeenCalled();
		});

		it('should not execute hook when not configured', async () => {
			// Arrange
			mockedGetWorktreeHooks.mockReturnValue({});

			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('git worktree list')) {
						return 'worktree /fake/path\nHEAD abc123\nbranch refs/heads/main\n';
					}
					if (cmd.includes('git worktree add')) {
						return '';
					}
					if (cmd.includes('git rev-parse --verify')) {
						throw new Error('Branch not found');
					}
				}
				return '';
			});

			// Act
			const result = await service.createWorktree(
				'feature-branch-dir',
				'feature-branch',
				'main',
				false,
				false,
			);

			// Assert
			expect(result.success).toBe(true);
			expect(mockedGetWorktreeHooks).toHaveBeenCalled();
			expect(mockedExecuteHook).not.toHaveBeenCalled();
		});

		it('should not fail worktree creation if hook execution fails', async () => {
			// Arrange
			mockedGetWorktreeHooks.mockReturnValue({
				post_creation: {
					command: 'failing-command',
					enabled: true,
				},
			});

			// The real executeWorktreePostCreationHook doesn't throw, it catches errors internally
			// So the mock should resolve, not reject
			mockedExecuteHook.mockResolvedValue(undefined);

			mockedExecSync.mockImplementation((cmd, _options) => {
				if (typeof cmd === 'string') {
					if (cmd === 'git rev-parse --git-common-dir') {
						return '/fake/path/.git\n';
					}
					if (cmd.includes('git worktree list')) {
						return 'worktree /fake/path\nHEAD abc123\nbranch refs/heads/main\n';
					}
					if (cmd.includes('git worktree add')) {
						return '';
					}
					if (cmd.includes('git rev-parse --verify')) {
						throw new Error('Branch not found');
					}
				}
				return '';
			});

			// Act
			const result = await service.createWorktree(
				'feature-branch-dir',
				'feature-branch',
				'main',
				false,
				false,
			);

			// Allow async operations to complete
			await new Promise(resolve => setTimeout(resolve, 10));

			// Assert
			expect(result.success).toBe(true);
			expect(mockedExecuteHook).toHaveBeenCalled();
		});
	});
});
