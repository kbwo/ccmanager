import {readdir, stat, readFile} from 'fs/promises';
import {join, basename} from 'path';
import type {
	ProjectContext,
	ProjectType,
	ContextAwareConfig,
} from '../types/index.js';
import {ProjectTypeDetector} from './projectTypeDetector.js';
import {getGitStatus} from '../utils/gitStatus.js';

/**
 * Builds comprehensive project context for intelligent guidance
 */
export class ContextBuilder {
	private projectTypeDetector: ProjectTypeDetector;
	private cache = new Map<string, ProjectContext>();
	private config: ContextAwareConfig;

	constructor(config: ContextAwareConfig) {
		this.config = config;
		this.projectTypeDetector = new ProjectTypeDetector();
	}

	/**
	 * Build project context with caching
	 */
	async buildProjectContext(projectPath: string): Promise<ProjectContext> {
		const cacheKey = projectPath;
		const cached = this.cache.get(cacheKey);

		// Check if cached context is still valid
		if (cached && this.isCacheValid(cached)) {
			console.log(`📋 Using cached context for ${basename(projectPath)}`);
			return cached;
		}

		console.log(`🔍 Building context for ${basename(projectPath)}`);
		const startTime = Date.now();

		try {
			const context = await this.buildContextFromScratch(projectPath);
			const duration = Date.now() - startTime;

			console.log(
				`✅ Context built in ${duration}ms for ${context.projectType.framework} project`,
			);

			// Cache the result
			this.cache.set(cacheKey, context);

			return context;
		} catch (error) {
			console.log(`❌ Error building context for ${projectPath}:`, error);
			// Return minimal context on error
			return this.createMinimalContext(projectPath);
		}
	}

	/**
	 * Build context from scratch (no cache)
	 */
	private async buildContextFromScratch(
		projectPath: string,
	): Promise<ProjectContext> {
		const [projectType, recentFiles, packageInfo, gitStatus] =
			await Promise.all([
				this.config.enableFrameworkDetection
					? this.projectTypeDetector.detectProjectType(projectPath)
					: this.createUnknownProjectType(),
				this.getRecentFiles(projectPath),
				this.getPackageInfo(projectPath),
				this.config.enableGitIntegration
					? this.getGitStatusSafe(projectPath)
					: undefined,
			]);

		const hasTests = await this.hasTestDirectory(projectPath);
		const hasDocumentation = await this.hasDocumentation(projectPath);

		return {
			projectType,
			gitStatus,
			recentFiles,
			hasTests,
			hasDocumentation,
			dependencies: packageInfo.dependencies,
			devDependencies: packageInfo.devDependencies,
			cacheTimestamp: new Date(),
		};
	}

	/**
	 * Get recently modified files for context
	 */
	private async getRecentFiles(
		projectPath: string,
		limit = 10,
	): Promise<string[]> {
		try {
			const files = await this.getAllFiles(projectPath);
			const fileStats = await Promise.allSettled(
				files.map(async file => {
					const fullPath = join(projectPath, file);
					const stats = await stat(fullPath);
					return {file, mtime: stats.mtime};
				}),
			);

			const validFiles = fileStats
				.filter(
					(result): result is PromiseFulfilledResult<{file: string; mtime: Date}> =>
						result.status === 'fulfilled',
				)
				.map(result => result.value);

			return validFiles
				.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
				.slice(0, limit)
				.map(item => item.file);
		} catch {
			return [];
		}
	}

	/**
	 * Get all files in project, filtering out common ignore patterns
	 */
	private async getAllFiles(
		projectPath: string,
		currentPath = '',
	): Promise<string[]> {
		const ignoreDirs = new Set([
			'node_modules',
			'.git',
			'dist',
			'build',
			'.next',
			'coverage',
			'.nyc_output',
		]);

		const ignoreFiles = new Set([
			'.DS_Store',
			'package-lock.json',
			'yarn.lock',
			'pnpm-lock.yaml',
		]);

		try {
			const fullPath = join(projectPath, currentPath);
			const items = await readdir(fullPath, {withFileTypes: true});
			const files: string[] = [];

			for (const item of items) {
				const itemPath = currentPath ? join(currentPath, item.name) : item.name;

				if (item.isDirectory()) {
					if (!ignoreDirs.has(item.name)) {
						const subFiles = await this.getAllFiles(projectPath, itemPath);
						files.push(...subFiles);
					}
				} else if (item.isFile() && !ignoreFiles.has(item.name)) {
					files.push(itemPath);
				}
			}

			return files;
		} catch {
			return [];
		}
	}

