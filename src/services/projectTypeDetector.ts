import {readFile, access, readdir} from 'fs/promises';
import {join, basename} from 'path';
import type {
	ProjectType,
	ArchitecturalPattern,
	CompliancePattern,
} from '../types/index.js';

/**
 * Detects project type, framework, and architectural patterns from project structure
 */
export class ProjectTypeDetector {
	private packageJsonCache = new Map<string, any>();
	private directoryCache = new Map<string, string[]>();

	/**
	 * Detect the project type and framework from project structure
	 */
	async detectProjectType(projectPath: string): Promise<ProjectType> {
		const packageJson = await this.getPackageJson(projectPath);
		const directories = await this.getDirectories(projectPath);
		const files = await this.getFiles(projectPath);

		const framework = this.detectFramework(packageJson, directories, files);
		const language = this.detectLanguage(packageJson, files);
		const buildSystem = this.detectBuildSystem(packageJson, files);
		const testFramework = this.detectTestFramework(packageJson, directories);
		const patterns = await this.detectArchitecturalPatterns(
			projectPath,
			packageJson,
			directories,
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
	 * Get compliance patterns for the detected project type
	 */
	async getCompliancePatterns(
		projectType: ProjectType,
	): Promise<CompliancePattern[]> {
		const patterns: CompliancePattern[] = [];

		// Add framework-specific patterns
		patterns.push(...this.getFrameworkPatterns(projectType.framework));

		// Add language-specific patterns
		patterns.push(...this.getLanguagePatterns(projectType.language));

		// Add test framework patterns
		if (projectType.testFramework) {
			patterns.push(...this.getTestFrameworkPatterns(projectType.testFramework));
		}

		return patterns;
	}

	/**
	 * Detect architectural patterns from project structure
	 */
	async detectArchitecturalPatterns(
		projectPath: string,
		packageJson: any,
		directories: string[],
	): Promise<ArchitecturalPattern[]> {
		const patterns: ArchitecturalPattern[] = [];

		// Check for component-based architecture
		if (this.hasComponentStructure(directories)) {
			patterns.push({
				type: 'component-based',
				confidence: 0.8,
				indicators: ['components/', 'src/components/', 'pages/', 'views/'],
			});
		}

		// Check for MVC pattern
		if (this.hasMVCStructure(directories)) {
			patterns.push({
				type: 'mvc',
				confidence: 0.7,
				indicators: ['models/', 'views/', 'controllers/', 'routes/'],
			});
		}

		// Check for microservice pattern
		if (this.hasMicroserviceStructure(packageJson, directories)) {
			patterns.push({
				type: 'microservice',
				confidence: 0.6,
				indicators: ['services/', 'api/', 'endpoints/'],
			});
		}

		// Check for monorepo
		if (this.hasMonorepoStructure(directories, packageJson)) {
			patterns.push({
				type: 'monorepo',
				confidence: 0.9,
				indicators: ['packages/', 'apps/', 'libs/', 'workspaces'],
			});
		}

		return patterns;
	}

	private async getPackageJson(projectPath: string): Promise<any> {
		if (this.packageJsonCache.has(projectPath)) {
			return this.packageJsonCache.get(projectPath);
		}

		try {
			const packageJsonPath = join(projectPath, 'package.json');
			await access(packageJsonPath);
			const content = await readFile(packageJsonPath, 'utf-8');
			const packageJson = JSON.parse(content);
			this.packageJsonCache.set(projectPath, packageJson);
			return packageJson;
		} catch {
			return {};
		}
	}

	private async getDirectories(projectPath: string): Promise<string[]> {
		if (this.directoryCache.has(projectPath)) {
			return this.directoryCache.get(projectPath)!;
		}

		try {
			const items = await readdir(projectPath, {withFileTypes: true});
			const directories = items
				.filter(item => item.isDirectory())
				.map(item => item.name);
			this.directoryCache.set(projectPath, directories);
			return directories;
		} catch {
			return [];
		}
	}

	private async getFiles(projectPath: string): Promise<string[]> {
		try {
			const items = await readdir(projectPath, {withFileTypes: true});
			return items.filter(item => item.isFile()).map(item => item.name);
		} catch {
			return [];
		}
	}

	private detectFramework(
		packageJson: any,
		directories: string[],
		files: string[],
	): ProjectType['framework'] {
		const dependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		// React detection
		if (dependencies?.react) {
			if (dependencies?.next || dependencies?.['@next/core']) {
				return 'next';
			}
			return 'react';
		}

		// Vue detection
		if (dependencies?.vue || dependencies?.['@vue/cli']) {
			return 'vue';
		}

		// Express detection
		if (dependencies?.express) {
			return 'express';
		}

		// NestJS detection
		if (dependencies?.['@nestjs/core']) {
			return 'nestjs';
		}

		// TypeScript project detection
		if (
			files.includes('tsconfig.json') ||
			dependencies?.typescript ||
			dependencies?.['@types/node']
		) {
			return 'typescript';
		}

		// Node.js detection
		if (
			packageJson.main ||
			packageJson.scripts?.start ||
			directories.includes('node_modules')
		) {
			return 'node';
		}

		return 'unknown';
	}

	private detectLanguage(
		packageJson: any,
		files: string[],
	): ProjectType['language'] {
		const dependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		if (
			files.includes('tsconfig.json') ||
			dependencies?.typescript ||
			files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))
		) {
			return 'typescript';
		}

		if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
			return 'python';
		}

