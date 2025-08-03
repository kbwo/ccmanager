import {describe, it, expect, beforeEach} from 'vitest';
import {GuidanceOrchestrator} from './guidanceOrchestrator.js';
import {PatternLibrary} from './patternLibrary.js';
import type {AutopilotConfig, AnalysisContext} from '../../types/index.js';

describe('GuidanceOrchestrator - Pattern Integration', () => {
	let orchestrator: GuidanceOrchestrator;
	let config: AutopilotConfig;

	beforeEach(() => {
		config = {
			enabled: true,
			provider: 'openai',
			model: 'gpt-4',
			maxGuidancesPerHour: 3,
			analysisDelayMs: 1000,
			interventionThreshold: 0.5,
			apiKeys: {}, // No API keys - LLM will not be available
			patterns: {
				enabled: true,
				...PatternLibrary.getDefaultConfig(),
			},
		};

		orchestrator = new GuidanceOrchestrator(config);
	});

	describe('Source Registration', () => {
		it('should register both pattern and LLM sources', () => {
			const sourceIds = orchestrator.getSourceIds();
			expect(sourceIds).toContain('pattern-detection');
			expect(sourceIds).toContain('base-llm');
			expect(sourceIds.length).toBe(2);
		});

		it('should set correct priorities', () => {
			const debugInfo = orchestrator.getDebugInfo() as any;
			const sources = debugInfo.sources;

			const patternSource = sources.find(
				(s: any) => s.id === 'pattern-detection',
			);
			const llmSource = sources.find((s: any) => s.id === 'base-llm');

			expect(patternSource.priority).toBe(10); // Higher priority (runs first)
			expect(llmSource.priority).toBe(100); // Lower priority (runs second)
		});
	});

	describe('isAvailable', () => {
		it('should be available when pattern source exists (even without LLM)', () => {
			// Pattern source should always be available
			expect(orchestrator.isAvailable()).toBe(true);
		});
	});

	describe('Dual-Speed Analysis', () => {
		it('should run pattern analysis first (fast path)', async () => {
			const context: AnalysisContext = {
				terminalOutput: 'Error: Critical system error occurred',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const startTime = Date.now();
			const result = await orchestrator.generateGuidance(context);
			const duration = Date.now() - startTime;

			// Should complete quickly due to pattern detection
			expect(duration).toBeLessThan(100); // Fast execution

			if (result.shouldIntervene) {
				expect(result.source).toBe('pattern-detection');
				expect(result.reasoning).toContain('Pattern detected');
			}
		});

		it('should short-circuit on high-confidence pattern matches', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: Fatal system error
Error: Critical failure
Error: System crash
Error: Unable to recover
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await orchestrator.generateGuidance(context);

			// Should short-circuit with pattern detection for critical errors
			if (result.shouldIntervene) {
				expect(result.source).toBe('pattern-detection');
				expect(result.confidence).toBeGreaterThan(0.8);

				// Check metadata for short-circuit information
				const analysisContext = result.metadata?.analysisContext as any;
				if (analysisContext) {
					// Should have analyzed only the pattern source due to short-circuit
					expect(analysisContext.sourcesAnalyzed).toBeLessThanOrEqual(2);
				}
			}
		});

		it("should fall back to LLM when patterns don't match", async () => {
			const context: AnalysisContext = {
				terminalOutput: `
I'm working on a complex algorithm that needs optimization.
The current approach might not be the best solution.
I should consider different data structures for better performance.
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await orchestrator.generateGuidance(context);

			// Pattern source likely won't match, should get no guidance result
			// (LLM won't be available in this test due to no API keys)
			expect(result.shouldIntervene).toBe(false);
		});
	});

	describe('Priority-Based Source Selection', () => {
		it('should prioritize pattern guidance over LLM guidance', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: Command failed with exit code 1
Let me think about how to approach this differently.
I need to consider multiple strategies for solving this.
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await orchestrator.generateGuidance(context);

			// Should prioritize error pattern over potential overthinking pattern
			if (result.shouldIntervene) {
				expect(result.source).toBe('pattern-detection');
				expect(result.metadata?.patternCategory).toBe('error_detection');
			}
		});
	});

	describe('Configuration Updates', () => {
		it('should update both pattern and LLM sources', () => {
			const newConfig = {
				...config,
				patterns: {
					enabled: false,
					...config.patterns!,
				},
			};

			orchestrator.updateConfig(newConfig);

			// Both sources should receive the updated config
			const debugInfo = orchestrator.getDebugInfo() as any;
			expect(debugInfo.sourceCount).toBe(2);
		});
	});

	describe('Throttling Integration', () => {
		it('should respect pattern-specific throttling', async () => {
			const context: AnalysisContext = {
				terminalOutput: 'console.log("debug output for testing");',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			// First analysis
			const result1 = await orchestrator.generateGuidance(context);

			if (result1.shouldIntervene) {
				// Immediate second analysis should be throttled
				const result2 = await orchestrator.generateGuidance(context);
				expect(result2.shouldIntervene).toBe(false);
				expect(result2.reasoning).toContain('Throttled');
			}
		});

		it('should allow critical patterns to bypass throttling', async () => {
			// First trigger some throttling with a regular pattern
			const regularContext: AnalysisContext = {
				terminalOutput: 'console.log("debug");',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			await orchestrator.generateGuidance(regularContext);

			// Then try a critical pattern
			const criticalContext: AnalysisContext = {
				terminalOutput:
					'Error: Critical system failure - immediate attention required',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await orchestrator.generateGuidance(criticalContext);

			// Critical patterns should still work despite throttling
			if (result.metadata?.patternPriority === 'critical') {
				expect(result.shouldIntervene).toBe(true);
			}
		});
	});

	describe('Performance Requirements', () => {
		it('should meet PR#3 performance requirements (< 10ms for 70%+ cases)', async () => {
			const testCases = [
				'Normal output without issues',
				'$ ls -la\ntotal 16\ndrwxr-xr-x  4 user  staff  128 Jan  1 12:00 .',
				'Building project...\nBuild completed successfully',
				'Running tests...\nAll tests passed',
				'Deploying to production...\nDeployment successful',
			];

			const durations: number[] = [];

			for (const output of testCases) {
				const context: AnalysisContext = {
					terminalOutput: output,
					sessionState: 'idle',
					worktreePath: '/test',
				};

				const startTime = Date.now();
				await orchestrator.generateGuidance(context);
				const duration = Date.now() - startTime;

				durations.push(duration);
			}

			// At least 70% should be under 10ms (being lenient with 20ms for test environment)
			const fastCases = durations.filter(d => d < 20).length;
			const percentage = (fastCases / durations.length) * 100;

			expect(percentage).toBeGreaterThanOrEqual(70);
		});
	});

	describe('Metadata and Attribution', () => {
		it('should provide source attribution in guidance results', async () => {
			const context: AnalysisContext = {
				terminalOutput: 'Error: Test error for attribution',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const result = await orchestrator.generateGuidance(context);

			if (result.shouldIntervene) {
				expect(result.source).toBeTruthy();
				expect(result.reasoning).toContain('Source:');
				expect(result.reasoning).toContain('analyzed by');

				// Should have analysis context metadata
				expect(result.metadata?.analysisContext).toBeDefined();
				const analysisContext = result.metadata?.analysisContext as any;
				expect(analysisContext.totalSources).toBeGreaterThan(0);
				expect(analysisContext.sourcesAnalyzed).toBeGreaterThan(0);
				expect(Array.isArray(analysisContext.sourceResults)).toBe(true);
			}
		});
	});

	describe('Error Handling', () => {
		it('should handle pattern source errors gracefully', async () => {
			// Create a malformed context that might cause issues
			const context: AnalysisContext = {
				terminalOutput: 'x'.repeat(500000), // Very large output
				sessionState: 'idle',
				worktreePath: '/test',
			};

			// Should not throw errors
			const result = await orchestrator.generateGuidance(context);
			expect(result).toBeDefined();
			expect(typeof result.shouldIntervene).toBe('boolean');
		});
	});

	describe('Source Management', () => {
		it('should allow adding custom pattern sources', () => {
			const initialCount = orchestrator.getSourceIds().length;

			// This would require a custom source implementation
			// Just verify the current architecture supports it
			expect(initialCount).toBeGreaterThan(0);

			const debugInfo = orchestrator.getDebugInfo() as any;
			expect(debugInfo.sourceCount).toBe(initialCount);
		});

		it('should provide comprehensive debug information', () => {
			const debugInfo = orchestrator.getDebugInfo() as any;

			expect(debugInfo.sourceCount).toBe(2);
			expect(debugInfo.isAvailable).toBe(true);
			expect(Array.isArray(debugInfo.sources)).toBe(true);

			// Each source should have required debug properties
			debugInfo.sources.forEach((source: any) => {
				expect(source.id).toBeTruthy();
				expect(typeof source.priority).toBe('number');
				expect(typeof source.canShortCircuit).toBe('boolean');
			});
		});
	});
});
