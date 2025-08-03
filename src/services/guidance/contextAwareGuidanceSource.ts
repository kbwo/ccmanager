import type {
	GuidanceSource,
	AnalysisContext,
	GuidanceResult,
	ContextAwareConfig,
	AutopilotConfig,
} from '../../types/index.js';
import {ContextBuilder} from '../contextBuilder.js';
import {ContextPatterns, GuidancePattern} from '../contextPatterns.js';

/**
 * Context-aware guidance source that provides framework-specific, intelligent guidance
 * based on project structure, git status, and detected patterns
 */
export class ContextAwareGuidanceSource implements GuidanceSource {
	readonly id = 'context-aware';
	readonly priority = 5; // Higher priority than base LLM (10), lower than fast patterns
	readonly canShortCircuit = true; // Can short-circuit for high-confidence matches

	private contextBuilder: ContextBuilder;
	private contextPatterns: ContextPatterns;
	private config: ContextAwareConfig;

	constructor(config: AutopilotConfig) {
		this.config = this.getContextAwareConfig(config);
		this.contextBuilder = new ContextBuilder(this.config);
		this.contextPatterns = new ContextPatterns();
	}

	/**
	 * Analyze context and provide intelligent guidance
	 */
	async analyze(context: AnalysisContext): Promise<GuidanceResult> {
		if (!this.config.enabled) {
			return this.createNoGuidanceResult('Context-aware guidance disabled');
		}

		console.log(`🎯 Context-aware analysis for ${context.worktreePath}`);

		try {
			// Build project context
			const projectContext = await this.contextBuilder.buildProjectContext(
				context.worktreePath,
			);

			console.log(
				`📋 Project context: ${projectContext.projectType.framework}/${projectContext.projectType.language}`,
			);

			// Get framework-specific patterns
			const patterns = this.contextPatterns.getGuidancePatterns(
				projectContext,
				context.terminalOutput,
			);

			// Find matching patterns
			const matchedPatterns = this.findMatchingPatterns(
				patterns,
				context.terminalOutput,
			);

			if (matchedPatterns.length === 0) {
				return this.createNoGuidanceResult(
					'No context-specific patterns matched',
					projectContext,
				);
			}

			// Select best pattern (highest priority)
			const bestPattern = matchedPatterns[0];
			
			if (!bestPattern) {
				return this.createNoGuidanceResult(
					'No valid patterns found',
					projectContext,
				);
			}
			
			console.log(
				`🎯 Matched pattern: ${bestPattern.id} (priority: ${bestPattern.priority})`,
			);

			return {
				shouldIntervene: true,
				confidence: this.calculateConfidence(bestPattern, matchedPatterns.length),
				guidance: this.enhanceGuidance(bestPattern, projectContext),
				reasoning: `Framework-specific guidance for ${projectContext.projectType.framework} project: ${bestPattern.category}`,
				source: this.id,
				priority: this.priority,
				metadata: {
					framework: projectContext.projectType.framework,
					language: projectContext.projectType.language,
					patternId: bestPattern.id,
					patternCategory: bestPattern.category,
					matchedPatterns: matchedPatterns.length,
				},
			};
		} catch (error) {
			console.log(`❌ Context-aware analysis error:`, error);
			return {
				shouldIntervene: false,
				confidence: 0,
				reasoning: `Context analysis failed: ${error instanceof Error ? error.message : String(error)}`,
				source: this.id,
				priority: this.priority,
				metadata: {error: true},
			};
		}
	}

	/**
	 * Find patterns that match the terminal output
	 */
	private findMatchingPatterns(
		patterns: GuidancePattern[],
		output: string,
	): GuidancePattern[] {
		return patterns
			.filter(pattern => {
				const matches = pattern.pattern.test(output);
				if (matches) {
					console.log(`✅ Pattern matched: ${pattern.id}`);
				}
				return matches;
			})
			.sort((a, b) => b.priority - a.priority);
	}

	/**
	 * Calculate confidence based on pattern quality and context
	 */
	private calculateConfidence(
		pattern: GuidancePattern,
		totalMatches: number,
	): number {
		// Base confidence from pattern priority (0.5-0.9)
		const baseConfidence = Math.min(0.5 + (pattern.priority / 10) * 0.4, 0.9);

		// Boost confidence if multiple patterns match (indicates strong signal)
		const matchBoost = Math.min(totalMatches * 0.05, 0.1);

		// High priority patterns get extra confidence
		const priorityBoost = pattern.priority >= 8 ? 0.1 : 0;

		const finalConfidence = Math.min(
			baseConfidence + matchBoost + priorityBoost,
			0.95,
		);

		console.log(
			`🎯 Confidence calculation: base=${baseConfidence}, matches=${matchBoost}, priority=${priorityBoost}, final=${finalConfidence}`,
		);

		return finalConfidence;
	}

	/**
	 * Enhance guidance with project context
	 */
	private enhanceGuidance(pattern: GuidancePattern, projectContext: any): string {
		const contextSummary = this.contextPatterns.getContextSummary(projectContext);
		
		// Add context-specific enhancements based on pattern category
		let enhancedGuidance = pattern.guidance;

		switch (pattern.category) {
			case 'react-hooks':
				enhancedGuidance += ` (${projectContext.projectType.language} project)`;
				break;
			case 'typescript-types':
				enhancedGuidance += ` Consider using project-specific types or interfaces.`;
				break;
			case 'git-workflow':
				if (projectContext.gitStatus?.hasChanges) {
					enhancedGuidance += ` Current changes: ${projectContext.gitStatus.modifiedFiles.length} files.`;
				}
				break;
			case 'testing':
				if (projectContext.projectType.testFramework) {
					enhancedGuidance += ` (Using ${projectContext.projectType.testFramework})`;
				}
				break;
		}

		return enhancedGuidance;
	}

	/**
	 * Create no guidance result with context metadata
	 */
	private createNoGuidanceResult(
		reasoning: string,
		projectContext?: any,
	): GuidanceResult {
		return {
			shouldIntervene: false,
			confidence: 0,
			reasoning,
			source: this.id,
			priority: this.priority,
			metadata: {
				contextAvailable: !!projectContext,
				framework: projectContext?.projectType?.framework,
				language: projectContext?.projectType?.language,
			},
		};
	}

	/**
	 * Extract context-aware config from autopilot config
	 */
	private getContextAwareConfig(config: AutopilotConfig): ContextAwareConfig {
		// Default context-aware configuration
		const defaultConfig: ContextAwareConfig = {
			enabled: true,
			enableFrameworkDetection: true,
			enableGitIntegration: true,
			cacheIntervalMinutes: 5,
			frameworkPatterns: {},
		};

		// TODO: Integrate with main configuration system when UI is implemented
		// For now, use defaults with some config inference
		return {
			...defaultConfig,
			enabled: config.enabled, // Inherit from autopilot enabled state
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: AutopilotConfig): void {
		this.config = this.getContextAwareConfig(config);
		this.contextBuilder.updateConfig(this.config);
	}

	/**
	 * Check if guidance source is available
	 */
	isAvailable(): boolean {
		return this.config.enabled;
	}

	/**
	 * Get debug information
	 */
	getDebugInfo(): object {
		return {
			id: this.id,
			priority: this.priority,
			config: this.config,
			contextBuilder: this.contextBuilder.getDebugInfo(),
		};
	}
}