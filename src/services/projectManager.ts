import {
	GitProject,
	IProjectManager,
	IWorktreeService,
	MenuMode,
	RecentProject,
} from '../types/index.js';
import {WorktreeService} from './worktreeService.js';
import {ENV_VARS} from '../constants/env.js';
import {promises as fs} from 'fs';
import path from 'path';
import {homedir} from 'os';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {Effect} from 'effect';
import {FileSystemError, ConfigError} from '../types/errors.js';

interface DiscoveryTask {
	path: string;
	relativePath: string;
}

interface DiscoveryResult {
	path: string;
	relativePath: string;
	name: string;
	error?: string;
}

export class ProjectManager implements IProjectManager {
	currentMode: MenuMode;
	currentProject?: GitProject;
	projects: GitProject[] = [];

	private worktreeServiceCache: Map<string, IWorktreeService> = new Map();
	private projectsDir?: string;

	// Multi-project discovery
	private projectCache: Map<string, GitProject> = new Map();
	private discoveryWorkers = 4;

	// Recent projects
	private static readonly MAX_RECENT_PROJECTS = 5;
	private recentProjects: RecentProject[] = [];
	private dataPath: string;
	private configDir: string;

	constructor() {
		// Initialize mode based on environment variables
		const multiProjectRoot = process.env[ENV_VARS.MULTI_PROJECT_ROOT];
		this.projectsDir = process.env[ENV_VARS.MULTI_PROJECT_ROOT];

		// Set initial mode
		this.currentMode = multiProjectRoot ? 'multi-project' : 'normal';

		// If in multi-project mode but no projects dir, default to normal mode
		if (this.currentMode === 'multi-project' && !this.projectsDir) {
			this.currentMode = 'normal';
		}

		// Initialize recent projects
		const homeDir = homedir();
		this.configDir =
			process.platform === 'win32'
				? path.join(
						process.env['APPDATA'] || path.join(homeDir, 'AppData', 'Roaming'),
						'ccmanager',
					)
				: path.join(homeDir, '.config', 'ccmanager');

		// Ensure config directory exists
		if (!existsSync(this.configDir)) {
			mkdirSync(this.configDir, {recursive: true});
		}

		this.dataPath = path.join(this.configDir, 'recent-projects.json');
		this.loadRecentProjects();
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
		this.projects = await this.discoverProjects(this.projectsDir);

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
		return !!process.env[ENV_VARS.MULTI_PROJECT_ROOT];
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

	// Recent projects methods

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
			limit !== undefined ? limit : ProjectManager.MAX_RECENT_PROJECTS;
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

	// Multi-project discovery methods

	async discoverProjects(projectsDir: string): Promise<GitProject[]> {
		const projects: GitProject[] = [];
		const projectMap = new Map<string, GitProject>();

		try {
			// Verify the directory exists
			await fs.access(projectsDir);

			// Step 1: Fast concurrent directory discovery
			const directories = await this.discoverDirectories(projectsDir);

			// Step 2: Process directories in parallel to check if they're git repos
			const results = await this.processDirectoriesInParallel(
				directories,
				projectsDir,
			);

			// Step 3: Create project objects (all results are valid git repos)
			for (const result of results) {
				// Handle name conflicts
				let displayName = result.name;
				if (projectMap.has(result.name)) {
					displayName = result.relativePath.replace(/[\\/\\\\]/g, '/');
				}

				const project: GitProject = {
					name: displayName,
					path: result.path,
					relativePath: result.relativePath,
					isValid: true,
					error: result.error,
				};

				projectMap.set(displayName, project);
			}

			// Convert to array and sort
			projects.push(...projectMap.values());
			projects.sort((a, b) => a.name.localeCompare(b.name));

			// Cache results
			this.projectCache.clear();
			projects.forEach(p => this.projectCache.set(p.path, p));

			return projects;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(`Projects directory does not exist: ${projectsDir}`);
			}
			throw error;
		}
	}

