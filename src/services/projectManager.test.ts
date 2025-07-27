import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {ProjectManager} from './projectManager.js';
import {WorktreeService} from './worktreeService.js';
import {MultiProjectService} from './multiProjectService.js';
import {GitProject} from '../types/index.js';
import {ENV_VARS} from '../constants/env.js';

vi.mock('./worktreeService.js');
vi.mock('./multiProjectService.js');

describe('ProjectManager', () => {
	let projectManager: ProjectManager;
	const originalEnv = process.env;

	beforeEach(() => {
		// Reset environment
		process.env = {...originalEnv};
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetAllMocks();
	});

	describe('initialization', () => {
		it('should initialize in normal mode when no env vars are set', () => {
			delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];
			delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];

			projectManager = new ProjectManager();

			expect(projectManager.currentMode).toBe('normal');
			expect(projectManager.currentProject).toBeUndefined();
			expect(projectManager.projects).toEqual([]);
		});

		it('should initialize in multi-project mode when env vars are set', () => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = 'true';
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/home/user/projects';

			projectManager = new ProjectManager();

			expect(projectManager.currentMode).toBe('multi-project');
		});

		it('should fall back to normal mode if PROJECTS_DIR is not set', () => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = 'true';
			delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];

			projectManager = new ProjectManager();

			expect(projectManager.currentMode).toBe('normal');
		});
	});

	describe('mode switching', () => {
		beforeEach(() => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = 'true';
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/home/user/projects';
			projectManager = new ProjectManager();
		});

		it('should switch between modes', () => {
			projectManager.setMode('normal');
			expect(projectManager.currentMode).toBe('normal');

			projectManager.setMode('multi-project');
			expect(projectManager.currentMode).toBe('multi-project');
		});

		it('should clear current project when switching to normal mode', () => {
			const mockProject: GitProject = {
				name: 'test-project',
				path: '/test/path',
				relativePath: 'test-project',
				isValid: true,
			};

			projectManager.selectProject(mockProject);
			expect(projectManager.currentProject).toBe(mockProject);

			projectManager.setMode('normal');
			expect(projectManager.currentProject).toBeUndefined();
		});
	});

	describe('project selection', () => {
		beforeEach(() => {
			projectManager = new ProjectManager();
		});

		it('should select a project', () => {
			const mockProject: GitProject = {
				name: 'test-project',
				path: '/test/path',
				relativePath: 'test-project',
				isValid: true,
			};

			projectManager.selectProject(mockProject);
			expect(projectManager.currentProject).toBe(mockProject);
		});
	});

	describe('getWorktreeService', () => {
		beforeEach(() => {
			projectManager = new ProjectManager();
			vi.mocked(WorktreeService).mockClear();
		});

		it('should create WorktreeService for specified path', () => {
			const path = '/test/project';
			const service = projectManager.getWorktreeService(path);

			expect(WorktreeService).toHaveBeenCalledWith(path);
			expect(service).toBeDefined();
		});

		it('should use current project path if no path specified', () => {
			const mockProject: GitProject = {
				name: 'test-project',
				path: '/test/project',
				relativePath: 'test-project',
				isValid: true,
			};

			projectManager.selectProject(mockProject);
			projectManager.getWorktreeService();

			expect(WorktreeService).toHaveBeenCalledWith('/test/project');
		});

		it('should use current directory if no project selected', () => {
			const originalCwd = process.cwd();
			projectManager.getWorktreeService();

			expect(WorktreeService).toHaveBeenCalledWith(originalCwd);
		});

		it('should cache WorktreeService instances', () => {
			const path = '/test/project';

			const service1 = projectManager.getWorktreeService(path);
			const service2 = projectManager.getWorktreeService(path);

			expect(service1).toBe(service2);
			expect(WorktreeService).toHaveBeenCalledTimes(1);
		});
	});

	describe('refreshProjects', () => {
		beforeEach(() => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = 'true';
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/home/user/projects';
			projectManager = new ProjectManager();
		});

		it('should refresh projects from MultiProjectService', async () => {
			const mockProjects: GitProject[] = [
				{
					name: 'project1',
					path: '/home/user/projects/project1',
					relativePath: 'project1',
					isValid: true,
				},
				{
					name: 'project2',
					path: '/home/user/projects/project2',
					relativePath: 'project2',
					isValid: true,
				},
			];

			vi.mocked(
				MultiProjectService.prototype.discoverProjects,
			).mockResolvedValue(mockProjects);

			await projectManager.refreshProjects();

			expect(projectManager.projects).toEqual(mockProjects);
			expect(
				MultiProjectService.prototype.discoverProjects,
			).toHaveBeenCalledWith('/home/user/projects');
		});

		it('should update current project if it still exists', async () => {
			const oldProject: GitProject = {
				name: 'project1',
				path: '/home/user/projects/project1',
				relativePath: 'project1',
				isValid: true,
			};

			const updatedProject: GitProject = {
				...oldProject,
			};

			projectManager.selectProject(oldProject);

			vi.mocked(
				MultiProjectService.prototype.discoverProjects,
			).mockResolvedValue([updatedProject]);

			await projectManager.refreshProjects();

			expect(projectManager.currentProject).toEqual(updatedProject);
		});

		it('should clear current project if it no longer exists', async () => {
			const project: GitProject = {
				name: 'project1',
				path: '/home/user/projects/project1',
				relativePath: 'project1',
				isValid: true,
			};

			projectManager.selectProject(project);

			vi.mocked(
				MultiProjectService.prototype.discoverProjects,
			).mockResolvedValue([]);

			await projectManager.refreshProjects();

			expect(projectManager.currentProject).toBeUndefined();
		});

		it('should throw error if projects directory not configured', async () => {
			delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];
			projectManager = new ProjectManager();

			await expect(projectManager.refreshProjects()).rejects.toThrow(
				'Projects directory not configured',
			);
		});
	});

	describe('helper methods', () => {
		it('should check if multi-project is enabled', () => {
			delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];
			projectManager = new ProjectManager();
			expect(projectManager.isMultiProjectEnabled()).toBe(false);

			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = 'true';
			projectManager = new ProjectManager();
			expect(projectManager.isMultiProjectEnabled()).toBe(true);
		});

		it('should get projects directory', () => {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/test/dir';
			projectManager = new ProjectManager();
			expect(projectManager.getProjectsDir()).toBe('/test/dir');

			delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];
			projectManager = new ProjectManager();
			expect(projectManager.getProjectsDir()).toBeUndefined();
		});

		it('should get current project path', () => {
			projectManager = new ProjectManager();
			const originalCwd = process.cwd();

			// No project selected
			expect(projectManager.getCurrentProjectPath()).toBe(originalCwd);

			// With project selected
			const project: GitProject = {
				name: 'test',
				path: '/test/path',
				relativePath: 'test',
				isValid: true,
			};
			projectManager.selectProject(project);
			expect(projectManager.getCurrentProjectPath()).toBe('/test/path');
		});

		it('should clear worktree service cache', () => {
			projectManager = new ProjectManager();

			// Create some cached services
			projectManager.getWorktreeService('/path1');
			projectManager.getWorktreeService('/path2');

			expect(projectManager.getCachedServices().size).toBe(2);

			// Clear specific path
			projectManager.clearWorktreeServiceCache('/path1');
			expect(projectManager.getCachedServices().size).toBe(1);
			expect(projectManager.getCachedServices().has('/path2')).toBe(true);

			// Clear all
			projectManager.clearWorktreeServiceCache();
			expect(projectManager.getCachedServices().size).toBe(0);
		});
	});
});
