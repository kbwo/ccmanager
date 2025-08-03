import type {
	DetectionPattern,
	PatternCategory,
	PatternPriority,
} from '../../types/index.js';

/**
 * Curated library of patterns for detecting common Claude Code issues
 * Optimized for fast regex-based detection (< 10ms)
 */
export class PatternLibrary {
	private static patterns: DetectionPattern[] = [
		// Critical Error Patterns - Always bypass throttling
		{
			id: 'unhandled_error',
			name: 'Unhandled Error',
			description: 'Error messages being ignored or not addressed',
			category: 'error_detection',
			priority: 'critical',
			pattern: /Error:|Exception:|Failed:|❌|✗|ERROR/gi,
			guidance:
				'I notice there are errors in the output. Please review and address them before continuing.',
			enabled: true,
			minMatches: 2,
		},
		{
			id: 'command_not_found',
			name: 'Command Not Found',
			description: 'Command not found errors',
			category: 'error_detection',
			priority: 'critical',
			pattern:
				/command not found|No such file or directory|Permission denied/gi,
			guidance:
				'Command execution failed. Please check the command syntax and file permissions.',
			enabled: true,
		},
		{
			id: 'syntax_error',
			name: 'Syntax Error',
			description: 'Syntax errors in code',
			category: 'error_detection',
			priority: 'critical',
			pattern: /SyntaxError|ParseError|Unexpected token|Unexpected end/gi,
			guidance:
				'Syntax errors detected. Please review the code syntax and fix any issues.',
			enabled: true,
		},

		// Security Patterns - Critical priority
		{
			id: 'exposed_secrets',
			name: 'Exposed Secrets',
			description: 'Potential API keys or secrets in output',
			category: 'security',
			priority: 'critical',
			pattern:
				/(?:api[_-]?key|secret|token|password)\s*[=:]\s*['"]?[a-zA-Z0-9]{20,}/gi,
			guidance:
				'Potential secrets detected in output. Please review and ensure no sensitive data is exposed.',
			enabled: true,
		},

		// Repetitive Behavior Patterns
		{
			id: 'repetitive_commands',
			name: 'Repetitive Commands',
			description: 'Same command being repeated multiple times',
			category: 'repetitive_behavior',
			priority: 'high',
			pattern: /^(\$\s*\w+.*?)(\n\$\s*\1){2,}/gm,
			guidance:
				"I notice you're repeating similar commands. Consider a different approach or break this into smaller steps.",
			enabled: true,
			minMatches: 3,
			cooldownMs: 300000, // 5 minutes
		},
		{
			id: 'circular_logic',
			name: 'Circular Logic',
			description: 'Circular reasoning or going in loops',
			category: 'repetitive_behavior',
			priority: 'high',
			pattern:
				/(?:Let me try|I'll try|Let's try).*(?:again|once more|different approach).*(?:Let me try|I'll try|Let's try)/gis,
			guidance:
				'You seem to be going in circles. Try stepping back and considering a fundamentally different approach.',
			enabled: true,
			cooldownMs: 600000, // 10 minutes
		},

		// Overthinking Patterns
		{
			id: 'analysis_paralysis',
			name: 'Analysis Paralysis',
			description: 'Too much analysis without action',
			category: 'overthinking',
			priority: 'medium',
			pattern:
				/(?:Let me think|I need to consider|Let me analyze|I should check)(?:.*\n){10,}(?!.*\$|.*```)/gm,
			guidance:
				"You're analyzing a lot. Consider taking action with a simple first step.",
			enabled: true,
			cooldownMs: 900000, // 15 minutes
		},
		{
			id: 'excessive_planning',
			name: 'Excessive Planning',
			description: 'Too much planning without implementation',
			category: 'overthinking',
			priority: 'medium',
			pattern: /(?:plan|strategy|approach|steps)(?:.*\n){15,}(?!.*\$|.*```)/gim,
			guidance:
				'Great planning! Now consider implementing the first step to make progress.',
			enabled: true,
			cooldownMs: 900000, // 15 minutes
		},

		// Code Quality Patterns
		{
			id: 'debug_code_left',
			name: 'Debug Code Left Behind',
			description: 'Debug statements or console.log left in code',
			category: 'code_quality',
			priority: 'medium',
			pattern: /console\.log|debugger|print\(|puts |echo /gi,
			guidance:
				'Debug statements detected. Consider removing them before finalizing.',
			enabled: true,
			minMatches: 3,
		},
		{
			id: 'todo_comments',
			name: 'TODO Comments',
			description: 'Many TODO comments indicating incomplete work',
			category: 'code_quality',
			priority: 'low',
			pattern: /\/\/\s*TODO|#\s*TODO|\/\*\s*TODO/gi,
			guidance:
				'Multiple TODOs found. Consider addressing some of them before adding more features.',
			enabled: true,
			minMatches: 5,
		},
		{
			id: 'commented_code',
			name: 'Commented Out Code',
			description: 'Large blocks of commented code',
			category: 'code_quality',
			priority: 'low',
			pattern: /^(?:\/\/|#|\/\*).+$/gm,
			guidance:
				'Consider removing commented-out code blocks to keep the codebase clean.',
			enabled: true,
			minMatches: 10,
		},

		// Git Workflow Patterns
		{
			id: 'uncommitted_changes',
			name: 'Many Uncommitted Changes',
			description: 'Many files changed without committing',
			category: 'git_workflow',
			priority: 'medium',
			pattern: /modified:\s+.*\n(?:.*modified:\s+.*\n){5,}/gm,
			guidance:
				'You have many uncommitted changes. Consider committing your progress to avoid losing work.',
			enabled: true,
		},
		{
			id: 'merge_conflicts',
			name: 'Merge Conflicts',
			description: 'Merge conflict indicators in output',
			category: 'git_workflow',
			priority: 'high',
			pattern: /<<<<<<< |>>>>>>> |=======/gm,
			guidance:
				'Merge conflicts detected. Please resolve them before continuing.',
			enabled: true,
		},

		// Performance Patterns
		{
			id: 'slow_commands',
			name: 'Slow Running Commands',
			description: 'Commands taking a long time to execute',
			category: 'performance',
			priority: 'low',
			pattern:
				/(?:npm install|pip install|cargo build|mvn compile).*(?:\n.*){20,}/gm,
			guidance:
				'Long-running command detected. Consider using build caches or lighter alternatives if this becomes an issue.',
			enabled: true,
			cooldownMs: 1800000, // 30 minutes
		},
	];

	/**
	 * Get all available patterns
	 */
	static getAllPatterns(): DetectionPattern[] {
		return [...this.patterns];
	}

	/**
	 * Get patterns by category
	 */
	static getPatternsByCategory(category: PatternCategory): DetectionPattern[] {
		return this.patterns.filter(p => p.category === category);
	}

	/**
	 * Get patterns by priority
	 */
	static getPatternsByPriority(priority: PatternPriority): DetectionPattern[] {
		return this.patterns.filter(p => p.priority === priority);
	}

	/**
	 * Get enabled patterns only
	 */
	static getEnabledPatterns(): DetectionPattern[] {
		return this.patterns.filter(p => p.enabled);
	}

	/**
	 * Get pattern by ID
	 */
	static getPatternById(id: string): DetectionPattern | undefined {
		return this.patterns.find(p => p.id === id);
	}

	/**
	 * Add custom pattern
	 */
	static addCustomPattern(pattern: DetectionPattern): void {
		if (this.patterns.some(p => p.id === pattern.id)) {
			throw new Error(`Pattern with ID '${pattern.id}' already exists`);
		}
		this.patterns.push(pattern);
	}

	/**
	 * Update pattern enabled state
	 */
	static updatePatternEnabled(id: string, enabled: boolean): boolean {
		const pattern = this.patterns.find(p => p.id === id);
		if (pattern) {
			pattern.enabled = enabled;
			return true;
		}
		return false;
	}

	/**
	 * Get default pattern configuration
	 */
	static getDefaultConfig(): {
		categories: Record<PatternCategory, boolean>;
		throttling: {
			maxGuidancesPerHour: number;
			minSpacingMs: number;
			patternRepeatLimit: number;
			criticalBypassThrottling: boolean;
		};
		sensitivity: Record<PatternPriority, number>;
	} {
		return {
			categories: {
				repetitive_behavior: true,
				error_detection: true,
				overthinking: true,
				code_quality: true,
				git_workflow: true,
				security: true,
				performance: true,
			},
			throttling: {
				maxGuidancesPerHour: 3,
				minSpacingMs: 30000, // 30 seconds
				patternRepeatLimit: 2,
				criticalBypassThrottling: true,
			},
			sensitivity: {
				critical: 0.1, // Very sensitive - almost always trigger
				high: 0.3,
				medium: 0.5,
				low: 0.7,
			},
		};
	}
}