	/**
	 * Get package.json dependencies
	 */
	private async getPackageInfo(projectPath: string): Promise<{
		dependencies: string[];
		devDependencies: string[];
	}> {
		try {
			const packageJsonPath = join(projectPath, 'package.json');
			const content = await readFile(packageJsonPath, 'utf-8');
			const packageJson = JSON.parse(content);

			return {
				dependencies: Object.keys(packageJson.dependencies || {}),
				devDependencies: Object.keys(packageJson.devDependencies || {}),
			};
		} catch {
			return {dependencies: [], devDependencies: []};
		}
	}

	/**
	 * Check if project has test directory or test files
	 */
	private async hasTestDirectory(projectPath: string): Promise<boolean> {
		try {
			const items = await readdir(projectPath, {withFileTypes: true});
			const hasTestDir = items.some(
				item =>
					item.isDirectory() &&
					['test', 'tests', '__tests__', 'spec'].includes(item.name),
			);

			if (hasTestDir) {
				return true;
			}

			// Check for test files in src or root
			const testFilePattern = /\.(test|spec)\.(js|ts|jsx|tsx)$/;
			return items.some(
				item => item.isFile() && testFilePattern.test(item.name),
			);
		} catch {
			return false;
		}
	}

	/**
	 * Check if project has documentation
	 */
	private async hasDocumentation(projectPath: string): Promise<boolean> {
		try {
			const items = await readdir(projectPath, {withFileTypes: true});
			const docFiles = ['README.md', 'README.txt', 'DOCS.md', 'docs'];

			return items.some(item => {
				if (item.isFile()) {
					return docFiles.some(doc => item.name.toLowerCase() === doc.toLowerCase());
				}
				if (item.isDirectory()) {
					return item.name.toLowerCase() === 'docs';
				}
				return false;
			});
		} catch {
			return false;
		}
	}

	/**
	 * Get git status safely (don't throw on error)
	 */
	private async getGitStatusSafe(projectPath: string) {
		try {
			const abortController = new AbortController();
			const result = await getGitStatus(projectPath, abortController.signal);
			return result.success ? result.data : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Check if cached context is still valid
	 */
	private isCacheValid(context: ProjectContext): boolean {
		if (!context.cacheTimestamp) {
			return false;
		}

		const ageMinutes =
			(Date.now() - context.cacheTimestamp.getTime()) / (1000 * 60);
		return ageMinutes < this.config.cacheIntervalMinutes;
	}

	/**
	 * Create unknown project type for fallback
	 */
	private createUnknownProjectType(): ProjectType {
		return {
			framework: 'unknown',
			language: 'unknown',
			buildSystem: 'unknown',
			patterns: [],
		};
	}

	/**
	 * Create minimal context when building fails
	 */
	private createMinimalContext(projectPath: string): ProjectContext {
		return {
			projectType: this.createUnknownProjectType(),
			recentFiles: [],
			hasTests: false,
			hasDocumentation: false,
			dependencies: [],
			devDependencies: [],
			cacheTimestamp: new Date(),
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: ContextAwareConfig): void {
		this.config = config;
	}

	/**
	 * Get compliance patterns for the project
	 */
	async getCompliancePatterns(projectPath: string) {
		const context = await this.buildProjectContext(projectPath);
		return this.projectTypeDetector.getCompliancePatterns(
			context.projectType,
		);
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
		this.projectTypeDetector.clearCache();
	}

	/**
	 * Get debug information
	 */
	getDebugInfo(): object {
		return {
			cacheSize: this.cache.size,
			config: this.config,
			cacheKeys: Array.from(this.cache.keys()).map(key => basename(key)),
		};
	}
}