import type {ContextPattern, ProjectType} from '../types/index.js';

/**
 * Framework-specific guidance patterns for context-aware autopilot
 */
export class ContextPatterns {
	private patterns: Record<ProjectType['framework'], ContextPattern[]> = {
		react: [
			{
				id: 'react-hooks-warning',
				name: 'Class Component Lifecycle',
				framework: 'react',
				category: 'hooks',
				pattern: /componentDidMount|componentWillMount|componentDidUpdate/gi,
				guidance:
					'Consider using React hooks (useEffect) instead of class lifecycle methods for better performance and cleaner code.',
				confidence: 0.9,
			},
			{
				id: 'react-state-mutation',
				name: 'Direct State Mutation',
				framework: 'react',
				category: 'state-management',
				pattern: /this\.state\.\w+\s*=(?!=)/gi,
				guidance:
					'Avoid direct state mutation. Use setState() or state setters from useState hook.',
				confidence: 0.95,
			},
			{
				id: 'react-key-prop',
				name: 'Missing Key Prop',
				framework: 'react',
				category: 'performance',
				pattern: /\.map\([^}]*<\w+(?![^>]*key=)/gi,
				guidance:
					'Add unique key prop to list items for better React reconciliation performance.',
				confidence: 0.8,
			},
			{
				id: 'react-inline-functions',
				name: 'Inline Function Props',
				framework: 'react',
				category: 'performance',
				pattern: /\w+={[^}]*=>\s*[^}]*}/gi,
				guidance:
					'Consider extracting inline functions to avoid unnecessary re-renders. Use useCallback for optimization.',
				confidence: 0.7,
			},
		],
		typescript: [
			{
				id: 'typescript-any-usage',
				name: 'Any Type Usage',
				framework: 'typescript',
				category: 'testing',
				pattern: /:\s*any(?!\s*\/\/.*@ts-ignore)/gi,
				guidance:
					'Avoid using "any" type. Define specific types or interfaces for better type safety.',
				confidence: 0.9,
			},
			{
				id: 'typescript-assertion',
				name: 'Type Assertion',
				framework: 'typescript',
				category: 'testing',
				pattern: /as\s+\w+(?!\s*\/\/)/gi,
				guidance:
					'Use type assertions carefully. Consider type guards or proper typing instead.',
				confidence: 0.6,
			},
			{
				id: 'typescript-non-null-assertion',
				name: 'Non-null Assertion',
				framework: 'typescript',
				category: 'testing',
				pattern: /\w+!/gi,
				guidance:
					'Use non-null assertion (!) carefully. Consider optional chaining (?.) or proper null checks.',
				confidence: 0.7,
			},
		],
		node: [
			{
				id: 'node-unhandled-promise',
				name: 'Unhandled Promise',
				framework: 'node',
				category: 'testing',
				pattern:
					/(?<!await\s)(?<!return\s)\w+\([^)]*\)(?:\.[^(]*\([^)]*\))*(?!\s*\.catch)/gi,
				guidance:
					'Handle promises properly with await, .then(), or .catch() to prevent unhandled rejections.',
				confidence: 0.6,
			},
			{
				id: 'node-sync-operations',
				name: 'Synchronous File Operations',
				framework: 'node',
				category: 'performance',
				pattern: /fs\.\w+Sync\(/gi,
				guidance:
					'Consider using asynchronous file operations for better performance in Node.js applications.',
				confidence: 0.8,
			},
			{
				id: 'node-console-production',
				name: 'Console Logs in Production',
				framework: 'node',
				category: 'testing',
				pattern: /console\.(log|warn|error|info)(?!\s*\/\/.*debug)/gi,
				guidance:
					'Consider using proper logging library instead of console.* for production applications.',
				confidence: 0.7,
			},
		],
		express: [
			{
				id: 'express-no-error-handling',
				name: 'Missing Error Handling',
				framework: 'express',
				category: 'testing',
				pattern: /app\.\w+\([^)]*,\s*\([^)]*\)\s*=>\s*{(?![^}]*catch)/gi,
				guidance:
					'Add proper error handling to Express routes using try-catch or error middleware.',
				confidence: 0.8,
			},
			{
				id: 'express-middleware-order',
				name: 'Middleware Order',
				framework: 'express',
				category: 'testing',
				pattern: /app\.use\(.*cors.*\)[\s\S]*app\.use\(.*helmet.*\)/gi,
				guidance:
					'Security middleware like helmet should be applied before CORS for proper protection.',
				confidence: 0.6,
			},
		],
		next: [
			{
				id: 'next-image-optimization',
				name: 'Image Optimization',
				framework: 'next',
				category: 'performance',
				pattern: /<img\s+src=/gi,
				guidance:
					'Use Next.js Image component for automatic optimization, lazy loading, and responsive images.',
				confidence: 0.9,
			},
			{
				id: 'next-head-tags',
				name: 'Head Tag Usage',
				framework: 'next',
				category: 'testing',
				pattern: /<head>/gi,
				guidance:
					'Use Next.js Head component instead of HTML head tag for proper SSR support.',
				confidence: 0.8,
			},
			{
				id: 'next-api-routes',
				name: 'API Route Structure',
				framework: 'next',
				category: 'testing',
				pattern:
					/export\s+default\s+function\s+\w+\s*\([^)]*req[^)]*res[^)]*\)/gi,
				guidance:
					'Consider using Next.js API route helpers and proper HTTP method handling.',
				confidence: 0.7,
			},
		],
		vue: [
			{
				id: 'vue-reactive-mutation',
				name: 'Direct Reactive Mutation',
				framework: 'vue',
				category: 'state-management',
				pattern: /this\.\$data\.\w+\s*=/gi,
				guidance:
					"Avoid direct mutation of reactive data. Use Vue's reactivity system properly.",
				confidence: 0.8,
			},
			{
				id: 'vue-key-directive',
				name: 'Missing v-key Directive',
				framework: 'vue',
				category: 'performance',
				pattern: /<\w+\s+v-for="[^"]*"[^>]*(?![^>]*:key)[^>]*>/gi,
				guidance:
					'Add :key directive to v-for elements for optimal rendering performance.',
				confidence: 0.9,
			},
		],
		unknown: [],
	};

	/**
	 * Get context patterns for a specific framework
	 */
	getPatterns(framework: ProjectType['framework']): ContextPattern[] {
		return this.patterns[framework] || [];
	}

	/**
	 * Get all patterns across all frameworks
	 */
	getAllPatterns(): ContextPattern[] {
		return Object.values(this.patterns).flat();
	}

	/**
	 * Get patterns by category
	 */
	getPatternsByCategory(
		framework: ProjectType['framework'],
		category: ContextPattern['category'],
	): ContextPattern[] {
		return this.getPatterns(framework).filter(p => p.category === category);
	}

	/**
	 * Test patterns against given text and return matches
	 */
	testPatterns(
		text: string,
		framework: ProjectType['framework'],
	): Array<{pattern: ContextPattern; matches: RegExpMatchArray[]}> {
		const patterns = this.getPatterns(framework);
		const results: Array<{
			pattern: ContextPattern;
			matches: RegExpMatchArray[];
		}> = [];

		for (const pattern of patterns) {
			const matches = Array.from(text.matchAll(pattern.pattern));
			if (matches.length > 0) {
				results.push({pattern, matches});
			}
		}

		return results.sort((a, b) => b.pattern.confidence - a.pattern.confidence);
	}

	/**
	 * Add custom pattern for a framework
	 */
	addPattern(
		framework: ProjectType['framework'],
		pattern: ContextPattern,
	): void {
		if (!this.patterns[framework]) {
			this.patterns[framework] = [];
		}
		this.patterns[framework].push(pattern);
		console.log(`✅ Added custom pattern '${pattern.name}' for ${framework}`);
	}

	/**
	 * Remove pattern by ID
	 */
	removePattern(
		framework: ProjectType['framework'],
		patternId: string,
	): boolean {
		const patterns = this.patterns[framework];
		if (!patterns) return false;

		const index = patterns.findIndex(p => p.id === patternId);
		if (index === -1) return false;

		patterns.splice(index, 1);
		console.log(`🗑️ Removed pattern '${patternId}' from ${framework}`);
		return true;
	}

	/**
	 * Update pattern configuration
	 */
	updatePattern(
		framework: ProjectType['framework'],
		patternId: string,
		updates: Partial<ContextPattern>,
	): boolean {
		const patterns = this.patterns[framework];
		if (!patterns) return false;

		const pattern = patterns.find(p => p.id === patternId);
		if (!pattern) return false;

		Object.assign(pattern, updates);
		console.log(`🔄 Updated pattern '${patternId}' for ${framework}`);
		return true;
	}

	/**
	 * Get pattern statistics
	 */
	getStats(): Record<ProjectType['framework'], number> {
		const stats: Record<string, number> = {};

		for (const [framework, patterns] of Object.entries(this.patterns)) {
			stats[framework] = patterns.length;
		}

		return stats as Record<ProjectType['framework'], number>;
	}
}

// Export singleton instance
export const contextPatterns = new ContextPatterns();