		if (files.includes('go.mod') || files.includes('go.sum')) {
			return 'go';
		}

		if (files.includes('Cargo.toml')) {
			return 'rust';
		}

		if (
			packageJson.main ||
			files.some(f => f.endsWith('.js') || f.endsWith('.jsx'))
		) {
			return 'javascript';
		}

		return 'unknown';
	}

	private detectBuildSystem(
		packageJson: any,
		files: string[],
	): ProjectType['buildSystem'] {
		if (files.includes('yarn.lock')) {
			return 'yarn';
		}

		if (files.includes('pnpm-lock.yaml')) {
			return 'pnpm';
		}

		if (files.includes('webpack.config.js') || files.includes('webpack.config.ts')) {
			return 'webpack';
		}

		if (files.includes('vite.config.js') || files.includes('vite.config.ts')) {
			return 'vite';
		}

		if (files.includes('rollup.config.js')) {
			return 'rollup';
		}

		if (files.includes('package-lock.json') || packageJson.scripts) {
			return 'npm';
		}

		return 'unknown';
	}

	private detectTestFramework(
		packageJson: any,
		directories: string[],
	): ProjectType['testFramework'] | undefined {
		const dependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		if (dependencies?.vitest) {
			return 'vitest';
		}

		if (dependencies?.jest) {
			return 'jest';
		}

		if (dependencies?.mocha) {
			return 'mocha';
		}

		if (dependencies?.cypress) {
			return 'cypress';
		}

		if (dependencies?.playwright || dependencies?.['@playwright/test']) {
			return 'playwright';
		}

		return undefined;
	}

	private hasComponentStructure(directories: string[]): boolean {
		return directories.some(dir =>
			['components', 'src', 'pages', 'views'].includes(dir),
		);
	}

	private hasMVCStructure(directories: string[]): boolean {
		const mvcDirs = ['models', 'views', 'controllers', 'routes'];
		return mvcDirs.filter(dir => directories.includes(dir)).length >= 2;
	}

	private hasMicroserviceStructure(packageJson: any, directories: string[]): boolean {
		const serviceDirs = ['services', 'api', 'endpoints'];
		return (
			serviceDirs.some(dir => directories.includes(dir)) ||
			packageJson.scripts?.['start:service'] ||
			packageJson.scripts?.['start:api']
		);
	}

	private hasMonorepoStructure(directories: string[], packageJson: any): boolean {
		return (
			directories.some(dir => ['packages', 'apps', 'libs'].includes(dir)) ||
			!!packageJson.workspaces
		);
	}

	private getFrameworkPatterns(framework: string): CompliancePattern[] {
		const patterns: Record<string, CompliancePattern[]> = {
			react: [
				{
					id: 'react-hooks-pattern',
					pattern: /componentDidMount|componentWillMount/,
					severity: 'warning',
					message: 'Consider using React hooks instead of class lifecycle methods',
					category: 'maintainability',
					framework: 'react',
				},
				{
					id: 'react-key-prop',
					pattern: /<\w+\s[^>]*?\smap\([^)]+\)\s*=>/,
					severity: 'warning',
					message: 'Always provide key prop when rendering lists',
					category: 'performance',
					framework: 'react',
				},
			],
			typescript: [
				{
					id: 'typescript-any-usage',
					pattern: /:\s*any(?!\s*\/\/.*@ts-ignore)/,
					severity: 'error',
					message: "Avoid 'any' type - use specific types",
					category: 'maintainability',
					framework: 'typescript',
				},
			],
			express: [
				{
					id: 'express-error-handling',
					pattern: /app\.(get|post|put|delete)\([^)]+\)\s*=>\s*{[^}]*}/,
					severity: 'info',
					message: 'Consider adding error handling middleware',
					category: 'security',
					framework: 'express',
				},
			],
		};

		return patterns[framework] || [];
	}

	private getLanguagePatterns(language: string): CompliancePattern[] {
		const patterns: Record<string, CompliancePattern[]> = {
			typescript: [
				{
					id: 'console-log-production',
					pattern: /console\.log(?!\s*\/\/.*debug)/,
					severity: 'warning',
					message: 'Remove console.log statements in production code',
					category: 'performance',
				},
			],
			javascript: [
				{
					id: 'var-usage',
					pattern: /\bvar\s+/,
					severity: 'warning',
					message: 'Use let or const instead of var',
					category: 'maintainability',
				},
			],
		};

		return patterns[language] || [];
	}

	private getTestFrameworkPatterns(testFramework: string): CompliancePattern[] {
		const patterns: Record<string, CompliancePattern[]> = {
			jest: [
				{
					id: 'jest-describe-block',
					pattern: /test\(.*\)\s*=>/,
					severity: 'info',
					message: 'Consider organizing tests in describe blocks',
					category: 'maintainability',
				},
			],
			vitest: [
				{
					id: 'vitest-async-test',
					pattern: /test\(\s*['"`][^'"`]*['"`]\s*,\s*async/,
					severity: 'info',
					message: 'Ensure async tests are properly awaited',
					category: 'maintainability',
				},
			],
		};

		return patterns[testFramework] || [];
	}

	/**
	 * Clear internal caches
	 */
	clearCache(): void {
		this.packageJsonCache.clear();
		this.directoryCache.clear();
	}
}