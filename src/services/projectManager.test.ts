import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules before any other imports that might use them
vi.mock('fs');
vi.mock('os', () => ({
	homedir: vi.fn(() => '/home/user'),
	platform: vi.fn(() => 'linux'),
}));

// Now import modules that depend on the mocked modules
import {ProjectManager} from './projectManager.js';
import {ENV_VARS} from '../constants/env.js';
import {GitProject} from '../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFs = fs as any;

describe('ProjectManager', () => {
	let projectManager: ProjectManager;
	const mockProjectsDir = '/home/user/projects';
	const mockConfigDir = '/home/user/.config/ccmanager';
	const mockRecentProjectsPath =
		'/home/user/.config/ccmanager/recent-projects.json';

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset environment variables
		delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];

		// Mock fs methods for config directory
		mockFs.existsSync.mockImplementation((path: string) => {
			if (path === mockConfigDir) return true;
			if (path === mockRecentProjectsPath) return false;
			return false;
		});
		mockFs.mkdirSync.mockImplementation(() => {});
		mockFs.readFileSync.mockImplementation(() => '[]');
		mockFs.writeFileSync.mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('initialization', () => {
		it('should initialize in normal mode when no multi-project root is set', () => {
			projectManager = new ProjectManager();
			expect(projectManager.currentMode).toBe('normal');
			expect(projectManager.currentProject).toBeUndefined();
			expect(projectManager.projects).toEqual([]);
		});

		it('should initialize in multi-project mode when multi-project root is set', () => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = mockProjectsDir;
			projectManager = new ProjectManager();
			expect(projectManager.currentMode).toBe('multi-project');
		});
	});

	describe('project discovery', () => {
		beforeEach(() => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = mockProjectsDir;
			projectManager = new ProjectManager();
		});

		it('should discover git projects in the projects directory', async () => {
			// Mock file system for project discovery
			mockFs.promises = {
				access: vi.fn().mockResolvedValue(undefined),
				readdir: vi.fn().mockImplementation((dir: string) => {
					if (dir === mockProjectsDir) {
						return Promise.resolve([
							{name: 'project1', isDirectory: () => true},
							{name: 'project2', isDirectory: () => true},
							{name: 'not-a-project.txt', isDirectory: () => false},
						]);
					}
					return Promise.resolve([]);
				}),
				stat: vi.fn().mockImplementation((path: string) => {
					if (path.endsWith('.git')) {
						return Promise.resolve({
							isDirectory: () => true,
							isFile: () => false,
						});
					}
					throw new Error('Not found');
				}),
			};

			await projectManager.refreshProjects();

			expect(projectManager.projects).toHaveLength(2);
			expect(projectManager.projects[0]).toMatchObject({
				name: 'project1',
				path: path.join(mockProjectsDir, 'project1'),
				isValid: true,
			});
			expect(projectManager.projects[1]).toMatchObject({
				name: 'project2',
				path: path.join(mockProjectsDir, 'project2'),
				isValid: true,
			});
		});

		it('should handle projects directory not existing', async () => {
			mockFs.promises = {
				access: vi.fn().mockRejectedValue({code: 'ENOENT'}),
			};

			await expect(projectManager.refreshProjects()).rejects.toThrow(
				`Projects directory does not exist: ${mockProjectsDir}`,
			);
		});
	});

	describe('recent projects', () => {
		beforeEach(() => {
			projectManager = new ProjectManager();
		});

		it('should get recent projects with default limit', () => {
			const mockRecentProjects = [
				{path: '/path/to/project1', name: 'project1', lastAccessed: Date.now()},
				{
					path: '/path/to/project2',
					name: 'project2',
					lastAccessed: Date.now() - 1000,
				},
				{
					path: '/path/to/project3',
					name: 'project3',
					lastAccessed: Date.now() - 2000,
				},
				{
					path: '/path/to/project4',
					name: 'project4',
					lastAccessed: Date.now() - 3000,
				},
				{
					path: '/path/to/project5',
					name: 'project5',
					lastAccessed: Date.now() - 4000,
				},
				{
					path: '/path/to/project6',
					name: 'project6',
					lastAccessed: Date.now() - 5000,
				},
			];

			mockFs.readFileSync.mockReturnValue(JSON.stringify(mockRecentProjects));
			mockFs.existsSync.mockReturnValue(true);

			// Re-create to load recent projects
			projectManager = new ProjectManager();
			const recent = projectManager.getRecentProjects();

			expect(recent).toHaveLength(5); // Default limit
			expect(recent[0]?.name).toBe('project1');
			expect(recent[4]?.name).toBe('project5');
		});

		it('should get recent projects with custom limit', () => {
			const mockRecentProjects = [
				{path: '/path/to/project1', name: 'project1', lastAccessed: Date.now()},
				{
					path: '/path/to/project2',
					name: 'project2',
					lastAccessed: Date.now() - 1000,
				},
				{
					path: '/path/to/project3',
					name: 'project3',
					lastAccessed: Date.now() - 2000,
				},
			];

			mockFs.readFileSync.mockReturnValue(JSON.stringify(mockRecentProjects));
			mockFs.existsSync.mockReturnValue(true);

			projectManager = new ProjectManager();
			const recent = projectManager.getRecentProjects(2);

			expect(recent).toHaveLength(2);
		});

		it('should add a recent project', () => {
			const project: GitProject = {
				name: 'test-project',
				path: '/path/to/test-project',
				relativePath: 'test-project',
				isValid: true,
			};

			projectManager.addRecentProject(project);

			expect(mockFs.writeFileSync).toHaveBeenCalled();
			const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1]);
			expect(writtenData).toHaveLength(1);
			expect(writtenData[0]).toMatchObject({
				path: project.path,
				name: project.name,
			});
		});

		it('should update existing recent project', () => {
			const existingProject = {
				path: '/path/to/project1',
				name: 'project1',
				lastAccessed: Date.now() - 10000,
			};

			mockFs.readFileSync.mockReturnValue(JSON.stringify([existingProject]));
			mockFs.existsSync.mockReturnValue(true);

			projectManager = new ProjectManager();

			const updatedProject: GitProject = {
				name: 'project1',
				path: '/path/to/project1',
				relativePath: 'project1',
				isValid: true,
			};

			projectManager.addRecentProject(updatedProject);

			const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1]);
			expect(writtenData).toHaveLength(1);
			expect(writtenData[0].lastAccessed).toBeGreaterThan(
				existingProject.lastAccessed,
			);
		});

		it('should not add EXIT_APPLICATION to recent projects', () => {
			const exitProject: GitProject = {
				name: 'Exit',
				path: 'EXIT_APPLICATION',
				relativePath: '',
				isValid: true,
			};

			projectManager.addRecentProject(exitProject);

			expect(mockFs.writeFileSync).not.toHaveBeenCalled();
		});

		it('should clear recent projects', () => {
			projectManager.clearRecentProjects();

			expect(mockFs.writeFileSync).toHaveBeenCalledWith(
				mockRecentProjectsPath,
				JSON.stringify([], null, 2),
			);
		});
	});

	describe('mode management', () => {
		beforeEach(() => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = mockProjectsDir;
			projectManager = new ProjectManager();
		});

		it('should set mode correctly', () => {
			projectManager.setMode('normal');
			expect(projectManager.currentMode).toBe('normal');

			projectManager.setMode('multi-project');
			expect(projectManager.currentMode).toBe('multi-project');
		});

		it('should clear current project when switching to normal mode', () => {
			const project: GitProject = {
				name: 'test',
				path: '/test',
				relativePath: 'test',
				isValid: true,
			};

			projectManager.selectProject(project);
			expect(projectManager.currentProject).toBe(project);

			projectManager.setMode('normal');
			expect(projectManager.currentProject).toBeUndefined();
		});
	});

	describe('project selection', () => {
		beforeEach(() => {
			projectManager = new ProjectManager();
		});

		it('should select a project', () => {
			const project: GitProject = {
				name: 'test',
				path: '/test',
				relativePath: 'test',
				isValid: true,
			};

			projectManager.selectProject(project);
			expect(projectManager.currentProject).toBe(project);
		});
	});

	describe('worktree service management', () => {
		beforeEach(() => {
			projectManager = new ProjectManager();
		});

		it('should get worktree service for current project', () => {
			const project: GitProject = {
				name: 'test',
				path: '/test/project',
				relativePath: 'test',
				isValid: true,
			};

			projectManager.selectProject(project);
			const service = projectManager.getWorktreeService();

			expect(service).toBeDefined();
			expect(service.getGitRootPath()).toBe('/test/project');
		});

		it('should cache worktree services', () => {
			const service1 = projectManager.getWorktreeService('/test/path1');
			const service2 = projectManager.getWorktreeService('/test/path1');

			expect(service1).toBe(service2);
		});

		it('should clear worktree service cache', () => {
			projectManager.getWorktreeService('/test/path1');
			projectManager.getWorktreeService('/test/path2');

			projectManager.clearWorktreeServiceCache('/test/path1');

			const cachedServices = projectManager.getCachedServices();
			expect(cachedServices.size).toBe(1);
			expect(cachedServices.has('/test/path2')).toBe(true);
		});

		it('should clear all worktree service cache', () => {
			projectManager.getWorktreeService('/test/path1');
			projectManager.getWorktreeService('/test/path2');

			projectManager.clearWorktreeServiceCache();

			const cachedServices = projectManager.getCachedServices();
			expect(cachedServices.size).toBe(0);
		});
	});

	describe('helper methods', () => {
		beforeEach(() => {
			projectManager = new ProjectManager();
		});

		it('should check if multi-project is enabled', () => {
			expect(projectManager.isMultiProjectEnabled()).toBe(false);

			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = mockProjectsDir;
			projectManager = new ProjectManager();

			expect(projectManager.isMultiProjectEnabled()).toBe(true);
		});

		it('should get projects directory', () => {
			expect(projectManager.getProjectsDir()).toBeUndefined();

			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = mockProjectsDir;
			projectManager = new ProjectManager();

			expect(projectManager.getProjectsDir()).toBe(mockProjectsDir);
		});

		it('should get current project path', () => {
			const cwd = process.cwd();
			expect(projectManager.getCurrentProjectPath()).toBe(cwd);

			const project: GitProject = {
				name: 'test',
				path: '/test/project',
				relativePath: 'test',
				isValid: true,
			};

			projectManager.selectProject(project);
			expect(projectManager.getCurrentProjectPath()).toBe('/test/project');
		});
	});

	describe('project validation', () => {
		beforeEach(() => {
			projectManager = new ProjectManager();
		});

		it('should validate a git repository', async () => {
			mockFs.promises = {
				stat: vi.fn().mockResolvedValue({
					isDirectory: () => true,
					isFile: () => false,
				}),
			};

			const isValid = await projectManager.validateGitRepository('/test/repo');
			expect(isValid).toBe(true);
		});

		it('should invalidate non-git repository', async () => {
			mockFs.promises = {
				stat: vi.fn().mockRejectedValue(new Error('Not found')),
			};

			const isValid =
				await projectManager.validateGitRepository('/test/not-repo');
			expect(isValid).toBe(false);
		});
	});
});
