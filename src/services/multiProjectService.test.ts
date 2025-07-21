import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {MultiProjectService} from './multiProjectService.js';
import {promises as fs} from 'fs';
import {execSync} from 'child_process';
import {WorktreeService} from './worktreeService.js';

vi.mock('fs', () => ({
	promises: {
		access: vi.fn(),
		readdir: vi.fn(),
	},
}));

vi.mock('child_process', () => ({
	execSync: vi.fn(),
}));

vi.mock('./worktreeService.js', () => ({
	WorktreeService: vi.fn().mockImplementation(() => ({
		getWorktrees: vi.fn().mockReturnValue([]),
	})),
}));

describe('MultiProjectService', () => {
	let service: MultiProjectService;

	beforeEach(() => {
		service = new MultiProjectService();
		vi.clearAllMocks();
		// Reset WorktreeService mock to default behavior
		vi.mocked(WorktreeService).mockImplementation(
			() =>
				({
					getWorktrees: vi.fn().mockReturnValue([]),
				}) as any,
		);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('discoverProjects', () => {
		it('should discover git repositories in the specified directory', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (
					path === mockProjectsDir ||
					path === `${mockProjectsDir}/project1/.git` ||
					path === `${mockProjectsDir}/project2/.git`
				) {
					return undefined;
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

			vi.mocked(execSync).mockImplementation((cmd, options) => {
				const cwd = (options as any).cwd;
				if (cwd.includes('project1') || cwd.includes('project2')) {
					return '.git';
				}
				throw new Error('Not a git repo');
			});

			const projects = await service.discoverProjects(mockProjectsDir);

			expect(projects).toHaveLength(2);
			expect(projects[0].name).toBe('project1');
			expect(projects[1].name).toBe('project2');
			expect(projects[0].isValid).toBe(true);
			expect(projects[1].isValid).toBe(true);
		});

		it('should handle name conflicts by using relative paths', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (
					path === mockProjectsDir ||
					path === `${mockProjectsDir}/frontend/app/.git` ||
					path === `${mockProjectsDir}/backend/app/.git`
				) {
					return undefined;
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

			vi.mocked(execSync).mockImplementation((cmd, options) => {
				const cwd = (options as any).cwd;
				if (cwd.includes('/app')) {
					return '.git';
				}
				throw new Error('Not a git repo');
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
				if (
					path === mockProjectsDir ||
					path === `${mockProjectsDir}/valid-repo/.git`
				) {
					return undefined;
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

			vi.mocked(execSync).mockImplementation((cmd, options) => {
				const cwd = (options as any).cwd;
				if (cwd.includes('valid-repo')) {
					return '.git';
				}
				throw new Error('Not a git repo');
			});

			// Override WorktreeService mock for this test
			vi.mocked(WorktreeService).mockImplementation(
				() =>
					({
						getWorktrees: vi.fn().mockImplementation(() => {
							throw new Error('Corrupted repository');
						}),
					}) as any,
			);

			const projects = await service.discoverProjects(mockProjectsDir);

			const validProject = projects.find(p => p.name === 'valid-repo');
			expect(validProject?.isValid).toBe(false);
			expect(validProject?.error).toContain('Failed to get worktrees');
		});

		it('should recursively scan subdirectories', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockImplementation(async path => {
				if (
					path === mockProjectsDir ||
					path === `${mockProjectsDir}/org1/repo1/.git` ||
					path === `${mockProjectsDir}/org2/repo2/.git`
				) {
					return undefined;
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

			vi.mocked(execSync).mockImplementation((cmd, options) => {
				const cwd = (options as any).cwd;
				if (cwd.includes('repo1') || cwd.includes('repo2')) {
					return '.git';
				}
				throw new Error('Not a git repo');
			});

			const projects = await service.discoverProjects(mockProjectsDir);

			expect(projects).toHaveLength(2);
			expect(projects.map(p => p.name).sort()).toEqual(['repo1', 'repo2']);
			expect(projects[0].relativePath).toMatch(/org\d\/repo\d/);
			expect(projects[1].relativePath).toMatch(/org\d\/repo\d/);
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

	describe('getProjectWorktrees', () => {
		it('should return worktrees from WorktreeService', async () => {
			const mockWorktrees = [
				{
					path: '/path/to/repo',
					branch: 'main',
					isMainWorktree: true,
					hasSession: false,
				},
			];

			const mockGetWorktrees = vi.fn().mockReturnValue(mockWorktrees);
			vi.mocked(WorktreeService).mockImplementation(
				() =>
					({
						getWorktrees: mockGetWorktrees,
					}) as any,
			);

			const worktrees = await service.getProjectWorktrees('/path/to/repo');
			expect(worktrees).toEqual(mockWorktrees);
		});

		it('should throw error when WorktreeService fails', async () => {
			const mockGetWorktrees = vi.fn().mockImplementation(() => {
				throw new Error('Failed to get worktrees');
			});
			vi.mocked(WorktreeService).mockImplementation(
				() =>
					({
						getWorktrees: mockGetWorktrees,
					}) as any,
			);

			await expect(
				service.getProjectWorktrees('/path/to/repo'),
			).rejects.toThrow('Failed to get worktrees');
		});
	});

	describe('caching', () => {
		it('should cache discovered projects', async () => {
			const mockProjectsDir = '/home/user/projects';

			vi.mocked(fs.access).mockResolvedValue(undefined);
			vi.mocked(fs.readdir).mockResolvedValue([
				{name: 'project1', isDirectory: () => true},
			] as any);
			vi.mocked(execSync).mockReturnValue('.git');

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
