import {GitProject} from '../types/index.js';
import {homedir} from 'os';
import {join} from 'path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';

export interface RecentProject {
	path: string;
	name: string;
	lastAccessed: number;
}

export class RecentProjectsService {
	private static readonly MAX_RECENT_PROJECTS = 5;
	private recentProjects: RecentProject[] = [];
	private dataPath: string;
	private configDir: string;

	constructor() {
		// Determine config directory based on platform
		const homeDir = homedir();
		this.configDir =
			process.platform === 'win32'
				? join(
						process.env['APPDATA'] || join(homeDir, 'AppData', 'Roaming'),
						'ccmanager',
					)
				: join(homeDir, '.config', 'ccmanager');

		// Ensure config directory exists
		if (!existsSync(this.configDir)) {
			mkdirSync(this.configDir, {recursive: true});
		}

		this.dataPath = join(this.configDir, 'recent-projects.json');
		this.loadRecentProjects();
	}

	private loadRecentProjects(): void {
		try {
			if (existsSync(this.dataPath)) {
				const data = readFileSync(this.dataPath, 'utf-8');
				this.recentProjects = JSON.parse(data) || [];
			}
		} catch (error) {
			console.error('Failed to load recent projects:', error);
			this.recentProjects = [];
		}
	}

	private saveRecentProjects(): void {
		try {
			writeFileSync(
				this.dataPath,
				JSON.stringify(this.recentProjects, null, 2),
			);
		} catch (error) {
			console.error('Failed to save recent projects:', error);
		}
	}

	public getRecentProjects(limit?: number): RecentProject[] {
		// Return recent projects sorted by last accessed
		const sorted = this.recentProjects.sort(
			(a, b) => b.lastAccessed - a.lastAccessed,
		);

		// Apply limit if specified, otherwise use default MAX_RECENT_PROJECTS
		const maxItems =
			limit !== undefined ? limit : RecentProjectsService.MAX_RECENT_PROJECTS;
		return maxItems > 0 ? sorted.slice(0, maxItems) : sorted;
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

		// Sort by last accessed (newest first)
		this.recentProjects = this.recentProjects.sort(
			(a, b) => b.lastAccessed - a.lastAccessed,
		);

		// Save to disk
		this.saveRecentProjects();
	}

	public clearRecentProjects(): void {
		this.recentProjects = [];
		this.saveRecentProjects();
	}
}

// Create singleton instance lazily to avoid issues during testing
let _instance: RecentProjectsService | null = null;

export const recentProjectsService = {
	get instance(): RecentProjectsService {
		if (!_instance) {
			_instance = new RecentProjectsService();
		}
		return _instance;
	},

	// Proxy methods to maintain backward compatibility
	getRecentProjects(limit?: number) {
		return this.instance.getRecentProjects(limit);
	},

	addRecentProject(project: GitProject) {
		return this.instance.addRecentProject(project);
	},

	clearRecentProjects() {
		return this.instance.clearRecentProjects();
	},

	// Reset instance for testing
	_resetForTesting() {
		_instance = null;
	},
};
