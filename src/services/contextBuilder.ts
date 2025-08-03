import fs from 'fs/promises';
import path from 'path';
import {getGitStatus} from '../utils/gitStatus.js';
import type {
	ProjectType,
	ProjectContext,
	PackageInfo,
	ArchitecturalPattern,
} from '../types/index.js';
import type {GitStatus} from '../utils/gitStatus.js';

/**
 * Builds project context for context-aware autopilot guidance
 */
export class ContextBuilder {
	private contextCache = new Map<string, ProjectContext>();
	private readonly defaultCacheDurationMs = 5 * 60 * 1000; // 5 minutes

	/**
	 * Build comprehensive project context for the given path
	 */
	async buildProjectContext(projectPath: string): Promise<ProjectContext> {
		const cacheKey = projectPath;
		const cached = this.contextCache.get(cacheKey);

		// Return cached context if still valid
		if (cached && this.isCacheValid(cached)) {
			console.log(`📋 Using cached project context for ${projectPath}`);
			return cached;
		}

		console.log(`🔍 Building project context for ${projectPath}`);
		const startTime = Date.now();

		try {
			// Build project type detection
			const projectType = await this.detectProjectType(projectPath);

			// Get git status if available
			let gitStatusResult: GitStatus | undefined;
			try {
				const controller = new AbortController();
				const result = await getGitStatus(projectPath, controller.signal);
				if (result.success && result.data) {
					gitStatusResult = result.data;
				}
			} catch (error) {
				console.log(`⚠️ Git status unavailable for ${projectPath}:`, error);
			}

			// Get recent files from git
			const recentFiles = await this.getRecentFiles(projectPath);

			// Get package info
			const packageInfo = await this.getPackageInfo(projectPath);

			const context: ProjectContext = {
				projectType,
				gitStatus: gitStatusResult,
				recentFiles,
				packageInfo,
				cacheTimestamp: new Date(),
				cacheDurationMs: this.defaultCacheDurationMs,
			};

			// Cache the result
			this.contextCache.set(cacheKey, context);

			const duration = Date.now() - startTime;
			console.log(
				`✅ Project context built in ${duration}ms for ${projectPath} (${projectType.framework}/${projectType.language})`,
			);

			return context;
		} catch (error) {
			console.log(
				`❌ Failed to build project context for ${projectPath}:`,
				error,
			);

			// Return minimal fallback context
			const fallbackContext: ProjectContext = {
				projectType: {
					framework: 'unknown',
					language: 'unknown',
					buildSystem: 'unknown',
					patterns: [],
				},
				recentFiles: [],
				cacheTimestamp: new Date(),
				cacheDurationMs: this.defaultCacheDurationMs,
			};

			return fallbackContext;
		}
	}

	/**
	 * Detect project type, framework, and architectural patterns
	 */
	async detectProjectType(projectPath: string): Promise<ProjectType> {
		const packageInfo = await this.getPackageInfo(projectPath);
		const fileStructure = await this.analyzeFileStructure(projectPath);

		// Detect framework
		const framework = this.detectFramework(packageInfo, fileStructure);

		// Detect language
		const language = this.detectLanguage(packageInfo, fileStructure);

		// Detect build system
		const buildSystem = this.detectBuildSystem(packageInfo, fileStructure);

		// Detect test framework
		const testFramework = this.detectTestFramework(packageInfo);

		// Detect architectural patterns
		const patterns = await this.detectArchitecturalPatterns(
			projectPath,
			fileStructure,
		);

		return {
			framework,
			language,
			buildSystem,
			testFramework,
			patterns,
		};
	}

	/**
	 * Detect framework from package.json and file structure
	 */
	private detectFramework(
		packageInfo?: PackageInfo,
		fileStructure?: string[],
	): ProjectType['framework'] {
		if (!packageInfo) return 'unknown';

		const deps = {
			...packageInfo.dependencies,
			...packageInfo.devDependencies,
		};

		// Check for specific frameworks in order of specificity
		if (deps['next'] || deps['@next/core']) return 'next';
		if (deps['react'] || deps['@types/react']) return 'react';
		if (deps['vue'] || deps['@vue/core']) return 'vue';
		if (deps['express'] || deps['@types/express']) return 'express';

		// Check for Node.js patterns
		if (deps['node'] || packageInfo.scripts?.['start']?.includes('node'))
			return 'node';

		// Check for TypeScript project
		if (
			deps['typescript'] ||
			fileStructure?.some(f => f.includes('tsconfig.json'))
		) {
			return 'typescript';
		}

		return 'unknown';
	}

