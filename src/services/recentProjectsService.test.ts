import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {existsSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'fs';
import {join} from 'path';
import {
	RecentProjectsService,
	recentProjectsService,
} from './recentProjectsService.js';
import {GitProject} from '../types/index.js';

// Mock os module
vi.mock('os', () => ({
	homedir: vi.fn(),
}));

describe('RecentProjectsService', () => {
	let service: RecentProjectsService;
	let testConfigDir: string;
	let testDataPath: string;
	const testDir = join(process.cwd(), '.test-config-recent');

	beforeEach(async () => {
		// Reset singleton for testing
		recentProjectsService._resetForTesting();

		// Mock os.homedir to return test directory
		const os = await import('os');
		vi.mocked(os.homedir).mockReturnValue(testDir);

		testConfigDir =
			process.platform === 'win32'
				? join(testDir, 'AppData', 'Roaming', 'ccmanager')
				: join(testDir, '.config', 'ccmanager');

		testDataPath = join(testConfigDir, 'recent-projects.json');

		// Clean up any existing test directory
		if (existsSync(testDir)) {
			rmSync(testDir, {recursive: true, force: true});
		}

		// Create the service (this will create the directory)
		service = new RecentProjectsService();
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, {recursive: true, force: true});
		}
		vi.restoreAllMocks();
	});

	describe('getRecentProjects', () => {
		it('should return empty array when no projects added', () => {
			const result = service.getRecentProjects();

			expect(result).toEqual([]);
		});

		it('should return all added projects', () => {
			// Add projects directly
			service.addRecentProject({
				path: '/project1',
				name: 'Project 1',
				relativePath: 'project1',
				isValid: true,
			});
			service.addRecentProject({
				path: '/project2',
				name: 'Project 2',
				relativePath: 'project2',
				isValid: true,
			});
			service.addRecentProject({
				path: '/non-existing',
				name: 'Non Existing',
				relativePath: 'non-existing',
				isValid: true,
			});

			const result = service.getRecentProjects();

			expect(result).toHaveLength(3);
			expect(result[0]?.path).toBe('/non-existing');
			expect(result[1]?.path).toBe('/project2');
			expect(result[2]?.path).toBe('/project1');
		});

		it('should limit to max recent projects by default', () => {
			// Add 10 projects
			for (let i = 0; i < 10; i++) {
				service.addRecentProject({
					path: `/project${i}`,
					name: `Project ${i}`,
					relativePath: `project${i}`,
					isValid: true,
				});
			}

			// Default behavior should limit to 5
			const result = service.getRecentProjects();
			expect(result).toHaveLength(5);

			// With limit 0, should return all projects
			const allResult = service.getRecentProjects(0);
			expect(allResult).toHaveLength(10);

			// With custom limit, should respect it
			const customResult = service.getRecentProjects(3);
			expect(customResult).toHaveLength(3);
		});
	});

	describe('addRecentProject', () => {
		it('should add new project to recent projects', () => {
			const project: GitProject = {
				path: '/new-project',
				name: 'New Project',
				relativePath: 'new-project',
				isValid: true,
			};

			service.addRecentProject(project);
			const result = service.getRecentProjects();

			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe('/new-project');
			expect(result[0]?.name).toBe('New Project');
		});

		it('should update existing project timestamp', async () => {
			// Add initial projects
			service.addRecentProject({
				path: '/project1',
				name: 'Project 1',
				relativePath: 'project1',
				isValid: true,
			});

			// Small delay to ensure different timestamps
			await new Promise(resolve => setTimeout(resolve, 10));

			service.addRecentProject({
				path: '/project2',
				name: 'Project 2',
				relativePath: 'project2',
				isValid: true,
			});

			const beforeTime = Date.now();

			// Small delay to ensure different timestamp
			await new Promise(resolve => setTimeout(resolve, 10));

			// Update existing project
			service.addRecentProject({
				path: '/project1',
				name: 'Project 1 Updated',
				relativePath: 'project1',
				isValid: true,
			});

			const afterTime = Date.now();
			const result = service.getRecentProjects();

			const updatedProject = result.find(p => p.path === '/project1');
			expect(updatedProject?.name).toBe('Project 1 Updated');
			expect(updatedProject?.lastAccessed).toBeGreaterThanOrEqual(beforeTime);
			expect(updatedProject?.lastAccessed).toBeLessThanOrEqual(afterTime);
			// Project 1 should be first due to recent update
			expect(result[0]?.path).toBe('/project1');
		});

		it('should not add EXIT_APPLICATION project', () => {
			const project: GitProject = {
				path: 'EXIT_APPLICATION',
				name: 'Exit',
				relativePath: '',
				isValid: false,
			};

			service.addRecentProject(project);
			const result = service.getRecentProjects();

			expect(result).toHaveLength(0);
		});
	});

	describe('clearRecentProjects', () => {
		it('should clear all recent projects', () => {
			// Add some projects first
			service.addRecentProject({
				path: '/project1',
				name: 'Project 1',
				relativePath: 'project1',
				isValid: true,
			});
			service.addRecentProject({
				path: '/project2',
				name: 'Project 2',
				relativePath: 'project2',
				isValid: true,
			});

			// Clear projects
			service.clearRecentProjects();
			const result = service.getRecentProjects();

			expect(result).toHaveLength(0);
		});
	});

	describe('filesystem persistence', () => {
		it('should create config directory if it does not exist', () => {
			expect(existsSync(testConfigDir)).toBe(true);
		});

		it('should persist recent projects to disk', () => {
			const project: GitProject = {
				path: '/home/user/project1',
				name: 'project1',
				relativePath: 'project1',
				isValid: true,
			};

			service.addRecentProject(project);

			// Verify file was created and contains the project
			expect(existsSync(testDataPath)).toBe(true);
			const fileContent = readFileSync(testDataPath, 'utf-8');
			const savedProjects = JSON.parse(fileContent);
			expect(savedProjects).toHaveLength(1);
			expect(savedProjects[0].path).toBe('/home/user/project1');

			// Create a new service instance to test loading from disk
			const newService = new RecentProjectsService();
			const projects = newService.getRecentProjects();

			expect(projects).toHaveLength(1);
			expect(projects[0]).toMatchObject({
				path: '/home/user/project1',
				name: 'project1',
			});
		});

		it('should handle corrupted data file gracefully', () => {
			// Write invalid JSON to the data file
			mkdirSync(testConfigDir, {recursive: true});
			writeFileSync(testDataPath, '{ invalid json }');

			// Spy on console.error to verify error handling
			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			// Create service - should handle the error and start with empty array
			const corruptedService = new RecentProjectsService();
			expect(corruptedService.getRecentProjects()).toEqual([]);

			// Verify error was logged
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to load recent projects:'),
				expect.any(Error),
			);

			// Should still be able to add projects
			const project: GitProject = {
				path: '/home/user/project1',
				name: 'project1',
				relativePath: 'project1',
				isValid: true,
			};
			corruptedService.addRecentProject(project);
			expect(corruptedService.getRecentProjects()).toHaveLength(1);

			consoleSpy.mockRestore();
		});

		it('should persist clear operation', () => {
			// Add some projects
			for (let i = 1; i <= 3; i++) {
				const project: GitProject = {
					path: `/home/user/project${i}`,
					name: `project${i}`,
					relativePath: `project${i}`,
					isValid: true,
				};
				service.addRecentProject(project);
			}

			expect(service.getRecentProjects()).toHaveLength(3);

			// Clear all projects
			service.clearRecentProjects();

			// Verify file was updated
			const fileContent = readFileSync(testDataPath, 'utf-8');
			const savedProjects = JSON.parse(fileContent);
			expect(savedProjects).toEqual([]);

			// Verify persistence
			const newService = new RecentProjectsService();
			expect(newService.getRecentProjects()).toHaveLength(0);
		});
	});
});
