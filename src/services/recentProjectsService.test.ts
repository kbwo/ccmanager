import {describe, it, expect, beforeEach} from 'vitest';
import {RecentProjectsService} from './recentProjectsService.js';
import {GitProject} from '../types/index.js';

describe('RecentProjectsService', () => {
	let service: RecentProjectsService;

	beforeEach(() => {
		service = new RecentProjectsService();
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

		it('should limit to max recent projects', () => {
			// Add 10 projects
			for (let i = 0; i < 10; i++) {
				service.addRecentProject({
					path: `/project${i}`,
					name: `Project ${i}`,
					relativePath: `project${i}`,
					isValid: true,
				});
			}

			const result = service.getRecentProjects();

			expect(result).toHaveLength(5);
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
});