	/**
	 * Fast directory discovery - similar to ghq's approach
	 */
	private async discoverDirectories(
		rootDir: string,
		maxDepth: number = 3,
	): Promise<DiscoveryTask[]> {
		const tasks: DiscoveryTask[] = [];
		const seen = new Set<string>();

		const walk = async (dir: string, depth: number): Promise<void> => {
			if (depth > maxDepth) return;

			try {
				const entries = await fs.readdir(dir, {withFileTypes: true});

				// Process entries in parallel
				await Promise.all(
					entries.map(async entry => {
						if (!entry.isDirectory()) return;
						if (entry.name.startsWith('.') && entry.name !== '.git') return;

						const fullPath = path.join(dir, entry.name);
						const relativePath = path.relative(rootDir, fullPath);

						// Quick check if this is a git repository
						const hasGitDir = await this.hasGitDirectory(fullPath);
						if (hasGitDir) {
							// Found a git repository - add to tasks and skip subdirectories
							if (!seen.has(fullPath)) {
								seen.add(fullPath);
								tasks.push({path: fullPath, relativePath});
							}
							return; // Early termination - don't walk subdirectories
						}

						// Not a git repo, continue walking subdirectories
						await walk(fullPath, depth + 1);
					}),
				);
			} catch (error) {
				// Silently skip directories we can't read
				if ((error as NodeJS.ErrnoException).code !== 'EACCES') {
					console.error(`Error scanning directory ${dir}:`, error);
				}
			}
		};

		await walk(rootDir, 0);
		return tasks;
	}

	/**
	 * Quick check for .git directory without running git commands
	 */
	private async hasGitDirectory(dirPath: string): Promise<boolean> {
		try {
			const gitPath = path.join(dirPath, '.git');
			const stats = await fs.stat(gitPath);
			return stats.isDirectory() || stats.isFile(); // File for worktrees
		} catch {
			return false;
		}
	}

	/**
	 * Process directories in parallel using worker pool pattern
	 */
	private async processDirectoriesInParallel(
		tasks: DiscoveryTask[],
		rootDir: string,
	): Promise<DiscoveryResult[]> {
		const results: DiscoveryResult[] = [];
		const queue = [...tasks];
		const workers: Promise<void>[] = [];

		// Create worker function
		const worker = async (): Promise<void> => {
			while (queue.length > 0) {
				const task = queue.shift();
				if (!task) break;

				const result = await this.processDirectory(task, rootDir);
				if (result) {
					results.push(result);
				}
			}
		};

		// Start workers
		for (let i = 0; i < this.discoveryWorkers; i++) {
			workers.push(worker());
		}

		// Wait for all workers to complete
		await Promise.all(workers);

		return results;
	}

	/**
	 * Process a single directory to check if it's a valid git repo
	 * @param task - The discovery task containing path information
	 * @param _rootDir - The root directory (unused)
	 * @returns A DiscoveryResult object if the directory is a valid git repository,
	 *          or null if it's not a valid git repository (will be filtered out)
	 */
	private async processDirectory(
		task: DiscoveryTask,
		_rootDir: string,
	): Promise<DiscoveryResult | null> {
		const result: DiscoveryResult = {
			path: task.path,
			relativePath: task.relativePath,
			name: path.basename(task.path),
		};

		try {
			// Check if directory has .git (already validated in discoverDirectories)
			// Double-check here to ensure it's still valid
			const hasGit = await this.hasGitDirectory(task.path);
			if (!hasGit) {
				// Not a git repo, return null to filter it out
				return null;
			}
		} catch (error) {
			result.error = `Failed to process: ${(error as Error).message}`;
		}

		return result;
	}

	async validateGitRepository(projectPath: string): Promise<boolean> {
		// Simply check for .git directory existence
		return this.hasGitDirectory(projectPath);
	}

	// Helper method to get a cached project
	getCachedProject(projectPath: string): GitProject | undefined {
		return this.projectCache.get(projectPath);
	}

	// Helper method to refresh a single project
	async refreshProject(projectPath: string): Promise<GitProject | null> {
		if (!(await this.validateGitRepository(projectPath))) {
			this.projectCache.delete(projectPath);
			return null;
		}

		const name = path.basename(projectPath);
		const project: GitProject = {
			name,
			path: projectPath,
			relativePath: name,
			isValid: true,
		};

		this.projectCache.set(projectPath, project);
		return project;
	}

	// Effect-based API methods

