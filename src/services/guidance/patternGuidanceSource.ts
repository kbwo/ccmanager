import type {
	GuidanceSource,
	AnalysisContext,
	GuidanceResult,
	AutopilotConfig,
	PatternConfig,
} from '../../types/index.js';
import {PatternDetector} from './patternDetector.js';
import {GuidanceThrottler} from './guidanceThrottler.js';
import {PatternLibrary} from './patternLibrary.js';

/**
 * Fast pattern-based guidance source - first pass analysis before LLM
 * Implements GuidanceSource interface with priority 10 (higher than LLM)
 */
export class PatternGuidanceSource implements GuidanceSource {
	readonly id = 'pattern-detection';
	readonly priority = 10; // Higher priority than LLM (runs first)
	readonly canShortCircuit = true; // Can bypass LLM for critical patterns

	private detector: PatternDetector;
	private throttler: GuidanceThrottler;
	private config: PatternConfig;

	constructor(autopilotConfig: AutopilotConfig) {
		// Initialize with default config if not provided
		this.config = autopilotConfig.patterns || {
			enabled: true,
			...PatternLibrary.getDefaultConfig(),
		};

		// Initialize detector with enabled categories
		const enabledCategories = Object.entries(this.config.categories)
			.filter(([_, enabled]) => enabled)
			.map(([category, _]) => category as any);

		this.detector = new PatternDetector(
			enabledCategories,
			this.config.sensitivity,
		);

		// Initialize throttler
		this.throttler = new GuidanceThrottler(
			this.config.throttling.maxGuidancesPerHour,
			this.config.throttling.minSpacingMs,
			this.config.throttling.patternRepeatLimit,
			this.config.throttling.criticalBypassThrottling,
		);

		console.log(
			`🔌 Pattern guidance source initialized with ${enabledCategories.length} enabled categories`,
		);
	}

