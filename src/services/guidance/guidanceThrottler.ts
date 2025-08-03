import type {
	ThrottleEntry,
	PatternCategory,
	DetectionPattern,
} from '../../types/index.js';

/**
 * Manages guidance frequency and prevents spam according to PR#3 throttling strategy:
 * - Critical patterns: Always allowed (errors, security)
 * - Regular patterns: Max 3 per hour (configurable)
 * - Pattern repetition: Limit same pattern to 2 times
 * - Minimum spacing: 30 seconds between any guidance
 */
export class GuidanceThrottler {
	private throttleEntries: Map<string, ThrottleEntry> = new Map();
	private lastGuidanceTime: Date | null = null;
	private guidanceCountThisHour: number = 0;
	private hourlyCountResetTime: Date = new Date();

	constructor(
		private maxGuidancesPerHour: number = 3,
		private minSpacingMs: number = 30000, // 30 seconds
		private patternRepeatLimit: number = 2,
		private criticalBypassThrottling: boolean = true,
	) {}

	/**
	 * Check if guidance can be provided for a given pattern
	 */
	canProvideGuidance(pattern: DetectionPattern): {
		allowed: boolean;
		reason?: string;
		waitTimeMs?: number;
	} {
		const now = new Date();

		// Critical patterns bypass all throttling if enabled
		if (this.criticalBypassThrottling && pattern.priority === 'critical') {
			console.log(`✅ Critical pattern ${pattern.id} bypasses throttling`);
			return {allowed: true};
		}

		// Check minimum spacing between any guidance
		if (this.lastGuidanceTime) {
			const timeSinceLastGuidance =
				now.getTime() - this.lastGuidanceTime.getTime();
			if (timeSinceLastGuidance < this.minSpacingMs) {
				const waitTime = this.minSpacingMs - timeSinceLastGuidance;
				return {
					allowed: false,
					reason: `Minimum spacing not met (${Math.ceil(waitTime / 1000)}s remaining)`,
					waitTimeMs: waitTime,
				};
			}
		}

		// Reset hourly count if needed
		this.resetHourlyCountIfNeeded(now);

		// Check hourly guidance limit
		if (this.guidanceCountThisHour >= this.maxGuidancesPerHour) {
			const timeUntilReset = this.getTimeUntilHourlyReset(now);
			return {
				allowed: false,
				reason: `Hourly limit reached (${this.maxGuidancesPerHour})`,
				waitTimeMs: timeUntilReset,
			};
		}

		// Check pattern-specific cooldown
		const patternCooldownCheck = this.checkPatternCooldown(pattern, now);
		if (!patternCooldownCheck.allowed) {
			return patternCooldownCheck;
		}

		// Check pattern repetition limit
		const patternRepeatCheck = this.checkPatternRepeatLimit(pattern);
		if (!patternRepeatCheck.allowed) {
			return patternRepeatCheck;
		}

		return {allowed: true};
	}

	/**
	 * Record that guidance was provided for a pattern
	 */
	recordGuidanceProvided(pattern: DetectionPattern): void {
		const now = new Date();

		// Update global counters
		this.lastGuidanceTime = now;
		this.guidanceCountThisHour++;

		// Update pattern-specific tracking
		const key = pattern.id;
		const existing = this.throttleEntries.get(key);

		if (existing) {
			existing.lastTriggered = now;
			existing.triggerCount++;
		} else {
			this.throttleEntries.set(key, {
				patternId: pattern.id,
				lastTriggered: now,
				triggerCount: 1,
				category: pattern.category,
			});
		}

		console.log(
			`📝 Recorded guidance for pattern ${pattern.id} (total this hour: ${this.guidanceCountThisHour})`,
		);
	}

	/**
	 * Check pattern-specific cooldown
	 */
	private checkPatternCooldown(
		pattern: DetectionPattern,
		now: Date,
	): {
		allowed: boolean;
		reason?: string;
		waitTimeMs?: number;
	} {
		if (!pattern.cooldownMs) {
			return {allowed: true};
		}

		const entry = this.throttleEntries.get(pattern.id);
		if (!entry) {
			return {allowed: true};
		}

		const timeSinceLastTrigger = now.getTime() - entry.lastTriggered.getTime();
		if (timeSinceLastTrigger < pattern.cooldownMs) {
			const waitTime = pattern.cooldownMs - timeSinceLastTrigger;
			return {
				allowed: false,
				reason: `Pattern cooldown active (${Math.ceil(waitTime / 60000)}m remaining)`,
				waitTimeMs: waitTime,
			};
		}

		return {allowed: true};
	}

