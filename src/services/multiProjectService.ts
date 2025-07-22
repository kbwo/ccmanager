import {promises as fs} from 'fs';
import path from 'path';
import {GitProject, IMultiProjectService, Worktree} from '../types/index.js';
import {WorktreeService} from './worktreeService.js';
import {execSync} from 'child_process';

interface DiscoveryTask {
	path: string;
	relativePath: string;
}

interface DiscoveryResult {
	path: string;
	relativePath: string;
	name: string;
	isGitRepo: boolean;
	hasMultipleWorktrees: boolean;
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

			// Step 3: Filter and create project objects
			for (const result of results) {
				if (result.isGitRepo && !result.hasMultipleWorktrees) {
					// Handle name conflicts
					let displayName = result.name;
					if (projectMap.has(result.name)) {
						displayName = result.relativePath.replace(/[/\\]/g, '/');
					}

					const project: GitProject = {
						name: displayName,
						path: result.path,
						relativePath: result.relativePath,
						worktrees: [], // Lazy load worktrees later
						isValid: true,
						error: result.error,
					};

					projectMap.set(displayName, project);
				}
			}

			// Convert to array and sort
			projects.push(...projectMap.values());
			projects.sort((a, b) => a.name.localeCompare(b.name));

			// Cache results
			this.projectCache.clear();
			projects.forEach(p => this.projectCache.set(p.path, p));

			// Step 4: Lazy load worktrees for visible projects only
			// This will be done on-demand when projects are displayed

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
				results.push(result);
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
	 */
	private async processDirectory(
		task: DiscoveryTask,
		_rootDir: string,
	): Promise<DiscoveryResult> {
		const result: DiscoveryResult = {
			path: task.path,
			relativePath: task.relativePath,
			name: path.basename(task.path),
			isGitRepo: false,
			hasMultipleWorktrees: false,
		};

		try {
			// Quick validation - already checked for .git existence
			const isValid = await this.quickValidateGitRepository(task.path);
			if (!isValid) {
				return result;
			}

			result.isGitRepo = true;

			// Check for worktrees only if it's a valid repo
			result.hasMultipleWorktrees = await this.quickHasWorktrees(task.path);
		} catch (error) {
			result.error = `Failed to process: ${(error as Error).message}`;
		}

		return result;
	}

	/**
	 * Quick git repository validation with minimal overhead
	 */
	private async quickValidateGitRepository(
		projectPath: string,
	): Promise<boolean> {
		try {
			// Just check if we can get git directory - faster than full validation
			execSync('git rev-parse --git-dir', {
				cwd: projectPath,
				encoding: 'utf8',
				stdio: 'pipe',
				timeout: 1000, // 1 second timeout for faster failures
			});
			return true;
		} catch {
			// Also check for bare repositories
			try {
				const result = execSync('git rev-parse --is-bare-repository', {
					cwd: projectPath,
					encoding: 'utf8',
					stdio: 'pipe',
					timeout: 1000,
				}).trim();
				return result === 'true';
			} catch {
				return false;
			}
		}
	}

	/**
	 * Quick check if repository has multiple worktrees
	 */
	private async quickHasWorktrees(projectPath: string): Promise<boolean> {
		try {
			// Use git worktree list with minimal output
			const output = execSync('git worktree list --porcelain', {
				cwd: projectPath,
				encoding: 'utf8',
				stdio: 'pipe',
				timeout: 1000, // 1 second timeout
			});

			// Count worktrees by counting "worktree" lines
			const worktreeCount = (output.match(/^worktree /gm) || []).length;
			return worktreeCount > 1;
		} catch {
			return false;
		}
	}

	async validateGitRepository(projectPath: string): Promise<boolean> {
		try {
			// Check for .git directory or file (for worktrees)
			const gitPath = path.join(projectPath, '.git');
			await fs.access(gitPath);

			// Verify it's a valid git repository by running a git command
			execSync('git rev-parse --git-dir', {
				cwd: projectPath,
				encoding: 'utf8',
				stdio: 'pipe',
			});

			return true;
		} catch {
			// Also check if it's a bare repository
			try {
				execSync('git rev-parse --is-bare-repository', {
					cwd: projectPath,
					encoding: 'utf8',
					stdio: 'pipe',
				});
				return true;
			} catch {
				return false;
			}
		}
	}

	async getProjectWorktrees(projectPath: string): Promise<Worktree[]> {
		const worktreeService = new WorktreeService(projectPath);
		return worktreeService.getWorktrees();
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
			worktrees: [],
			isValid: true,
		};

		try {
			project.worktrees = await this.getProjectWorktrees(projectPath);
		} catch (error) {
			project.isValid = false;
			project.error = `Failed to get worktrees: ${(error as Error).message}`;
		}

		this.projectCache.set(projectPath, project);
		return project;
	}

	/**
	 * Load worktrees for specific projects on demand
	 */
	async loadProjectWorktrees(projects: GitProject[]): Promise<void> {
		// Load worktrees in parallel for visible projects
		await Promise.all(
			projects.map(async project => {
				if (project.worktrees.length === 0 && project.isValid) {
					try {
						project.worktrees = await this.getProjectWorktrees(project.path);
					} catch (error) {
						project.error = `Failed to load worktrees: ${(error as Error).message}`;
					}
				}
			}),
		);
	}
}