	/**
	 * Detect primary language
	 */
	private detectLanguage(
		packageInfo?: PackageInfo,
		fileStructure?: string[],
	): ProjectType['language'] {
		if (!fileStructure) return 'unknown';

		const deps = packageInfo
			? {
					...packageInfo.dependencies,
					...packageInfo.devDependencies,
				}
			: {};

		// Check dependencies first
		if (deps['typescript'] || deps['@types/node']) return 'typescript';

		// Check file extensions
		const hasTs = fileStructure.some(
			f => f.endsWith('.ts') || f.endsWith('.tsx'),
		);
		const hasJs = fileStructure.some(
			f => f.endsWith('.js') || f.endsWith('.jsx'),
		);
		const hasPy = fileStructure.some(f => f.endsWith('.py'));
		const hasGo = fileStructure.some(f => f.endsWith('.go'));
		const hasRs = fileStructure.some(f => f.endsWith('.rs'));

		if (hasTs) return 'typescript';
		if (hasJs) return 'javascript';
		if (hasPy) return 'python';
		if (hasGo) return 'go';
		if (hasRs) return 'rust';

		return 'unknown';
	}

	/**
	 * Detect build system
	 */
	private detectBuildSystem(
		packageInfo?: PackageInfo,
		fileStructure?: string[],
	): ProjectType['buildSystem'] {
		if (!fileStructure) return 'unknown';

		const deps = packageInfo
			? {
					...packageInfo.dependencies,
					...packageInfo.devDependencies,
				}
			: {};

		// Check for specific build tools
		if (deps['vite'] || fileStructure.some(f => f.includes('vite.config')))
			return 'vite';
		if (
			deps['webpack'] ||
			fileStructure.some(f => f.includes('webpack.config'))
		)
			return 'webpack';
		if (deps['rollup'] || fileStructure.some(f => f.includes('rollup.config')))
			return 'rollup';

		// Check for package managers (fallback to npm-based tools)
		if (fileStructure.some(f => f.includes('yarn.lock'))) return 'yarn';
		if (fileStructure.some(f => f.includes('pnpm-lock.yaml'))) return 'pnpm';
		if (fileStructure.some(f => f.includes('package-lock.json'))) return 'npm';

		return 'unknown';
	}

	/**
	 * Detect test framework
	 */
	private detectTestFramework(
		packageInfo?: PackageInfo,
	): ProjectType['testFramework'] {
		if (!packageInfo) return undefined;

		const deps = {
			...packageInfo.dependencies,
			...packageInfo.devDependencies,
		};

		if (deps['vitest']) return 'vitest';
		if (deps['jest'] || deps['@types/jest']) return 'jest';
		if (deps['mocha']) return 'mocha';
		if (deps['cypress']) return 'cypress';
		if (deps['playwright'] || deps['@playwright/test']) return 'playwright';

		return undefined;
	}

	/**
	 * Detect architectural patterns from file structure
	 */
	private async detectArchitecturalPatterns(
		projectPath: string,
		fileStructure: string[],
	): Promise<ArchitecturalPattern[]> {
		const patterns: ArchitecturalPattern[] = [];

		// Component-based architecture (React/Vue)
		const hasComponents = fileStructure.some(
			f => f.includes('/components/') || f.includes('/Components/'),
		);
		if (hasComponents) {
			patterns.push({
				type: 'component-based',
				confidence: 0.8,
				indicators: ['components directory structure'],
			});
		}

		// MVC pattern
		const hasMVC =
			fileStructure.some(f => f.includes('/models/')) &&
			fileStructure.some(f => f.includes('/views/')) &&
			fileStructure.some(f => f.includes('/controllers/'));
		if (hasMVC) {
			patterns.push({
				type: 'mvc',
				confidence: 0.9,
				indicators: ['models, views, controllers directories'],
			});
		}

		// Microservice pattern
		const hasDockerfile = fileStructure.some(f => f.includes('Dockerfile'));
		const hasK8sConfig = fileStructure.some(
			f => f.includes('.yaml') || f.includes('.yml'),
		);
		if (hasDockerfile || hasK8sConfig) {
			patterns.push({
				type: 'microservice',
				confidence: 0.6,
				indicators: hasDockerfile ? ['Dockerfile'] : ['YAML configs'],
			});
		}

		// Monorepo pattern
		const hasWorkspaces = await this.checkForWorkspaces(projectPath);
		if (hasWorkspaces) {
			patterns.push({
				type: 'monorepo',
				confidence: 0.9,
				indicators: ['workspace configuration'],
			});
		}

		return patterns;
	}

