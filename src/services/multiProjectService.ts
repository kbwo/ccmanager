import {promises as fs} from 'fs';
import path from 'path';
import {GitProject, IMultiProjectService} from '../types/index.js';

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

export class MultiProjectService implements IMultiProjectService {
	private projectCache: Map<string, GitProject> = new Map();
	private discoveryWorkers = 4; // Number of concurrent workers

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
					displayName = result.relativePath.replace(/[/\\]/g, '/');
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
}
