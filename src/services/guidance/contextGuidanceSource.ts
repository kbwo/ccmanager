import type {
	GuidanceSource,
	AnalysisContext,
	GuidanceResult,
	AutopilotConfig,
	ProjectContext,
} from '../../types/index.js';
import {contextBuilder} from '../contextBuilder.js';
import {contextPatterns} from '../contextPatterns.js';

/**
 * Context-aware guidance source that provides framework-specific guidance
 * Priority: 1 (higher than pattern detection, lower than critical patterns)
 */
export class ContextGuidanceSource implements GuidanceSource {
	readonly id = 'context-aware';
	readonly priority = 1;
	readonly canShortCircuit = true;

	private config: AutopilotConfig;

	constructor(config: AutopilotConfig) {
		this.config = config;
	}

	async analyze(context: AnalysisContext): Promise<GuidanceResult> {
		console.log(
			`🎯 Context-aware analysis starting for ${context.projectPath || 'unknown path'}`,
		);

		// Check if context awareness is enabled
		if (!this.config.context?.enabled) {
			return this.createNoGuidanceResult('Context awareness disabled');
		}

		const startTime = Date.now();

		try {
			// Get or build project context
			let projectContext = context.projectContext;
			if (!projectContext && context.projectPath) {
				projectContext = await contextBuilder.buildProjectContext(
					context.projectPath,
				);
			}

			if (!projectContext) {
				return this.createNoGuidanceResult('No project context available');
			}

			// Test framework-specific patterns against terminal output
			const patternMatches = contextPatterns.testPatterns(
				context.terminalOutput,
				projectContext.projectType.framework,
			);

			if (patternMatches.length === 0) {
				const duration = Date.now() - startTime;
				console.log(`ℹ️ Context-aware: no patterns matched (${duration}ms)`);
				return this.createNoGuidanceResult('No context patterns matched');
			}

			// Choose the highest confidence match
			const bestMatch = patternMatches[0];
			if (!bestMatch) {
				return this.createNoGuidanceResult('No valid pattern matches found');
			}
			const pattern = bestMatch.pattern;
			const matchCount = bestMatch.matches.length;

			// Calculate confidence based on pattern confidence and match context
			const baseConfidence = pattern.confidence;
			const contextBonus = this.calculateContextBonus(projectContext);
			const finalConfidence = Math.min(0.99, baseConfidence + contextBonus);

			const duration = Date.now() - startTime;
			console.log(
				`✅ Context-aware match: ${pattern.name} (${matchCount} matches, confidence: ${finalConfidence}) in ${duration}ms`,
			);

			// Create enhanced guidance with context information
			const enhancedGuidance = this.enhanceGuidanceWithContext(
				pattern.guidance,
				projectContext,
				matchCount,
			);

			return {
				shouldIntervene: true,
				confidence: finalConfidence,
				guidance: enhancedGuidance,
				reasoning: `Framework-specific guidance for ${projectContext.projectType.framework}: ${pattern.name} (${matchCount} matches)`,
				source: this.id,
				priority: this.priority,
				metadata: {
					framework: projectContext.projectType.framework,
					language: projectContext.projectType.language,
					patternId: pattern.id,
					patternCategory: pattern.category,
					matchCount,
					contextBonus,
				},
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			console.log(`❌ Context-aware analysis error (${duration}ms):`, error);

			return {
				shouldIntervene: false,
				confidence: 0,
				guidance: undefined,
				reasoning: `Context analysis failed: ${error instanceof Error ? error.message : String(error)}`,
				source: this.id,
				priority: this.priority,
				metadata: {error: true},
			};
		}
	}

	/**
	 * Calculate confidence bonus based on project context richness
	 */
	private calculateContextBonus(projectContext: ProjectContext): number {
		let bonus = 0;

		// Framework detection confidence
		if (projectContext.projectType.framework !== 'unknown') {
			bonus += 0.1;
		}

		// Language detection confidence
		if (projectContext.projectType.language !== 'unknown') {
			bonus += 0.05;
		}

		// Package info availability
		if (projectContext.packageInfo) {
			bonus += 0.05;
		}

		// Git status availability
		if (projectContext.gitStatus) {
			bonus += 0.02;
		}

		// Recent files availability
		if (projectContext.recentFiles.length > 0) {
			bonus += 0.03;
		}

		return Math.min(0.25, bonus); // Cap at 0.25 bonus
	}

	/**
	 * Enhance guidance with project context information
	 */
	private enhanceGuidanceWithContext(
		baseGuidance: string,
		projectContext: ProjectContext,
		matchCount: number,
	): string {
		const framework = projectContext.projectType.framework;
		const language = projectContext.projectType.language;
		const testFramework = projectContext.projectType.testFramework;

		let enhancedGuidance = baseGuidance;

		// Add framework-specific context
		if (framework !== 'unknown') {
			enhancedGuidance += ` This is a ${framework}`;
			if (language !== 'unknown' && language !== framework) {
				enhancedGuidance += `/${language}`;
			}
			enhancedGuidance += ' project.';
		}

		// Add test framework suggestion if relevant
		if (testFramework && baseGuidance.toLowerCase().includes('test')) {
			enhancedGuidance += ` Consider using ${testFramework} for testing.`;
		}

		// Add urgency based on match count
		if (matchCount > 3) {
			enhancedGuidance += ` (Found ${matchCount} instances - consider addressing systematically)`;
		} else if (matchCount > 1) {
			enhancedGuidance += ` (Found ${matchCount} instances)`;
		}

		return enhancedGuidance;
	}

	/**
	 * Create a "no guidance" result
	 */
	private createNoGuidanceResult(reasoning: string): GuidanceResult {
		return {
			shouldIntervene: false,
			confidence: 0,
			guidance: undefined,
			reasoning,
			source: this.id,
			priority: this.priority,
			metadata: {
				noGuidanceReason: reasoning,
			},
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: AutopilotConfig): void {
		this.config = config;
		console.log('🔄 Updated configuration for context-aware guidance source');
	}

	/**
	 * Check if context-aware guidance is available
	 */
	isAvailable(): boolean {
		return !!this.config.context?.enabled;
	}

	/**
	 * Get debug information
	 */
	getDebugInfo(): object {
		return {
			id: this.id,
			priority: this.priority,
			canShortCircuit: this.canShortCircuit,
			isAvailable: this.isAvailable(),
			config: {
				contextEnabled: this.config.context?.enabled,
				frameworkDetection: this.config.context?.frameworkDetection,
				gitIntegration: this.config.context?.gitIntegration,
			},
			patternStats: contextPatterns.getStats(),
			cacheStats: contextBuilder.getCacheStats(),
		};
	}
}
