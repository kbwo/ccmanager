import type {
	DetectionPattern,
	PatternMatch,
	PatternCategory,
	PatternPriority,
	AnalysisContext,
} from '../../types/index.js';
import {PatternLibrary} from './patternLibrary.js';

/**
 * Fast pattern detector for common Claude Code issues
 * Optimized for < 10ms detection time
 */
export class PatternDetector {
	private enabledCategories: Set<PatternCategory>;
	private sensitivityThresholds: Record<PatternPriority, number>;

	constructor(
		enabledCategories: PatternCategory[] = [],
		sensitivityThresholds: Record<
			PatternPriority,
			number
		> = PatternLibrary.getDefaultConfig().sensitivity,
	) {
		this.enabledCategories = new Set(enabledCategories);
		this.sensitivityThresholds = sensitivityThresholds;
	}

	/**
	 * Detect patterns in terminal output with performance tracking
	 */
	async detectPatterns(context: AnalysisContext): Promise<PatternMatch[]> {
		const startTime = Date.now();

		try {
			const patterns = this.getActivePatterns();
			const matches: PatternMatch[] = [];

			// Process each pattern
			for (const pattern of patterns) {
				const patternMatches = this.testPattern(
					pattern,
					context.terminalOutput,
				);
				if (patternMatches.length > 0) {
					const match = this.createPatternMatch(pattern, patternMatches);

					// Check if match meets confidence threshold
					if (this.meetsConfidenceThreshold(match)) {
						matches.push(match);
					}
				}
			}

			const endTime = Date.now();
			const duration = endTime - startTime;

			console.log(
				`🔍 Pattern detection completed in ${duration.toFixed(2)}ms, found ${matches.length} matches`,
			);

			// Sort by priority (critical first) and confidence
			return matches.sort((a, b) => {
				const priorityOrder = {critical: 0, high: 1, medium: 2, low: 3};
				const aPriority = priorityOrder[a.severity];
				const bPriority = priorityOrder[b.severity];

				if (aPriority !== bPriority) {
					return aPriority - bPriority;
				}
				return b.confidence - a.confidence;
			});
		} catch (error) {
			const endTime = Date.now();
			const duration = endTime - startTime;
			console.log(
				`❌ Pattern detection failed in ${duration.toFixed(2)}ms:`,
				error,
			);
			return [];
		}
	}

	/**
	 * Test a single pattern against terminal output
	 */
	private testPattern(
		pattern: DetectionPattern,
		output: string,
	): RegExpMatchArray[] {
		try {
			// Reset regex state for global patterns
			pattern.pattern.lastIndex = 0;

			const matches: RegExpMatchArray[] = [];
			let match: RegExpMatchArray | null;

			// Collect all matches for global patterns
			if (pattern.pattern.global) {
				while ((match = pattern.pattern.exec(output)) !== null) {
					matches.push(match);
					// Prevent infinite loops with zero-length matches
					if (match.index === pattern.pattern.lastIndex) {
						pattern.pattern.lastIndex++;
					}
				}
			} else {
				match = pattern.pattern.exec(output);
				if (match) {
					matches.push(match);
				}
			}

			// Check minimum match requirement
			const minMatches = pattern.minMatches || 1;
			return matches.length >= minMatches ? matches : [];
		} catch (error) {
			console.log(`❌ Error testing pattern ${pattern.id}:`, error);
			return [];
		}
	}

	/**
	 * Create a pattern match with confidence calculation
	 */
	private createPatternMatch(
		pattern: DetectionPattern,
		matches: RegExpMatchArray[],
	): PatternMatch {
		// Calculate confidence based on:
		// 1. Number of matches (more matches = higher confidence)
		// 2. Pattern priority (critical patterns get higher confidence)
		// 3. Match strength (length and context)

		const matchCount = matches.length;
		const priorityBonus = this.getPriorityBonus(pattern.priority);
		const matchStrength = this.calculateMatchStrength(matches);

		// Base confidence from match count (logarithmic scaling)
		const baseConfidence = Math.min(
			0.8,
			Math.log(matchCount + 1) / Math.log(10),
		);

		// Apply priority bonus and match strength
		const confidence = Math.min(
			1.0,
			baseConfidence + priorityBonus + matchStrength,
		);

		return {
			pattern,
			matches,
			confidence,
			timestamp: new Date(),
			severity: pattern.priority,
		};
	}

	/**
	 * Calculate match strength based on match characteristics
	 */
	private calculateMatchStrength(matches: RegExpMatchArray[]): number {
		if (matches.length === 0) return 0;

		// Average match length (longer matches generally more significant)
		const avgLength =
			matches.reduce((sum, match) => sum + match[0].length, 0) / matches.length;
		const lengthScore = Math.min(0.2, avgLength / 100); // Cap at 0.2

		// Spread of matches (matches spread throughout text more significant)
		const positions = matches.map(m => m.index || 0);
		const spread = Math.max(...positions) - Math.min(...positions);
		const spreadScore = spread > 1000 ? 0.1 : 0; // Bonus for widespread matches

		return lengthScore + spreadScore;
	}

	/**
	 * Get priority bonus for confidence calculation
	 */
	private getPriorityBonus(priority: PatternPriority): number {
		const bonuses = {
			critical: 0.3,
			high: 0.2,
			medium: 0.1,
			low: 0.05,
		};
		return bonuses[priority];
	}

	/**
	 * Check if match meets confidence threshold
	 */
	private meetsConfidenceThreshold(match: PatternMatch): boolean {
		const threshold = this.sensitivityThresholds[match.severity];
		return match.confidence >= threshold;
	}

	/**
	 * Get active patterns based on enabled categories
	 */
	private getActivePatterns(): DetectionPattern[] {
		return PatternLibrary.getEnabledPatterns().filter(pattern =>
			this.enabledCategories.has(pattern.category),
		);
	}

	/**
	 * Update enabled categories
	 */
	updateEnabledCategories(categories: PatternCategory[]): void {
		this.enabledCategories = new Set(categories);
		console.log(
			`🔄 Updated enabled pattern categories: ${categories.join(', ')}`,
		);
	}

	/**
	 * Update sensitivity thresholds
	 */
	updateSensitivityThresholds(
		thresholds: Record<PatternPriority, number>,
	): void {
		this.sensitivityThresholds = thresholds;
		console.log(`🔄 Updated sensitivity thresholds:`, thresholds);
	}

	/**
	 * Get detection statistics
	 */
	getDetectionStats(): {
		enabledCategories: string[];
		activePatternCount: number;
		sensitivityThresholds: Record<PatternPriority, number>;
	} {
		return {
			enabledCategories: Array.from(this.enabledCategories),
			activePatternCount: this.getActivePatterns().length,
			sensitivityThresholds: {...this.sensitivityThresholds},
		};
	}

	/**
	 * Test detection performance with sample input
	 */
	async benchmarkDetection(sampleOutput: string): Promise<{
		duration: number;
		matchCount: number;
		patternsTested: number;
	}> {
		const startTime = Date.now();

		const context: AnalysisContext = {
			terminalOutput: sampleOutput,
			sessionState: 'idle',
			worktreePath: '/test',
		};

		const matches = await this.detectPatterns(context);
		const endTime = Date.now();

		return {
			duration: endTime - startTime,
			matchCount: matches.length,
			patternsTested: this.getActivePatterns().length,
		};
	}
}