	/**
	 * Get package.json information
	 */
	private async getPackageInfo(
		projectPath: string,
	): Promise<PackageInfo | undefined> {
		try {
			const packagePath = path.join(projectPath, 'package.json');
			const content = await fs.readFile(packagePath, 'utf-8');
			const packageJson = JSON.parse(content);

			return {
				name: packageJson.name,
				version: packageJson.version,
				dependencies: packageJson.dependencies || {},
				devDependencies: packageJson.devDependencies || {},
				scripts: packageJson.scripts || {},
			};
		} catch (_error) {
			console.log(`⚠️ No package.json found in ${projectPath}`);
			return undefined;
		}
	}

	/**
	 * Analyze file structure for project detection
	 */
	private async analyzeFileStructure(projectPath: string): Promise<string[]> {
		try {
			const files: string[] = [];

			// Get files from root directory
			const rootFiles = await fs.readdir(projectPath);
			files.push(...rootFiles.map(f => f));

			// Get files from common subdirectories (limited depth for performance)
			const commonDirs = ['src', 'lib', 'app', 'pages', 'components'];
			for (const dir of commonDirs) {
				try {
					const dirPath = path.join(projectPath, dir);
					const stat = await fs.stat(dirPath);
					if (stat.isDirectory()) {
						const subFiles = await fs.readdir(dirPath);
						files.push(...subFiles.map(f => `${dir}/${f}`));
					}
				} catch {
					// Directory doesn't exist, skip
				}
			}

			return files;
		} catch (error) {
			console.log(
				`⚠️ Failed to analyze file structure for ${projectPath}:`,
				error,
			);
			return [];
		}
	}

	/**
	 * Get recently modified files from git
	 */
	private async getRecentFiles(projectPath: string): Promise<string[]> {
		try {
			const {execSync} = await import('child_process');

			// Get recently modified files from git
			const output = execSync(
				'git log --pretty=format: --name-only --since="1 week ago" | sort | uniq -c | sort -rn | head -10',
				{cwd: projectPath, encoding: 'utf-8'},
			);

			return output
				.split('\n')
				.map(line => line.trim().split(/\s+/).slice(1).join(' '))
				.filter(file => file && !file.startsWith('.'))
				.slice(0, 10);
		} catch (error) {
			console.log(`⚠️ Failed to get recent files for ${projectPath}:`, error);
			return [];
		}
	}

	/**
	 * Check if the project uses workspaces (monorepo)
	 */
	private async checkForWorkspaces(projectPath: string): Promise<boolean> {
		try {
			const packagePath = path.join(projectPath, 'package.json');
			const content = await fs.readFile(packagePath, 'utf-8');
			const packageJson = JSON.parse(content);

			return !!(packageJson.workspaces || packageJson.workspaces?.packages);
		} catch {
			return false;
		}
	}

	/**
	 * Check if cached context is still valid
	 */
	private isCacheValid(context: ProjectContext): boolean {
		const now = Date.now();
		const cacheAge = now - context.cacheTimestamp.getTime();
		return cacheAge < context.cacheDurationMs;
	}

	/**
	 * Clear context cache for a specific project or all projects
	 */
	clearCache(projectPath?: string): void {
		if (projectPath) {
			this.contextCache.delete(projectPath);
			console.log(`🗑️ Cleared context cache for ${projectPath}`);
		} else {
			this.contextCache.clear();
			console.log('🗑️ Cleared all context cache');
		}
	}

	/**
	 * Get cache statistics for debugging
	 */
	getCacheStats(): {size: number; keys: string[]} {
		return {
			size: this.contextCache.size,
			keys: Array.from(this.contextCache.keys()),
		};
	}
}

// Export singleton instance
export const contextBuilder = new ContextBuilder();