	/**
	 * Check pattern repetition limit
	 */
	private checkPatternRepeatLimit(pattern: DetectionPattern): {
		allowed: boolean;
		reason?: string;
	} {
		const entry = this.throttleEntries.get(pattern.id);
		if (!entry) {
			return {allowed: true};
		}

		// Reset trigger count if more than an hour has passed
		const hoursSinceLastTrigger =
			(Date.now() - entry.lastTriggered.getTime()) / (1000 * 60 * 60);

		if (hoursSinceLastTrigger >= 1) {
			entry.triggerCount = 0;
			return {allowed: true};
		}

		if (entry.triggerCount >= this.patternRepeatLimit) {
			return {
				allowed: false,
				reason: `Pattern repeat limit reached (${this.patternRepeatLimit} times)`,
			};
		}

		return {allowed: true};
	}

	/**
	 * Reset hourly count if needed
	 */
	private resetHourlyCountIfNeeded(now: Date): void {
		const hoursSinceReset =
			(now.getTime() - this.hourlyCountResetTime.getTime()) / (1000 * 60 * 60);

		if (hoursSinceReset >= 1) {
			this.guidanceCountThisHour = 0;
			this.hourlyCountResetTime = now;
			console.log(`🔄 Reset hourly guidance count`);
		}
	}

	/**
	 * Get time until hourly reset
	 */
	private getTimeUntilHourlyReset(now: Date): number {
		const nextResetTime = new Date(
			this.hourlyCountResetTime.getTime() + 60 * 60 * 1000,
		);
		return Math.max(0, nextResetTime.getTime() - now.getTime());
	}

	/**
	 * Update throttling configuration
	 */
	updateConfig(config: {
		maxGuidancesPerHour?: number;
		minSpacingMs?: number;
		patternRepeatLimit?: number;
		criticalBypassThrottling?: boolean;
	}): void {
		if (config.maxGuidancesPerHour !== undefined) {
			this.maxGuidancesPerHour = config.maxGuidancesPerHour;
		}
		if (config.minSpacingMs !== undefined) {
			this.minSpacingMs = config.minSpacingMs;
		}
		if (config.patternRepeatLimit !== undefined) {
			this.patternRepeatLimit = config.patternRepeatLimit;
		}
		if (config.criticalBypassThrottling !== undefined) {
			this.criticalBypassThrottling = config.criticalBypassThrottling;
		}

		console.log(`🔄 Updated throttling config:`, {
			maxGuidancesPerHour: this.maxGuidancesPerHour,
			minSpacingMs: this.minSpacingMs,
			patternRepeatLimit: this.patternRepeatLimit,
			criticalBypassThrottling: this.criticalBypassThrottling,
		});
	}

	/**
	 * Get current throttling status
	 */
	getThrottlingStatus(): {
		guidanceCountThisHour: number;
		maxGuidancesPerHour: number;
		lastGuidanceTime: Date | null;
		timeUntilNextAllowed: number;
		timeUntilHourlyReset: number;
		patternEntries: number;
	} {
		const now = new Date();
		this.resetHourlyCountIfNeeded(now);

		let timeUntilNextAllowed = 0;
		if (this.lastGuidanceTime) {
			const timeSinceLastGuidance =
				now.getTime() - this.lastGuidanceTime.getTime();
			timeUntilNextAllowed = Math.max(
				0,
				this.minSpacingMs - timeSinceLastGuidance,
			);
		}

		return {
			guidanceCountThisHour: this.guidanceCountThisHour,
			maxGuidancesPerHour: this.maxGuidancesPerHour,
			lastGuidanceTime: this.lastGuidanceTime,
			timeUntilNextAllowed,
			timeUntilHourlyReset: this.getTimeUntilHourlyReset(now),
			patternEntries: this.throttleEntries.size,
		};
	}

	/**
	 * Clear all throttling data
	 */
	reset(): void {
		this.throttleEntries.clear();
		this.lastGuidanceTime = null;
		this.guidanceCountThisHour = 0;
		this.hourlyCountResetTime = new Date();
		console.log(`🔄 Reset all throttling data`);
	}

	/**
	 * Get pattern-specific throttling info
	 */
	getPatternThrottlingInfo(patternId: string): ThrottleEntry | null {
		return this.throttleEntries.get(patternId) || null;
	}

	/**
	 * Get throttling statistics by category
	 */
	getThrottlingStatsByCategory(): Record<
		PatternCategory,
		{
			triggerCount: number;
			uniquePatterns: number;
			lastTriggered?: Date;
		}
	> {
		const stats: Record<
			string,
			{
				triggerCount: number;
				uniquePatterns: number;
				lastTriggered?: Date;
			}
		> = {};

		for (const entry of this.throttleEntries.values()) {
			if (!stats[entry.category]) {
				stats[entry.category] = {
					triggerCount: 0,
					uniquePatterns: 0,
				};
			}

			const categoryStats = stats[entry.category]!;
			categoryStats.triggerCount += entry.triggerCount;
			categoryStats.uniquePatterns++;

			if (
				!categoryStats.lastTriggered ||
				entry.lastTriggered > categoryStats.lastTriggered
			) {
				categoryStats.lastTriggered = entry.lastTriggered;
			}
		}

		return stats as Record<
			PatternCategory,
			{
				triggerCount: number;
				uniquePatterns: number;
				lastTriggered?: Date;
			}
		>;
	}
}
