import {GitProject} from '../types/index.js';

export interface RecentProject {
	path: string;
	name: string;
	lastAccessed: number;
}

export class RecentProjectsService {
	private static readonly MAX_RECENT_PROJECTS = 5;
	private recentProjects: RecentProject[] = [];

	public getRecentProjects(): RecentProject[] {
		// Return recent projects sorted by last accessed
		return this.recentProjects
			.sort((a, b) => b.lastAccessed - a.lastAccessed)
			.slice(0, RecentProjectsService.MAX_RECENT_PROJECTS);
	}

	public addRecentProject(project: GitProject): void {
		if (project.path === 'EXIT_APPLICATION') {
			return;
		}

		const existingIndex = this.recentProjects.findIndex(
			p => p.path === project.path,
		);

		const recentProject: RecentProject = {
			path: project.path,
			name: project.name,
			lastAccessed: Date.now(),
		};

		if (existingIndex !== -1) {
			// Update existing project
			this.recentProjects[existingIndex] = recentProject;
		} else {
			// Add new project
			this.recentProjects.unshift(recentProject);
		}

		// Keep only the max number of projects
		this.recentProjects = this.recentProjects
			.sort((a, b) => b.lastAccessed - a.lastAccessed)
			.slice(0, RecentProjectsService.MAX_RECENT_PROJECTS);
	}

	public clearRecentProjects(): void {
		this.recentProjects = [];
	}
}

export const recentProjectsService = new RecentProjectsService();
