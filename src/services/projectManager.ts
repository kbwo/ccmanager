import {
	GitProject,
	IProjectManager,
	IWorktreeService,
	MenuMode,
} from '../types/index.js';
import {WorktreeService} from './worktreeService.js';
import {MultiProjectService} from './multiProjectService.js';
import {MULTI_PROJECT_ENV_VARS} from '../constants/multiProject.js';

export class ProjectManager implements IProjectManager {
	currentMode: MenuMode;
	currentProject?: GitProject;
	projects: GitProject[] = [];

	private multiProjectService: MultiProjectService;
	private worktreeServiceCache: Map<string, IWorktreeService> = new Map();
	private projectsDir?: string;

	constructor() {
		// Initialize mode based on environment variables
		const multiProjectRoot =
			process.env[MULTI_PROJECT_ENV_VARS.MULTI_PROJECT_ROOT];
		this.projectsDir = process.env[MULTI_PROJECT_ENV_VARS.PROJECTS_DIR];

		// Set initial mode
		this.currentMode = multiProjectRoot ? 'multi-project' : 'normal';
		this.multiProjectService = new MultiProjectService();

		// If in multi-project mode but no projects dir, default to normal mode
		if (this.currentMode === 'multi-project' && !this.projectsDir) {
			this.currentMode = 'normal';
		}
	}

	setMode(mode: MenuMode): void {
		this.currentMode = mode;

		// Clear current project when switching to normal mode
		if (mode === 'normal') {
			this.currentProject = undefined;
		}
	}

	selectProject(project: GitProject): void {
		this.currentProject = project;
	}

	getWorktreeService(projectPath?: string): IWorktreeService {
		// Use provided path or fall back to current project path or current directory
		const path = projectPath || this.currentProject?.path || process.cwd();

		// Check cache first
		if (this.worktreeServiceCache.has(path)) {
			return this.worktreeServiceCache.get(path)!;
		}

		// Create new service and cache it
		const service = new WorktreeService(path);
		this.worktreeServiceCache.set(path, service);
		return service;
	}

	async refreshProjects(): Promise<void> {
		if (!this.projectsDir) {
			throw new Error('Projects directory not configured');
		}

		// Discover projects
		this.projects = await this.multiProjectService.discoverProjects(
			this.projectsDir,
		);

		// Update current project if it still exists
		if (this.currentProject) {
			const updatedProject = this.projects.find(
				p => p.path === this.currentProject!.path,
			);
			if (updatedProject) {
				this.currentProject = updatedProject;
			} else {
				// Current project no longer exists
				this.currentProject = undefined;
			}
		}
	}

	// Helper methods

	isMultiProjectEnabled(): boolean {
		return !!process.env[MULTI_PROJECT_ENV_VARS.MULTI_PROJECT_ROOT];
	}

	getProjectsDir(): string | undefined {
		return this.projectsDir;
	}

	getCurrentProjectPath(): string {
		return this.currentProject?.path || process.cwd();
	}

	// Clear cache for a specific project
	clearWorktreeServiceCache(projectPath?: string): void {
		if (projectPath) {
			this.worktreeServiceCache.delete(projectPath);
		} else {
			// Clear all cache
			this.worktreeServiceCache.clear();
		}
	}

	// Get all cached WorktreeService instances (useful for cleanup)
	getCachedServices(): Map<string, IWorktreeService> {
		return new Map(this.worktreeServiceCache);
	}
}