	/**
	 * Analyze context for pattern-based guidance
	 */
	async analyze(context: AnalysisContext): Promise<GuidanceResult> {
		if (!this.config.enabled) {
			return this.createNoGuidanceResult('Pattern detection disabled');
		}

		const startTime = Date.now();

		try {
			// Detect patterns in terminal output
			const matches = await this.detector.detectPatterns(context);

			if (matches.length === 0) {
				const duration = Date.now() - startTime;
				console.log(
					`⚡ Pattern analysis completed in ${duration.toFixed(2)}ms: no patterns detected`,
				);
				return this.createNoGuidanceResult('No patterns detected');
			}

			// Find the best pattern match
			const bestMatch = matches[0]; // Already sorted by priority and confidence

			if (!bestMatch) {
				const duration = Date.now() - startTime;
				console.log(
					`⚡ Pattern analysis completed in ${duration.toFixed(2)}ms: no valid pattern matches`,
				);
				return this.createNoGuidanceResult('No valid pattern matches');
			}

			// Check throttling
			const throttleCheck = this.throttler.canProvideGuidance(
				bestMatch.pattern,
			);
			if (!throttleCheck.allowed) {
				const duration = Date.now() - startTime;
				console.log(
					`⚡ Pattern analysis completed in ${duration.toFixed(2)}ms: throttled (${throttleCheck.reason})`,
				);
				return this.createNoGuidanceResult(
					`Throttled: ${throttleCheck.reason}`,
				);
			}

			// Record guidance provision
			this.throttler.recordGuidanceProvided(bestMatch.pattern);

			const duration = Date.now() - startTime;
			console.log(
				`⚡ Pattern analysis completed in ${duration.toFixed(2)}ms: providing guidance from pattern ${bestMatch.pattern.id}`,
			);

			// Create guidance result
			return {
				shouldIntervene: true,
				confidence: bestMatch.confidence,
				guidance: bestMatch.pattern.guidance,
				reasoning: `Pattern detected: ${bestMatch.pattern.name} - ${bestMatch.pattern.description}`,
				source: this.id,
				priority: this.priority,
				metadata: {
					patternId: bestMatch.pattern.id,
					patternCategory: bestMatch.pattern.category,
					patternPriority: bestMatch.pattern.priority,
					matchCount: bestMatch.matches.length,
					detectionTime: duration,
					allMatches: matches.map(m => ({
						id: m.pattern.id,
						confidence: m.confidence,
						category: m.pattern.category,
						priority: m.pattern.priority,
					})),
				},
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			console.log(
				`❌ Pattern analysis failed in ${duration.toFixed(2)}ms:`,
				error,
			);

			return {
				shouldIntervene: false,
				confidence: 0,
				guidance: undefined,
				reasoning: `Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`,
				source: this.id,
				priority: this.priority,
				metadata: {
					error: true,
					errorMessage: error instanceof Error ? error.message : String(error),
					detectionTime: duration,
				},
			};
		}
	}

	/**
	 * Update configuration
	 */
	updateConfig(autopilotConfig: AutopilotConfig): void {
		if (!autopilotConfig.patterns) {
			return;
		}

		this.config = autopilotConfig.patterns;

		// Update detector
		const enabledCategories = Object.entries(this.config.categories)
			.filter(([_, enabled]) => enabled)
			.map(([category, _]) => category as any);

		this.detector.updateEnabledCategories(enabledCategories);
		this.detector.updateSensitivityThresholds(this.config.sensitivity);

		// Update throttler
		this.throttler.updateConfig(this.config.throttling);

		console.log(`🔄 Pattern guidance source config updated`);
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
	 * Get debug information
	 */
	getDebugInfo(): object {
		return {
			id: this.id,
			priority: this.priority,
			canShortCircuit: this.canShortCircuit,
			config: this.config,
			detectorStats: this.detector.getDetectionStats(),
			throttlerStatus: this.throttler.getThrottlingStatus(),
			throttlerStatsByCategory: this.throttler.getThrottlingStatsByCategory(),
		};
	}

	/**
	 * Test pattern detection performance
	 */
	async benchmarkPerformance(sampleOutput: string): Promise<{
		duration: number;
		matchCount: number;
		patternsTested: number;
		performanceMet: boolean; // Whether < 10ms target was met
	}> {
		const result = await this.detector.benchmarkDetection(sampleOutput);
		return {
			...result,
			performanceMet: result.duration < 10, // PR#3 requirement: < 10ms
		};
	}

	/**
	 * Reset throttling state (useful for testing)
	 */
	resetThrottling(): void {
		this.throttler.reset();
	}

	/**
	 * Get pattern library information
	 */
	getPatternLibraryInfo(): {
		totalPatterns: number;
		enabledPatterns: number;
		categoryCounts: Record<string, number>;
	} {
		const allPatterns = PatternLibrary.getAllPatterns();
		const enabledPatterns = PatternLibrary.getEnabledPatterns();

		const categoryCounts: Record<string, number> = {};
		allPatterns.forEach(pattern => {
			categoryCounts[pattern.category] =
				(categoryCounts[pattern.category] || 0) + 1;
		});

		return {
			totalPatterns: allPatterns.length,
			enabledPatterns: enabledPatterns.length,
			categoryCounts,
		};
	}

	/**
	 * Validate that patterns meet performance requirements
	 */
	async validatePerformanceRequirements(): Promise<{
		passed: boolean;
		averageTime: number;
		maxTime: number;
		testCount: number;
		details: Array<{
			test: string;
			duration: number;
			passed: boolean;
		}>;
	}> {
		// Sample test cases for performance validation
		const testCases = [
			'Error: Command not found\nError: File does not exist\nSyntaxError: Unexpected token',
			'console.log("debug"); console.log("test"); console.log("more debug");',
			'Let me try again. Let me try a different approach. Let me try once more.',
			'TODO: Fix this\n# TODO: Add feature\n// TODO: Refactor',
			'$ npm install\n$ npm install\n$ npm install\n$ npm install',
		];

		const results: Array<{test: string; duration: number; passed: boolean}> =
			[];
		let totalTime = 0;
		let maxTime = 0;

		for (let i = 0; i < testCases.length; i++) {
			const testCase = testCases[i]!;
			const benchmark = await this.benchmarkPerformance(testCase);

			const passed = benchmark.performanceMet;
			results.push({
				test: `Test case ${i + 1}`,
				duration: benchmark.duration,
				passed,
			});

			totalTime += benchmark.duration;
			maxTime = Math.max(maxTime, benchmark.duration);
		}

		const averageTime = totalTime / testCases.length;
		const allPassed = results.every(r => r.passed);

		return {
			passed: allPassed && averageTime < 10,
			averageTime,
			maxTime,
			testCount: testCases.length,
			details: results,
		};
	}
}
