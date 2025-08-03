import {describe, it, expect, beforeEach, vi} from 'vitest';
import {GuidanceThrottler} from './guidanceThrottler.js';
import type {
	DetectionPattern,
	PatternCategory,
	PatternPriority,
} from '../../types/index.js';

describe('GuidanceThrottler', () => {
	let throttler: GuidanceThrottler;

	const createTestPattern = (
		id: string,
		priority: PatternPriority = 'medium',
		category: PatternCategory = 'code_quality',
		cooldownMs?: number,
	): DetectionPattern => ({
		id,
		name: `Test Pattern ${id}`,
		description: 'A test pattern',
		category,
		priority,
		pattern: /test/gi,
		guidance: 'Test guidance',
		enabled: true,
		cooldownMs,
	});

	beforeEach(() => {
		// Reset time mocking
		vi.clearAllMocks();
		throttler = new GuidanceThrottler(
			3, // maxGuidancesPerHour
			30000, // minSpacingMs (30 seconds)
			2, // patternRepeatLimit
			true, // criticalBypassThrottling
		);
	});

	describe('canProvideGuidance', () => {
		it('should allow first guidance', () => {
			const pattern = createTestPattern('test1');
			const result = throttler.canProvideGuidance(pattern);

			expect(result.allowed).toBe(true);
			expect(result.reason).toBeUndefined();
		});

		it('should allow critical patterns to bypass throttling', () => {
			const criticalPattern = createTestPattern(
				'critical1',
				'critical',
				'error_detection',
			);

			// First provide some guidance to trigger throttling
			const normalPattern = createTestPattern('normal1');
			throttler.recordGuidanceProvided(normalPattern);

			// Critical should still be allowed
			const result = throttler.canProvideGuidance(criticalPattern);
			expect(result.allowed).toBe(true);
		});

		it('should enforce minimum spacing between guidance', () => {
			const pattern1 = createTestPattern('test1');
			const pattern2 = createTestPattern('test2');

			// Provide first guidance
			throttler.recordGuidanceProvided(pattern1);

			// Immediately try to provide another - should be blocked
			const result = throttler.canProvideGuidance(pattern2);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('Minimum spacing not met');
			expect(result.waitTimeMs).toBeGreaterThan(0);
		});

		it('should enforce hourly guidance limit', () => {
			const patterns = [
				createTestPattern('test1'),
				createTestPattern('test2'),
				createTestPattern('test3'),
				createTestPattern('test4'),
			];

			// Mock time to bypass minimum spacing
			let currentTime = Date.now();
			vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

			// Provide 3 guidances (the limit)
			for (let i = 0; i < 3; i++) {
				currentTime += 31000; // Move time forward 31 seconds
				const canProvide = throttler.canProvideGuidance(patterns[i]!);
				expect(canProvide.allowed).toBe(true);
				throttler.recordGuidanceProvided(patterns[i]!);
			}

			// Fourth guidance should be blocked
			currentTime += 31000;
			const result = throttler.canProvideGuidance(patterns[3]!);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('Hourly limit reached');
		});

		it('should enforce pattern repeat limit', () => {
			const pattern = createTestPattern('repeat_test');

			// Mock time to bypass minimum spacing
			let currentTime = Date.now();
			vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

			// Provide guidance twice (the limit)
			for (let i = 0; i < 2; i++) {
				currentTime += 31000;
				const canProvide = throttler.canProvideGuidance(pattern);
				expect(canProvide.allowed).toBe(true);
				throttler.recordGuidanceProvided(pattern);
			}

			// Third time should be blocked
			currentTime += 31000;
			const result = throttler.canProvideGuidance(pattern);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('Pattern repeat limit reached');
		});

		it('should enforce pattern-specific cooldown', () => {
			const pattern = createTestPattern(
				'cooldown_test',
				'medium',
				'code_quality',
				60000,
			); // 1 minute cooldown

			// Provide guidance
			throttler.recordGuidanceProvided(pattern);

			// Mock time 30 seconds later - should still be in cooldown
			const futureTime = Date.now() + 30000;
			vi.spyOn(Date, 'now').mockReturnValue(futureTime);

			const result = throttler.canProvideGuidance(pattern);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('Pattern cooldown active');
			expect(result.waitTimeMs).toBeGreaterThan(0);
		});

		it('should allow guidance after cooldown expires', () => {
			const pattern = createTestPattern(
				'cooldown_test',
				'medium',
				'code_quality',
				60000,
			);

			// Provide guidance
			throttler.recordGuidanceProvided(pattern);

			// Mock time 61 seconds later - cooldown should be expired
			const futureTime = Date.now() + 61000;
			vi.spyOn(Date, 'now').mockReturnValue(futureTime);

			const result = throttler.canProvideGuidance(pattern);
			expect(result.allowed).toBe(true);
		});
	});

	describe('recordGuidanceProvided', () => {
		it('should record guidance and update counters', () => {
			const pattern = createTestPattern('test1');

			const statusBefore = throttler.getThrottlingStatus();
			expect(statusBefore.guidanceCountThisHour).toBe(0);
			expect(statusBefore.lastGuidanceTime).toBeNull();

			throttler.recordGuidanceProvided(pattern);

			const statusAfter = throttler.getThrottlingStatus();
			expect(statusAfter.guidanceCountThisHour).toBe(1);
			expect(statusAfter.lastGuidanceTime).not.toBeNull();
		});

		it('should track pattern-specific data', () => {
			const pattern = createTestPattern('test1');

			throttler.recordGuidanceProvided(pattern);

			const patternInfo = throttler.getPatternThrottlingInfo('test1');
			expect(patternInfo).not.toBeNull();
			expect(patternInfo?.patternId).toBe('test1');
			expect(patternInfo?.triggerCount).toBe(1);
			expect(patternInfo?.category).toBe('code_quality');
		});
	});

	describe('updateConfig', () => {
		it('should update throttling configuration', () => {
			const newConfig = {
				maxGuidancesPerHour: 5,
				minSpacingMs: 15000,
				patternRepeatLimit: 3,
				criticalBypassThrottling: false,
			};

			throttler.updateConfig(newConfig);

			// Test that new config is applied
			const pattern = createTestPattern('critical1', 'critical');

			// With criticalBypassThrottling disabled, critical patterns should be throttled
			throttler.recordGuidanceProvided(pattern);
			const result = throttler.canProvideGuidance(pattern);

			// Should be blocked due to minimum spacing (even though it's critical)
			expect(result.allowed).toBe(false);
		});
	});

	describe('getThrottlingStatus', () => {
		it('should return current throttling status', () => {
			const status = throttler.getThrottlingStatus();

			expect(status).toHaveProperty('guidanceCountThisHour');
			expect(status).toHaveProperty('maxGuidancesPerHour');
			expect(status).toHaveProperty('lastGuidanceTime');
			expect(status).toHaveProperty('timeUntilNextAllowed');
			expect(status).toHaveProperty('timeUntilHourlyReset');
			expect(status).toHaveProperty('patternEntries');

			expect(status.guidanceCountThisHour).toBe(0);
			expect(status.maxGuidancesPerHour).toBe(3);
			expect(status.lastGuidanceTime).toBeNull();
		});

		it('should update status after recording guidance', () => {
			const pattern = createTestPattern('test1');
			throttler.recordGuidanceProvided(pattern);

			const status = throttler.getThrottlingStatus();
			expect(status.guidanceCountThisHour).toBe(1);
			expect(status.lastGuidanceTime).not.toBeNull();
			expect(status.patternEntries).toBe(1);
		});
	});

	describe('reset', () => {
		it('should clear all throttling data', () => {
			// Record some guidance
			const pattern = createTestPattern('test1');
			throttler.recordGuidanceProvided(pattern);

			let status = throttler.getThrottlingStatus();
			expect(status.guidanceCountThisHour).toBe(1);

			// Reset
			throttler.reset();

			status = throttler.getThrottlingStatus();
			expect(status.guidanceCountThisHour).toBe(0);
			expect(status.lastGuidanceTime).toBeNull();
			expect(status.patternEntries).toBe(0);
		});
	});

	describe('getThrottlingStatsByCategory', () => {
		it('should return statistics grouped by category', () => {
			const patterns = [
				createTestPattern('error1', 'critical', 'error_detection'),
				createTestPattern('error2', 'high', 'error_detection'),
				createTestPattern('quality1', 'medium', 'code_quality'),
			];

			// Record guidance for each pattern
			patterns.forEach(pattern => {
				throttler.recordGuidanceProvided(pattern);
			});

			const stats = throttler.getThrottlingStatsByCategory();

			expect(stats.error_detection).toBeDefined();
			expect(stats.error_detection.triggerCount).toBe(2);
			expect(stats.error_detection.uniquePatterns).toBe(2);

			expect(stats.code_quality).toBeDefined();
			expect(stats.code_quality.triggerCount).toBe(1);
			expect(stats.code_quality.uniquePatterns).toBe(1);
		});
	});

	describe('Hourly Reset Logic', () => {
		it('should reset hourly count after one hour', () => {
			const pattern = createTestPattern('test1');

			// Record guidance
			throttler.recordGuidanceProvided(pattern);

			let status = throttler.getThrottlingStatus();
			expect(status.guidanceCountThisHour).toBe(1);

			// Mock time one hour and one second later
			const futureTime = Date.now() + 60 * 60 * 1000 + 1000;
			vi.spyOn(Date, 'now').mockReturnValue(futureTime);

			// Check status again - should reset
			status = throttler.getThrottlingStatus();
			expect(status.guidanceCountThisHour).toBe(0);
		});

		it('should reset pattern repeat counts after one hour', () => {
			const pattern = createTestPattern('test1');

			// Mock time to control progression
			let currentTime = Date.now();
			vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

			// Record guidance twice (hit the limit)
			for (let i = 0; i < 2; i++) {
				currentTime += 31000; // 31 seconds
				const canProvide = throttler.canProvideGuidance(pattern);
				expect(canProvide.allowed).toBe(true);
				throttler.recordGuidanceProvided(pattern);
			}

			// Should be blocked now
			currentTime += 31000;
			let result = throttler.canProvideGuidance(pattern);
			expect(result.allowed).toBe(false);

			// Move time forward one hour
			currentTime += 60 * 60 * 1000;

			// Should be allowed again
			result = throttler.canProvideGuidance(pattern);
			expect(result.allowed).toBe(true);
		});
	});

	describe('Edge Cases', () => {
		it('should handle non-existent pattern throttling info', () => {
			const info = throttler.getPatternThrottlingInfo('non_existent');
			expect(info).toBeNull();
		});

		it('should handle patterns without cooldown', () => {
			const pattern = createTestPattern('no_cooldown'); // No cooldownMs specified

			throttler.recordGuidanceProvided(pattern);

			// Should not be blocked by cooldown (only by minimum spacing)
			const result = throttler.canProvideGuidance(pattern);
			expect(result.allowed).toBe(false); // Blocked by minimum spacing
			expect(result.reason).toContain('Minimum spacing');
		});
	});
});
