import type {
	ProjectContext,
	CompliancePattern,
	ProjectType,
} from '../types/index.js';

/**
 * Framework-specific guidance patterns for context-aware intelligence
 */
export class ContextPatterns {
	/**
	 * Get framework-specific guidance patterns based on terminal output
	 */
	getGuidancePatterns(
		context: ProjectContext,
		terminalOutput: string,
	): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Add framework-specific patterns
		patterns.push(...this.getFrameworkPatterns(context.projectType, terminalOutput));

		// Add git workflow patterns
		if (context.gitStatus) {
			patterns.push(...this.getGitWorkflowPatterns(context, terminalOutput));
		}

		// Add testing patterns
		if (context.hasTests) {
			patterns.push(...this.getTestingPatterns(context.projectType, terminalOutput));
		}

		// Add dependency patterns
		patterns.push(...this.getDependencyPatterns(context, terminalOutput));

		return patterns.sort((a, b) => b.priority - a.priority);
	}

	/**
	 * Framework-specific guidance patterns
	 */
	private getFrameworkPatterns(
		projectType: ProjectType,
		output: string,
	): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		switch (projectType.framework) {
			case 'react':
				patterns.push(...this.getReactPatterns(output));
				break;
			case 'next':
				patterns.push(...this.getNextJSPatterns(output));
				break;
			case 'typescript':
				patterns.push(...this.getTypeScriptPatterns(output));
				break;
			case 'express':
				patterns.push(...this.getExpressPatterns(output));
				break;
			case 'node':
				patterns.push(...this.getNodePatterns(output));
				break;
		}

		return patterns;
	}

	/**
	 * React-specific patterns
	 */
	private getReactPatterns(output: string): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Hook dependency issues
		if (output.includes('React Hook useEffect has missing dependencies')) {
			patterns.push({
				id: 'react-hook-deps',
				pattern: /React Hook useEffect has missing dependencies/,
				priority: 9,
				guidance: 'Add missing dependencies to useEffect dependency array or use useCallback for stable references',
				category: 'react-hooks',
			});
		}

		// State update patterns
		if (output.includes('setState') && output.includes('Warning')) {
			patterns.push({
				id: 'react-state-update',
				pattern: /setState.*Warning/,
				priority: 8,
				guidance: 'Consider using functional state updates or useCallback to avoid state update warnings',
				category: 'react-state',
			});
		}

		// Performance patterns
		if (output.includes('re-render') || output.includes('performance')) {
			patterns.push({
				id: 'react-performance',
				pattern: /re-render|performance/i,
				priority: 7,
				guidance: 'Consider using React.memo, useMemo, or useCallback to optimize component performance',
				category: 'react-performance',
			});
		}

		// Component patterns
		if (output.includes('component') && output.includes('error')) {
			patterns.push({
				id: 'react-component-error',
				pattern: /component.*error/i,
				priority: 8,
				guidance: 'Check component props, state initialization, and error boundaries for React component issues',
				category: 'react-component',
			});
		}

		return patterns;
	}

	/**
	 * Next.js specific patterns
	 */
	private getNextJSPatterns(output: string): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Hydration issues
		if (output.includes('hydration') || output.includes('Hydration')) {
			patterns.push({
				id: 'nextjs-hydration',
				pattern: /hydration|Hydration/i,
				priority: 9,
				guidance: 'Fix hydration mismatch by ensuring server and client render the same content. Use useEffect for client-only code.',
				category: 'nextjs-ssr',
			});
		}

		// Routing issues
		if (output.includes('router') && output.includes('error')) {
			patterns.push({
				id: 'nextjs-routing',
				pattern: /router.*error/i,
				priority: 8,
				guidance: 'Check Next.js router usage, dynamic routes, and navigation patterns',
				category: 'nextjs-routing',
			});
		}

		return patterns;
	}

	/**
	 * TypeScript specific patterns
	 */
	private getTypeScriptPatterns(output: string): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Type errors
		if (output.includes('Type') && output.includes('error')) {
			patterns.push({
				id: 'typescript-type-error',
				pattern: /Type.*error/i,
				priority: 9,
				guidance: 'Fix TypeScript type errors by adding proper type annotations, interfaces, or type assertions',
				category: 'typescript-types',
			});
		}

		// Any type usage
		if (output.includes("'any'") || output.includes('any type')) {
			patterns.push({
				id: 'typescript-any-usage',
				pattern: /'any'|any type/i,
				priority: 7,
				guidance: 'Replace "any" types with specific type definitions for better type safety',
				category: 'typescript-types',
			});
		}

		// Module resolution
		if (output.includes('Cannot find module')) {
			patterns.push({
				id: 'typescript-module-resolution',
				pattern: /Cannot find module/i,
				priority: 8,
				guidance: 'Check import paths, module resolution, and type declarations for missing modules',
				category: 'typescript-modules',
			});
		}

		return patterns;
	}

	/**
	 * Express.js specific patterns
	 */
	private getExpressPatterns(output: string): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Route errors
		if (output.includes('route') && output.includes('error')) {
			patterns.push({
				id: 'express-route-error',
				pattern: /route.*error/i,
				priority: 8,
				guidance: 'Check Express route definitions, middleware order, and error handling',
				category: 'express-routing',
			});
		}

		// Middleware issues
		if (output.includes('middleware')) {
			patterns.push({
				id: 'express-middleware',
				pattern: /middleware/i,
				priority: 7,
				guidance: 'Verify middleware configuration, order, and next() calls in Express middleware',
				category: 'express-middleware',
			});
		}

		return patterns;
	}

	/**
	 * Node.js specific patterns
	 */
	private getNodePatterns(output: string): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Module errors
		if (output.includes('MODULE_NOT_FOUND')) {
			patterns.push({
				id: 'node-module-not-found',
				pattern: /MODULE_NOT_FOUND/,
				priority: 9,
				guidance: 'Install missing npm package or check import/require paths',
				category: 'node-modules',
			});
		}

		// Port binding issues
		if (output.includes('EADDRINUSE')) {
			patterns.push({
				id: 'node-port-in-use',
				pattern: /EADDRINUSE/,
				priority: 8,
				guidance: 'Port is already in use. Try a different port or stop the existing process',
				category: 'node-runtime',
			});
		}

		return patterns;
	}

	/**
	 * Git workflow patterns
	 */
	private getGitWorkflowPatterns(
		context: ProjectContext,
		output: string,
	): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		if (!context.gitStatus) return patterns;

		// Uncommitted changes
		const hasChanges = context.gitStatus.filesAdded > 0 || context.gitStatus.filesDeleted > 0;
		if (hasChanges && output.includes('commit')) {
			patterns.push({
				id: 'git-uncommitted-changes',
				pattern: /commit/i,
				priority: 6,
				guidance: `You have ${context.gitStatus.filesAdded + context.gitStatus.filesDeleted} uncommitted changes. Consider committing your progress.`,
				category: 'git-workflow',
			});
		}

		// Merge conflicts
		if (output.includes('conflict') || output.includes('CONFLICT')) {
			patterns.push({
				id: 'git-merge-conflict',
				pattern: /conflict|CONFLICT/i,
				priority: 9,
				guidance: 'Resolve merge conflicts by editing conflicted files and running git add/commit',
				category: 'git-conflict',
			});
		}

		// Branch management
		if (context.gitStatus.aheadCount > 0 && output.includes('push')) {
			patterns.push({
				id: 'git-unpushed-commits',
				pattern: /push/i,
				priority: 5,
				guidance: `You have ${context.gitStatus.aheadCount} unpushed commits. Consider pushing to remote.`,
				category: 'git-workflow',
			});
		}

		return patterns;
	}

	/**
	 * Testing patterns
	 */
	private getTestingPatterns(
		projectType: ProjectType,
		output: string,
	): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Test failures
		if (output.includes('FAIL') || output.includes('failed')) {
			patterns.push({
				id: 'test-failure',
				pattern: /FAIL|failed/i,
				priority: 8,
				guidance: 'Review failed tests and fix implementation or update test expectations',
				category: 'testing',
			});
		}

		// Test framework specific
		if (projectType.testFramework === 'jest' && output.includes('Jest')) {
			patterns.push({
				id: 'jest-test-guidance',
				pattern: /Jest/i,
				priority: 6,
				guidance: 'Use Jest best practices: describe blocks, proper mocking, and clear test names',
				category: 'testing-jest',
			});
		}

		if (projectType.testFramework === 'vitest' && output.includes('Vitest')) {
			patterns.push({
				id: 'vitest-test-guidance',
				pattern: /Vitest/i,
				priority: 6,
				guidance: 'Use Vitest features: fast testing, ESM support, and built-in TypeScript support',
				category: 'testing-vitest',
			});
		}

		return patterns;
	}

	/**
	 * Dependency patterns
	 */
	private getDependencyPatterns(
		context: ProjectContext,
		output: string,
	): GuidancePattern[] {
		const patterns: GuidancePattern[] = [];

		// Package installation
		if (output.includes('npm install') || output.includes('yarn add')) {
			patterns.push({
				id: 'dependency-installation',
				pattern: /npm install|yarn add/i,
				priority: 7,
				guidance: 'Consider checking if the package is already installed or if there are type definitions available',
				category: 'dependencies',
			});
		}

		// Version conflicts
		if (output.includes('version') && output.includes('conflict')) {
			patterns.push({
				id: 'dependency-conflict',
				pattern: /version.*conflict/i,
				priority: 8,
				guidance: 'Resolve dependency version conflicts by updating package.json or using resolutions',
				category: 'dependencies',
			});
		}

		// Security vulnerabilities
		if (output.includes('vulnerability') || output.includes('audit')) {
			patterns.push({
				id: 'security-vulnerability',
				pattern: /vulnerability|audit/i,
				priority: 9,
				guidance: 'Run npm audit fix or update vulnerable packages to secure versions',
				category: 'security',
			});
		}

		return patterns;
	}

	/**
	 * Get context summary for LLM prompts
	 */
	getContextSummary(context: ProjectContext): string {
		const framework = context.projectType.framework;
		const language = context.projectType.language;
		const hasTests = context.hasTests ? 'with tests' : 'without tests';
		const hasGit = context.gitStatus ? 'git-managed' : 'non-git';
		
		const gitInfo = context.gitStatus
			? ` (${context.gitStatus.filesAdded + context.gitStatus.filesDeleted} changed files, ${context.gitStatus.aheadCount} ahead, ${context.gitStatus.behindCount} behind)`
			: '';

		return `${framework}/${language} project ${hasTests}, ${hasGit}${gitInfo}. Dependencies: ${context.dependencies.slice(0, 5).join(', ')}${context.dependencies.length > 5 ? '...' : ''}`;
	}
}

/**
 * Guidance pattern interface
 */
export interface GuidancePattern {
	id: string;
	pattern: RegExp;
	priority: number;
	guidance: string;
	category: string;
}