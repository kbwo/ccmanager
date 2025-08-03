import {describe, it, expect, beforeEach} from 'vitest';
import {PatternDetector} from './patternDetector.js';
import {PatternLibrary} from './patternLibrary.js';
import type {AnalysisContext, PatternCategory} from '../../types/index.js';

describe('PatternDetector', () => {
	let detector: PatternDetector;

	beforeEach(() => {
		const categories: PatternCategory[] = [
			'error_detection',
			'repetitive_behavior',
			'overthinking',
			'code_quality',
			'git_workflow',
			'security',
			'performance',
		];
		detector = new PatternDetector(categories);
	});

	describe('detectPatterns', () => {
		it('should detect error patterns in terminal output', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: Command not found: invalidcommand
npm ERR! code ENOENT
SyntaxError: Unexpected token 'invalid'
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			expect(matches.length).toBeGreaterThan(0);

			const errorMatches = matches.filter(
				m => m.pattern.category === 'error_detection',
			);
			expect(errorMatches.length).toBeGreaterThan(0);
			expect(errorMatches[0].confidence).toBeGreaterThan(0.5);
		});

		it('should detect repetitive behavior patterns', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
$ npm install
$ npm install
$ npm install
$ npm install
Let me try again. Let me try a different approach. Let me try once more.
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			const repetitiveMatches = matches.filter(
				m => m.pattern.category === 'repetitive_behavior',
			);
			expect(repetitiveMatches.length).toBeGreaterThan(0);
		});

		it('should detect debug code patterns', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
console.log("debug output");
console.log("another debug");
console.log("more debugging");
console.log("even more debugging");
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			const codeQualityMatches = matches.filter(
				m => m.pattern.category === 'code_quality',
			);
			expect(codeQualityMatches.length).toBeGreaterThan(0);
		});

		it('should detect security patterns', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
api_key = "sk-1234567890abcdefghijklmnopqrstuvwxyz"
secret = "very-secret-token-12345"
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			const securityMatches = matches.filter(
				m => m.pattern.category === 'security',
			);
			expect(securityMatches.length).toBeGreaterThan(0);
			expect(securityMatches[0].severity).toBe('critical');
		});

		it('should detect git workflow patterns', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
modified:   file1.ts
modified:   file2.ts
modified:   file3.ts
modified:   file4.ts
modified:   file5.ts
modified:   file6.ts
<<<<<<< HEAD
some code
=======
other code
>>>>>>> branch
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			const gitMatches = matches.filter(
				m => m.pattern.category === 'git_workflow',
			);
			expect(gitMatches.length).toBeGreaterThan(0);
		});

		it('should sort matches by priority and confidence', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: Critical error here
console.log("debug");
TODO: Fix this
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			if (matches.length > 1) {
				// Critical patterns should come first
				const criticalMatches = matches.filter(m => m.severity === 'critical');
				if (criticalMatches.length > 0) {
					expect(matches[0].severity).toBe('critical');
				}
			}
		});

		it('should complete detection in under 10ms for most cases', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Some normal output
$ ls -la
total 64
drwxr-xr-x  12 user  staff   384 Jan  1 12:00 .
drwxr-xr-x   5 user  staff   160 Jan  1 12:00 ..
-rw-r--r--   1 user  staff  1234 Jan  1 12:00 file.txt
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const startTime = Date.now();
			await detector.detectPatterns(context);
			const duration = Date.now() - startTime;

			// Most normal cases should be under 10ms
			// We'll be lenient in tests due to test environment overhead
			expect(duration).toBeLessThan(50);
		});

		it('should handle empty output gracefully', async () => {
			const context: AnalysisContext = {
				terminalOutput: '',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			expect(matches).toEqual([]);
		});

		it('should handle malformed regex gracefully', async () => {
			// This test ensures the detector handles edge cases
			const context: AnalysisContext = {
				terminalOutput:
					'Some output with special characters: \\[ \\] \\( \\) \\{ \\}',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			// Should not throw an error
			const matches = await detector.detectPatterns(context);
			expect(Array.isArray(matches)).toBe(true);
		});
	});

	describe('updateEnabledCategories', () => {
		it('should update enabled categories', () => {
			const newCategories: PatternCategory[] = ['error_detection', 'security'];
			detector.updateEnabledCategories(newCategories);

			const stats = detector.getDetectionStats();
			expect(stats.enabledCategories).toEqual(['error_detection', 'security']);
		});
	});

	describe('updateSensitivityThresholds', () => {
		it('should update sensitivity thresholds', () => {
			const newThresholds = {
				critical: 0.1,
				high: 0.3,
				medium: 0.5,
				low: 0.7,
			};

			detector.updateSensitivityThresholds(newThresholds);

			const stats = detector.getDetectionStats();
			expect(stats.sensitivityThresholds).toEqual(newThresholds);
		});
	});

	describe('getDetectionStats', () => {
		it('should return valid detection statistics', () => {
			const stats = detector.getDetectionStats();

			expect(stats).toHaveProperty('enabledCategories');
			expect(stats).toHaveProperty('activePatternCount');
			expect(stats).toHaveProperty('sensitivityThresholds');

			expect(Array.isArray(stats.enabledCategories)).toBe(true);
			expect(typeof stats.activePatternCount).toBe('number');
			expect(stats.activePatternCount).toBeGreaterThanOrEqual(0);
		});
	});

	describe('benchmarkDetection', () => {
		it('should provide performance benchmark results', async () => {
			const sampleOutput = `
Error: Test error
console.log("debug");
$ npm install
$ npm install
$ npm install
			`;

			const benchmark = await detector.benchmarkDetection(sampleOutput);

			expect(benchmark).toHaveProperty('duration');
			expect(benchmark).toHaveProperty('matchCount');
			expect(benchmark).toHaveProperty('patternsTested');

			expect(typeof benchmark.duration).toBe('number');
			expect(typeof benchmark.matchCount).toBe('number');
			expect(typeof benchmark.patternsTested).toBe('number');

			expect(benchmark.duration).toBeGreaterThan(0);
			expect(benchmark.patternsTested).toBeGreaterThan(0);
		});
	});

	describe('Confidence Calculation', () => {
		it('should assign higher confidence to critical patterns', async () => {
			const context: AnalysisContext = {
				terminalOutput: 'Error: Critical system failure',
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			const criticalMatches = matches.filter(m => m.severity === 'critical');

			if (criticalMatches.length > 0) {
				expect(criticalMatches[0].confidence).toBeGreaterThan(0.7);
			}
		});

		it('should assign higher confidence to multiple matches', async () => {
			const context: AnalysisContext = {
				terminalOutput: `
Error: First error
Error: Second error  
Error: Third error
Error: Fourth error
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			const errorMatches = matches.filter(
				m => m.pattern.category === 'error_detection',
			);

			if (errorMatches.length > 0) {
				// Multiple error matches should result in high confidence
				expect(errorMatches[0].confidence).toBeGreaterThan(0.8);
			}
		});
	});

	describe('Pattern Filtering', () => {
		it('should respect minimum match requirements', async () => {
			// Test a pattern that requires multiple matches
			const context: AnalysisContext = {
				terminalOutput: 'console.log("single debug");', // Only one match
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await detector.detectPatterns(context);
			// Should not trigger debug code pattern if it requires 3+ matches
			const debugMatches = matches.filter(
				m => m.pattern.id === 'debug_code_left',
			);
			expect(debugMatches.length).toBe(0);
		});

		it('should only include patterns from enabled categories', async () => {
			// Create detector with only error detection enabled
			const restrictedDetector = new PatternDetector(['error_detection']);

			const context: AnalysisContext = {
				terminalOutput: `
Error: Test error
console.log("debug");
				`,
				sessionState: 'idle',
				worktreePath: '/test',
			};

			const matches = await restrictedDetector.detectPatterns(context);

			// Should only find error patterns, not code quality patterns
			expect(matches.every(m => m.pattern.category === 'error_detection')).toBe(
				true,
			);
		});
	});
});
