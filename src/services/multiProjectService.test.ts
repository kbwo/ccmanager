import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {MultiProjectService} from './multiProjectService.js';
import {promises as fs} from 'fs';
import {execSync} from 'child_process';

vi.mock('fs', () => ({
	promises: {
		access: vi.fn(),
		readdir: vi.fn(),
		stat: vi.fn(),
	},
}));

vi.mock('child_process', () => ({
	execSync: vi.fn(),
}));

describe('MultiProjectService', () => {
	let service: MultiProjectService;

	beforeEach(() => {
		service = new MultiProjectService();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('discoverProjects', () => {
		it('should discover git repositories in the specified directory', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (path === mockProjectsDir) {
					return undefined;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.stat).mockImplementation(async path => {
				if (
					path === `${mockProjectsDir}/project1/.git` ||
					path === `${mockProjectsDir}/project2/.git`
				) {
					return {isDirectory: () => true, isFile: () => false} as any;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.readdir).mockImplementation(async dir => {
				if (dir === mockProjectsDir) {
					return [
						{name: 'project1', isDirectory: () => true},
						{name: 'project2', isDirectory: () => true},
						{name: 'not-a-repo', isDirectory: () => true},
						{name: 'file.txt', isDirectory: () => false},
					] as any;
				}
				return [];
			});

			vi.mocked(execSync).mockImplementation((cmd, _options) => {
				const cwd = (_options as any).cwd;
				if (cmd.includes('rev-parse --git-dir')) {
					if (cwd.includes('project1') || cwd.includes('project2')) {
						return '.git';
					}
					throw new Error('Not a git repo');
				}
				if (cmd.includes('worktree list')) {
					return 'worktree /path\nHEAD abc123\nbranch refs/heads/main';
				}
				throw new Error('Unknown command');
			});

			const projects = await service.discoverProjects(mockProjectsDir);

			expect(projects).toHaveLength(2);
			expect(projects[0]?.name).toBe('project1');
			expect(projects[1]?.name).toBe('project2');
			expect(projects[0]?.isValid).toBe(true);
			expect(projects[1]?.isValid).toBe(true);
		});

		it('should handle name conflicts by using relative paths', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (path === mockProjectsDir) {
					return undefined;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.stat).mockImplementation(async path => {
				if (
					path === `${mockProjectsDir}/frontend/app/.git` ||
					path === `${mockProjectsDir}/backend/app/.git`
				) {
					return {isDirectory: () => true, isFile: () => false} as any;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.readdir).mockImplementation(async dir => {
				if (dir === mockProjectsDir) {
					return [
						{name: 'frontend', isDirectory: () => true},
						{name: 'backend', isDirectory: () => true},
					] as any;
				}
				if (dir === `${mockProjectsDir}/frontend`) {
					return [{name: 'app', isDirectory: () => true}] as any;
				}
				if (dir === `${mockProjectsDir}/backend`) {
					return [{name: 'app', isDirectory: () => true}] as any;
				}
				return [];
			});

			vi.mocked(execSync).mockImplementation((cmd, _options) => {
				const cwd = (_options as any).cwd;
				if (cmd.includes('rev-parse --git-dir')) {
					if (cwd.includes('/app')) {
						return '.git';
					}
					throw new Error('Not a git repo');
				}
				if (cmd.includes('worktree list')) {
					return 'worktree /path\nHEAD abc123\nbranch refs/heads/main';
				}
				throw new Error('Unknown command');
			});

			const projects = await service.discoverProjects(mockProjectsDir);

			expect(projects).toHaveLength(2);
			// First 'app' keeps its name, second gets full path
			expect(projects.map(p => p.name)).toContain('app');
			expect(projects.map(p => p.name)).toContain('backend/app');
		});

		it('should throw error if projects directory does not exist', async () => {
			vi.mocked(fs.access).mockRejectedValue({code: 'ENOENT'});

			await expect(service.discoverProjects('/nonexistent')).rejects.toThrow(
				'Projects directory does not exist: /nonexistent',
			);
		});

		it('should handle corrupted git repositories gracefully', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (path === mockProjectsDir) {
					return undefined;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.stat).mockImplementation(async path => {
				if (path === `${mockProjectsDir}/valid-repo/.git`) {
					return {isDirectory: () => true, isFile: () => false} as any;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.readdir).mockImplementation(async dir => {
				if (dir === mockProjectsDir) {
					return [
						{name: 'valid-repo', isDirectory: () => true},
						{name: 'corrupted-repo', isDirectory: () => true},
					] as any;
				}
				return [];
			});

			vi.mocked(execSync).mockImplementation((cmd, _options) => {
				const cwd = (_options as any).cwd;
				if (cmd.includes('rev-parse --git-dir')) {
					if (cwd.includes('valid-repo')) {
						return '.git';
					}
					throw new Error('Not a git repo');
				}
				if (cmd.includes('worktree list')) {
					return 'worktree /path\nHEAD abc123\nbranch refs/heads/main';
				}
				throw new Error('Unknown command');
			});

			const projects = await service.discoverProjects(mockProjectsDir);

			// Valid repo should be included
			const validProject = projects.find(p => p.name === 'valid-repo');
			expect(validProject?.isValid).toBe(true);
		});

		it('should recursively scan subdirectories', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (path === mockProjectsDir) {
					return undefined;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.stat).mockImplementation(async path => {
				if (
					path === `${mockProjectsDir}/org1/repo1/.git` ||
					path === `${mockProjectsDir}/org2/repo2/.git`
				) {
					return {isDirectory: () => true, isFile: () => false} as any;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.readdir).mockImplementation(async dir => {
				if (dir === mockProjectsDir) {
					return [
						{name: 'org1', isDirectory: () => true},
						{name: 'org2', isDirectory: () => true},
					] as any;
				}
				if (dir === `${mockProjectsDir}/org1`) {
					return [{name: 'repo1', isDirectory: () => true}] as any;
				}
				if (dir === `${mockProjectsDir}/org2`) {
					return [{name: 'repo2', isDirectory: () => true}] as any;
				}
				return [];
			});

			vi.mocked(execSync).mockImplementation((cmd, _options) => {
				const cwd = (_options as any).cwd;
				if (cmd.includes('rev-parse --git-dir')) {
					if (cwd.includes('repo1') || cwd.includes('repo2')) {
						return '.git';
					}
					throw new Error('Not a git repo');
				}
				if (cmd.includes('worktree list')) {
					return 'worktree /path\nHEAD abc123\nbranch refs/heads/main';
				}
				throw new Error('Unknown command');
			});

			const projects = await service.discoverProjects(mockProjectsDir);

			expect(projects).toHaveLength(2);
			expect(projects.map(p => p.name).sort()).toEqual(['repo1', 'repo2']);
			expect(projects[0]?.relativePath).toMatch(/org\d\/repo\d/);
			expect(projects[1]?.relativePath).toMatch(/org\d\/repo\d/);
		});

		it('should skip projects that have worktrees', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (path === mockProjectsDir) {
					return undefined;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.stat).mockImplementation(async path => {
				if (
					path === `${mockProjectsDir}/project-with-worktrees/.git` ||
					path === `${mockProjectsDir}/project-without-worktrees/.git`
				) {
					return {isDirectory: () => true, isFile: () => false} as any;
				}
				throw new Error('Not found');
			});

			vi.mocked(fs.readdir).mockImplementation(async dir => {
				if (dir === mockProjectsDir) {
					return [
						{name: 'project-with-worktrees', isDirectory: () => true},
						{name: 'project-without-worktrees', isDirectory: () => true},
					] as any;
				}
				return [];
			});

			vi.mocked(execSync).mockImplementation((cmd, _options) => {
				const cwd = (_options as any).cwd;

				// git rev-parse --git-dir
				if (cmd.includes('--git-dir')) {
					if (
						cwd.includes('project-with-worktrees') ||
						cwd.includes('project-without-worktrees')
					) {
						return '.git';
					}
					throw new Error('Not a git repo');
				}

				// git worktree list --porcelain
				if (cmd.includes('worktree list')) {
					if (cwd.includes('project-with-worktrees')) {
						// Multiple worktrees
						return 'worktree /path/to/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /path/to/feature\nHEAD def456\nbranch refs/heads/feature';
					} else if (cwd.includes('project-without-worktrees')) {
						// Only main worktree
						return 'worktree /path/to/main\nHEAD abc123\nbranch refs/heads/main';
					}
				}

				throw new Error('Unknown command');
			});

			const projects = await service.discoverProjects(mockProjectsDir);

			expect(projects).toHaveLength(1);
			expect(projects[0]?.name).toBe('project-without-worktrees');
		});
	});

	describe('validateGitRepository', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it('should return true for valid git repository', async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(execSync).mockReturnValue('.git');

			const result = await service.validateGitRepository('/path/to/repo');
			expect(result).toBe(true);
		});

		it('should return true for bare repository', async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error('No .git'));

			vi.mocked(execSync).mockImplementation(cmd => {
				// Check which git command is being called
				if (cmd.includes('--git-dir')) {
					throw new Error('Not regular repo');
				} else if (cmd.includes('--is-bare-repository')) {
					return 'true';
				}
				throw new Error('Unknown command');
			});

			const result = await service.validateGitRepository('/path/to/bare-repo');
			expect(result).toBe(true);
		});

		it('should return false for non-git directory', async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error('No .git'));
			vi.mocked(execSync).mockImplementation(() => {
				throw new Error('Not a git repo');
			});

			const result = await service.validateGitRepository('/path/to/normal-dir');
			expect(result).toBe(false);
		});
	});

	describe('caching', () => {
		it('should cache discovered projects', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readdir).mockResolvedValue([
				{name: 'project1', isDirectory: () => true},
			] as any);
			vi.mocked(fs.stat).mockImplementation(async path => {
				if (path === `${mockProjectsDir}/project1/.git`) {
					return {isDirectory: () => true, isFile: () => false} as any;
				}
				throw new Error('Not found');
			});
			vi.mocked(execSync).mockImplementation((cmd, _options) => {
				if (cmd.includes('rev-parse --git-dir')) {
					return '.git';
				}
				if (cmd.includes('worktree list')) {
					return 'worktree /path\nHEAD abc123\nbranch refs/heads/main';
				}
				throw new Error('Unknown command');
			});

			await service.discoverProjects(mockProjectsDir);

			const cachedProject = service.getCachedProject(
				`${mockProjectsDir}/project1`,
			);
			expect(cachedProject).toBeDefined();
			expect(cachedProject?.name).toBe('project1');
		});

		it('should refresh single project', async () => {
			const projectPath = '/home/user/projects/myproject';

			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(execSync).mockReturnValue('.git');

			const refreshedProject = await service.refreshProject(projectPath);

			expect(refreshedProject).toBeDefined();
			expect(refreshedProject?.name).toBe('myproject');
			expect(refreshedProject?.isValid).toBe(true);

			// Should be cached
			const cachedProject = service.getCachedProject(projectPath);
			expect(cachedProject).toEqual(refreshedProject);
		});

		it('should remove invalid project from cache on refresh', async () => {
			const projectPath = '/home/user/projects/myproject';

			// First, add to cache - setup valid project
			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(execSync).mockReturnValue('.git');
			await service.refreshProject(projectPath);

			// Now make it invalid
			vi.mocked(fs.access).mockRejectedValue(new Error('No .git'));
			vi.mocked(execSync).mockImplementation(() => {
				throw new Error('Not a git repo');
			});

			const refreshedProject = await service.refreshProject(projectPath);

			expect(refreshedProject).toBeNull();
			expect(service.getCachedProject(projectPath)).toBeUndefined();
		});
	});
});
