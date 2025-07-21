import {promises as fs} from 'fs';
import path from 'path';
import {GitProject, IMultiProjectService, Worktree} from '../types/index.js';
import {WorktreeService} from './worktreeService.js';
import {execSync} from 'child_process';

export class MultiProjectService implements IMultiProjectService {
	private projectCache: Map<string, GitProject> = new Map();

	async discoverProjects(projectsDir: string): Promise<GitProject[]> {
		const projects: GitProject[] = [];
		const projectMap = new Map<string, GitProject>();

		try {
			// Verify the directory exists
			await fs.access(projectsDir);

			// Recursively scan for git repositories
			await this.scanDirectory(projectsDir, projectsDir, projectMap);

			// Convert map to array and handle name conflicts
			for (const project of projectMap.values()) {
				projects.push(project);
			}

			// Sort projects by name for consistent display
			projects.sort((a, b) => a.name.localeCompare(b.name));

			// Cache the results
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

	private async scanDirectory(
		dir: string,
		rootDir: string,
		projectMap: Map<string, GitProject>,
	): Promise<void> {
		try {
			const entries = await fs.readdir(dir, {withFileTypes: true});

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;

				// Skip hidden directories except .git
				if (entry.name.startsWith('.') && entry.name !== '.git') continue;

				const fullPath = path.join(dir, entry.name);

				// Check if this directory is a git repository
				if (await this.validateGitRepository(fullPath)) {
					const relativePath = path.relative(rootDir, fullPath);
					const name = path.basename(fullPath);

					// Handle name conflicts by including parent directory
					let displayName = name;
					if (projectMap.has(name)) {
						// Use relative path for conflicts
						displayName = relativePath.replace(/[/\\]/g, '/');
					}

					const project: GitProject = {
						name: displayName,
						path: fullPath,
						relativePath,
						worktrees: [],
						isValid: true,
					};

					// Get worktrees for this project
					try {
						project.worktrees = await this.getProjectWorktrees(fullPath);
					} catch (error) {
						project.isValid = false;
						project.error = `Failed to get worktrees: ${(error as Error).message}`;
					}

					projectMap.set(displayName, project);
				} else {
					// Continue scanning subdirectories even if current is not a git repo
					await this.scanDirectory(fullPath, rootDir, projectMap);
				}
			}
		} catch (error) {
			// Silently skip directories we can't read
			if ((error as NodeJS.ErrnoException).code !== 'EACCES') {
				console.error(`Error scanning directory ${dir}:`, error);
			}
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
}