	/**
	 * Discover Git projects in the specified directory (Effect version)
	 * @param projectsDir - Root directory to search for Git projects
	 * @returns Effect with discovered projects or FileSystemError
	 */
	discoverProjectsEffect(
		projectsDir: string,
	): Effect.Effect<GitProject[], FileSystemError, never> {
		return Effect.tryPromise({
			try: async () => {
				// Verify the directory exists
				await fs.access(projectsDir);

				// Step 1: Fast concurrent directory discovery
				const directories = await this.discoverDirectories(projectsDir);

				// Step 2: Process directories in parallel to check if they're git repos
				const results = await this.processDirectoriesInParallel(
					directories,
					projectsDir,
				);

				// Step 3: Create project objects
				const projects: GitProject[] = [];
				const projectMap = new Map<string, GitProject>();

				for (const result of results) {
					// Handle name conflicts
					let displayName = result.name;
					if (projectMap.has(result.name)) {
						displayName = result.relativePath.replace(/[\\/\\\\]/g, '/');
					}

					const project: GitProject = {
						name: displayName,
						path: result.path,
						relativePath: result.relativePath,
						isValid: true,
						error: result.error,
					};

					projectMap.set(displayName, project);
				}

				// Convert to array and sort
				projects.push(...projectMap.values());
				projects.sort((a, b) => a.name.localeCompare(b.name));

				// Cache results
				this.projectCache.clear();
				projects.forEach(p => this.projectCache.set(p.path, p));

				return projects;
			},
			catch: error => {
				if (error instanceof FileSystemError) {
					return error;
				}

				const nodeError = error as NodeJS.ErrnoException;
				const cause =
					nodeError.code === 'ENOENT'
						? `Projects directory does not exist: ${projectsDir}`
						: String(error);

				return new FileSystemError({
					operation: 'read',
					path: projectsDir,
					cause,
				});
			},
		});
	}

	/**
	 * Load recent projects from cache (Effect version)
	 * @returns Effect with recent projects or FileSystemError/ConfigError
	 */
	loadRecentProjectsEffect(): Effect.Effect<
		RecentProject[],
		FileSystemError | ConfigError,
		never
	> {
		return Effect.try({
			try: () => {
				if (existsSync(this.dataPath)) {
					const data = readFileSync(this.dataPath, 'utf-8');
					try {
						const parsed = JSON.parse(data);
						return parsed || [];
					} catch (parseError) {
						throw new ConfigError({
							configPath: this.dataPath,
							reason: 'parse',
							details: String(parseError),
						});
					}
				}
				return [];
			},
			catch: error => {
				if (error instanceof ConfigError) {
					return error;
				}
				return new FileSystemError({
					operation: 'read',
					path: this.dataPath,
					cause: String(error),
				});
			},
		});
	}

	/**
	 * Save recent projects to cache (Effect version)
	 * @param projects - Recent projects to save
	 * @returns Effect with void or FileSystemError
	 */
	saveRecentProjectsEffect(
		projects: RecentProject[],
	): Effect.Effect<void, FileSystemError, never> {
		return Effect.try({
			try: () => {
				writeFileSync(this.dataPath, JSON.stringify(projects, null, 2));
			},
			catch: error => {
				return new FileSystemError({
					operation: 'write',
					path: this.dataPath,
					cause: String(error),
				});
			},
		});
	}

	/**
	 * Refresh projects list (Effect version)
	 * @returns Effect with void or FileSystemError
	 */
	refreshProjectsEffect(): Effect.Effect<void, FileSystemError, never> {
		return Effect.flatMap(
			Effect.try({
				try: () => {
					if (!this.projectsDir) {
						throw new FileSystemError({
							operation: 'read',
							path: '',
							cause: 'Projects directory not configured',
						});
					}
					return this.projectsDir;
				},
				catch: error => {
					if (error instanceof FileSystemError) {
						return error;
					}
					return new FileSystemError({
						operation: 'read',
						path: '',
						cause: String(error),
					});
				},
			}),
			projectsDir =>
				Effect.flatMap(this.discoverProjectsEffect(projectsDir), projects =>
					Effect.sync(() => {
						this.projects = projects;

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
					}),
				),
		);
	}
}

// Create singleton instance
let _instance: ProjectManager | null = null;

export const projectManager = {
	get instance(): ProjectManager {
		if (!_instance) {
			_instance = new ProjectManager();
		}
		return _instance;
	},

	// Proxy methods to maintain backward compatibility with recentProjectsService
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
