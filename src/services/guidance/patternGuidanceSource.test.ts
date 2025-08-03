import {describe, it, expect, beforeEach} from 'vitest';
import {PatternGuidanceSource} from './patternGuidanceSource.js';
import {PatternLibrary} from './patternLibrary.js';
import type {AutopilotConfig, AnalysisContext} from '../../types/index.js';

describe('PatternGuidanceSource', () => {
	let source: PatternGuidanceSource;
	let config: AutopilotConfig;

	beforeEach(() => {
		config = {
			enabled: true,
			provider: 'openai',
			model: 'gpt-4',
			maxGuidancesPerHour: 3,
			analysisDelayMs: 1000,
			interventionThreshold: 0.5,
			apiKeys: {},
			patterns: {
				enabled: true,
				...PatternLibrary.getDefaultConfig(),
			},
		};

		source = new PatternGuidanceSource(config);
	});

	describe('GuidanceSource Interface', () => {
		it('should implement GuidanceSource interface correctly', () => {
			expect(source.id).toBe('pattern-detection');
			expect(source.priority).toBe(10); // Higher priority than LLM
			expect(source.canShortCircuit).toBe(true);
			expect(typeof source.analyze).toBe('function');
		});
	});

	describe('analyze', () => {
		it('should return no guidance when patterns disabled', async () => {
			// Disable pattern detection
			const disabledConfig = {
				...config,
				patterns: {
					...config.patterns!,
					enabled: false,
				},
			};
			source.updateConfig(disabledConfig);

			const context: AnalysisContext = {
				terminalOutput: 'Error: Test error',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await source.analyze(context);
			expect(result.shouldIntervene).toBe(false);
			expect(result.reasoning).toBe('Pattern detection disabled');
		});

		it('should detect and provide guidance for error patterns', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: Command not found
SyntaxError: Unexpected token
Failed to compile
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await source.analyze(context);
			expect(result.shouldIntervene).toBe(true);
			expect(result.confidence).toBeGreaterThan(0.5);
			expect(result.guidance).toBeTruthy();
			expect(result.source).toBe('pattern-detection');
			expect(result.metadata?.patternCategory).toBe('error_detection');
		});

		it('should include metadata about pattern matches', async () => {
			const context: AnalysisContext = {
				terminalOutput: 'Error: Test error message',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await source.analyze(context);

			if (result.shouldIntervene) {
				expect(result.metadata).toBeDefined();
				expect(result.metadata?.patternId).toBeTruthy();
				expect(result.metadata?.patternCategory).toBeTruthy();
				expect(result.metadata?.patternPriority).toBeTruthy();
				expect(result.metadata?.matchCount).toBeGreaterThan(0);
				expect(result.metadata?.detectionTime).toBeGreaterThan(0);
				expect(Array.isArray(result.metadata?.allMatches)).toBe(true);
			}
		});

		it('should respect throttling limits', async () => {
			const context: AnalysisContext = {
				terminalOutput: 'console.log("debug");',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			// First analysis might provide guidance
			const result1 = await source.analyze(context);

			if (result1.shouldIntervene) {
				// Immediately analyze again - should be throttled
				const result2 = await source.analyze(context);
				expect(result2.shouldIntervene).toBe(false);
				expect(result2.reasoning).toContain('Throttled');
			}
		});

		it('should return no guidance for clean output', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
$ ls -la
total 64
drwxr-xr-x  12 user  staff   384 Jan  1 12:00 .
-rw-r--r--   1 user  staff  1234 Jan  1 12:00 README.md
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await source.analyze(context);
			expect(result.shouldIntervene).toBe(false);
			expect(result.reasoning).toBe('No patterns detected');
		});

		it('should handle analysis errors gracefully', async () => {
			// Create a context that might cause issues
			const context: AnalysisContext = {
				terminalOutput: 'a'.repeat(1000000), // Very large output
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await source.analyze(context);

			// Should not throw, should return a valid result
			expect(result).toBeDefined();
			expect(result.source).toBe('pattern-detection');
			expect(typeof result.shouldIntervene).toBe('boolean');
			expect(typeof result.confidence).toBe('number');
		});

		it('should complete analysis quickly (< 50ms for test tolerance)', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: Test error
console.log("debug");
$ npm install
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const startTime = Date.now();
			await source.analyze(context);
			const duration = Date.now() - startTime;

			// Should be fast - using 50ms tolerance for test environment
			expect(duration).toBeLessThan(50);
		});
	});

	describe('updateConfig', () => {
		it('should update configuration correctly', () => {
			const newConfig = {
				...config,
				patterns: {
					enabled: false,
					categories: {
						...config.patterns!.categories,
						error_detection: false,
					},
					throttling: {
						...config.patterns!.throttling,
						maxGuidancesPerHour: 5,
					},
					sensitivity: {
						...config.patterns!.sensitivity,
						critical: 0.2,
					},
				},
			};

			source.updateConfig(newConfig);

			const debugInfo = source.getDebugInfo() as any;
			expect(debugInfo.config.enabled).toBe(false);
			expect(debugInfo.config.categories.error_detection).toBe(false);
			expect(debugInfo.config.throttling.maxGuidancesPerHour).toBe(5);
			expect(debugInfo.config.sensitivity.critical).toBe(0.2);
		});

		it('should handle config without patterns gracefully', () => {
			const configWithoutPatterns = {
				...config,
				patterns: undefined,
			};

			// Should not throw
			expect(() => {
				source.updateConfig(configWithoutPatterns);
			}).not.toThrow();
		});
	});

	describe('getDebugInfo', () => {
		it('should return comprehensive debug information', () => {
			const debugInfo = source.getDebugInfo() as any;

			expect(debugInfo.id).toBe('pattern-detection');
			expect(debugInfo.priority).toBe(10);
			expect(debugInfo.canShortCircuit).toBe(true);
			expect(debugInfo.config).toBeDefined();
			expect(debugInfo.detectorStats).toBeDefined();
			expect(debugInfo.throttlerStatus).toBeDefined();
			expect(debugInfo.throttlerStatsByCategory).toBeDefined();
		});
	});

	describe('benchmarkPerformance', () => {
		it('should provide accurate performance benchmarks', async () => {
			const sampleOutput = `
Error: Test error
console.log("debug1");
console.log("debug2");
console.log("debug3");
$ npm install
$ npm install
$ npm install
			`;

			const benchmark = await source.benchmarkPerformance(sampleOutput);

			expect(benchmark).toHaveProperty('duration');
			expect(benchmark).toHaveProperty('matchCount');
			expect(benchmark).toHaveProperty('patternsTested');
			expect(benchmark).toHaveProperty('performanceMet');

			expect(typeof benchmark.duration).toBe('number');
			expect(typeof benchmark.matchCount).toBe('number');
			expect(typeof benchmark.patternsTested).toBe('number');
			expect(typeof benchmark.performanceMet).toBe('boolean');

			expect(benchmark.duration).toBeGreaterThan(0);
			expect(benchmark.patternsTested).toBeGreaterThan(0);
		});

		it('should meet performance requirements for simple output', async () => {
			const simpleOutput = 'Simple output without patterns';
			const benchmark = await source.benchmarkPerformance(simpleOutput);

			// For simple cases, should easily meet the 10ms requirement
			expect(benchmark.performanceMet).toBe(true);
		});
	});

	describe('resetThrottling', () => {
		it('should reset throttling state', async () => {
			const context: AnalysisContext = {
				terminalOutput: 'console.log("debug");',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			// Trigger throttling
			await source.analyze(context);

			// Reset and try again
			source.resetThrottling();
			const result = await source.analyze(context);

			// Should be able to provide guidance again (if pattern matches)
			const debugInfo = source.getDebugInfo() as any;
			expect(debugInfo.throttlerStatus.guidanceCountThisHour).toBe(0);
		});
	});

	describe('getPatternLibraryInfo', () => {
		it('should return pattern library statistics', () => {
			const info = source.getPatternLibraryInfo();

			expect(info).toHaveProperty('totalPatterns');
			expect(info).toHaveProperty('enabledPatterns');
			expect(info).toHaveProperty('categoryCounts');

			expect(typeof info.totalPatterns).toBe('number');
			expect(typeof info.enabledPatterns).toBe('number');
			expect(typeof info.categoryCounts).toBe('object');

			expect(info.totalPatterns).toBeGreaterThan(0);
			expect(info.enabledPatterns).toBeGreaterThan(0);
		});
	});

	describe('validatePerformanceRequirements', () => {
		it('should validate that patterns meet performance requirements', async () => {
			const validation = await source.validatePerformanceRequirements();

			expect(validation).toHaveProperty('passed');
			expect(validation).toHaveProperty('averageTime');
			expect(validation).toHaveProperty('maxTime');
			expect(validation).toHaveProperty('testCount');
			expect(validation).toHaveProperty('details');

			expect(typeof validation.passed).toBe('boolean');
			expect(typeof validation.averageTime).toBe('number');
			expect(typeof validation.maxTime).toBe('number');
			expect(typeof validation.testCount).toBe('number');
			expect(Array.isArray(validation.details)).toBe(true);

			expect(validation.testCount).toBeGreaterThan(0);
			expect(validation.averageTime).toBeGreaterThan(0);

			// Each test should have required properties
			validation.details.forEach(detail => {
				expect(detail).toHaveProperty('test');
				expect(detail).toHaveProperty('duration');
				expect(detail).toHaveProperty('passed');
				expect(typeof detail.duration).toBe('number');
				expect(typeof detail.passed).toBe('boolean');
			});
		});

		it('should have reasonable performance for pattern detection', async () => {
			const validation = await source.validatePerformanceRequirements();

			// Average time should be well under the 10ms target in most cases
			// Using higher tolerance for test environment
			expect(validation.averageTime).toBeLessThan(20);
		});
	});

	describe('Integration with Pattern Categories', () => {
		it('should respect disabled categories', async () => {
			// Disable error detection category
			const restrictedConfig = {
				...config,
				patterns: {
					...config.patterns!,
					categories: {
						...config.patterns!.categories,
						error_detection: false,
					},
				},
			};
			source.updateConfig(restrictedConfig);

			const context: AnalysisContext = {
				terminalOutput: 'Error: This should not trigger guidance',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await source.analyze(context);

			// Should not detect error patterns since category is disabled
			if (result.shouldIntervene) {
				expect(result.metadata?.patternCategory).not.toBe('error_detection');
			}
		});

		it('should prioritize critical patterns correctly', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: Critical error here
console.log("debug");
TODO: Fix this later
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await source.analyze(context);

			if (result.shouldIntervene) {
				// Should prioritize the critical error pattern
				expect(result.metadata?.patternPriority).toBe('critical');
			}
		});
	});
});
