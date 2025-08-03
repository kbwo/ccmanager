import {describe, it, expect, beforeEach, vi} from 'vitest';
import {LLMClient} from './llmClient.js';
import {PatternTrackerService} from './patternTracker.js';
import {LearningConfig} from '../types/index.js';

describe('PatternTrackerService', () => {
	let service: PatternTrackerService;
	let mockLearningConfig: LearningConfig;
	let mockLLMClient: Partial<LLMClient>;

	beforeEach(() => {
		mockLearningConfig = {
			enabled: true,
			approvalRequired: true,
			retentionDays: 30,
			minPatternConfidence: 0.7,
		};

		mockLLMClient = {
			isAvailable: vi.fn(() => true),
			config: {
				provider: 'openai',
				model: 'gpt-4.1',
				apiKeys: {openai: 'test-key'},
			},
		} as Partial<LLMClient>;

		service = new PatternTrackerService(
			mockLearningConfig,
			mockLLMClient as LLMClient,
		);
	});

	describe('trackUserInput', () => {
		it('should track input when learning is enabled', async () => {
			await service.trackUserInput(
				'session1',
				'Use TypeScript strict mode',
				'Claude was setting up a project',
				'instruction',
			);

			const patterns = service.getPatterns();
			expect(patterns).toHaveLength(1);
			expect(patterns[0]?.input).toBe('Use TypeScript strict mode');
			expect(patterns[0]?.sessionId).toBe('session1');
			expect(patterns[0]?.inputType).toBe('instruction');
		});

		it('should not track input when learning is disabled', async () => {
			service.updateConfig({...mockLearningConfig, enabled: false});

			await service.trackUserInput(
				'session1',
				'Use TypeScript strict mode',
				'Context',
				'instruction',
			);

			expect(service.getPatterns()).toHaveLength(0);
		});

		it('should skip empty or very short inputs', async () => {
			await service.trackUserInput('session1', '', 'Context', 'instruction');
			await service.trackUserInput('session1', 'ok', 'Context', 'instruction');

			expect(service.getPatterns()).toHaveLength(0);
		});

		it('should detect guidance-related inputs using keywords', async () => {
			// Mock LLM as unavailable to force keyword detection
			mockLLMClient.isAvailable = vi.fn(() => false);

			await service.trackUserInput(
				'session1',
				'Always use TypeScript strict mode',
				'Context',
				'instruction',
			);

			const patterns = service.getPatterns();
			expect(patterns[0]?.isGuidanceRelated).toBe(true);
		});

		it('should not mark non-guidance inputs as guidance-related', async () => {
			mockLLMClient.isAvailable = vi.fn(() => false);

			await service.trackUserInput(
				'session1',
				'What is the current status?',
				'Context',
				'question',
			);

			const patterns = service.getPatterns();
			expect(patterns[0]?.isGuidanceRelated).toBe(false);
		});
	});

	describe('getPatterns', () => {
		beforeEach(async () => {
			await service.trackUserInput(
				'session1',
				'Always use tests',
				'Context',
				'instruction',
			);
			await service.trackUserInput(
				'session2',
				'Prefer composition',
				'Context',
				'correction',
			);
		});

		it('should return all patterns when no sessionId specified', () => {
			const patterns = service.getPatterns();
			expect(patterns).toHaveLength(2);
		});

		it('should filter patterns by sessionId', () => {
			const patterns = service.getPatterns('session1');
			expect(patterns).toHaveLength(1);
			expect(patterns[0]?.sessionId).toBe('session1');
		});
	});

	describe('clearPatterns', () => {
		beforeEach(async () => {
			await service.trackUserInput(
				'session1',
				'Always use tests',
				'Context',
				'instruction',
			);
			await service.trackUserInput(
				'session2',
				'Prefer composition',
				'Context',
				'correction',
			);
		});

		it('should clear all patterns when no sessionId specified', () => {
			service.clearPatterns();
			expect(service.getPatterns()).toHaveLength(0);
		});

		it('should clear patterns for specific session only', () => {
			service.clearPatterns('session1');
			const remaining = service.getPatterns();
			expect(remaining).toHaveLength(1);
			expect(remaining[0]?.sessionId).toBe('session2');
		});
	});

	describe('getGuidancePatterns', () => {
		beforeEach(async () => {
			mockLLMClient.isAvailable = vi.fn(() => false);

			await service.trackUserInput(
				'session1',
				'Always use tests',
				'Context',
				'instruction',
			);
			await service.trackUserInput(
				'session1',
				'What is this?',
				'Context',
				'question',
			);
		});

		it('should return only guidance-related patterns', () => {
			const guidancePatterns = service.getGuidancePatterns();
			expect(guidancePatterns).toHaveLength(1);
			expect(guidancePatterns[0]?.input).toBe('Always use tests');
		});
	});

	describe('getPatternStats', () => {
		beforeEach(async () => {
			mockLLMClient.isAvailable = vi.fn(() => false);

			await service.trackUserInput(
				'session1',
				'Always use tests',
				'Context',
				'instruction',
			);
			await service.trackUserInput(
				'session1',
				'What is this?',
				'Context',
				'question',
			);
			await service.trackUserInput(
				'session2',
				'Prefer composition',
				'Context',
				'correction',
			);
		});

		it('should return correct statistics', () => {
			const stats = service.getPatternStats();
			expect(stats.total).toBe(3);
			expect(stats.guidanceRelated).toBe(2); // "Always" and "Prefer" are guidance keywords
			expect(stats.byType['instruction']).toBe(1);
			expect(stats.byType['question']).toBe(1);
			expect(stats.byType['correction']).toBe(1);
			expect(stats.bySession['session1']).toBe(2);
			expect(stats.bySession['session2']).toBe(1);
		});
	});

	describe('cleanup old patterns', () => {
		it('should remove patterns older than retention period', async () => {
			// Track a pattern
			await service.trackUserInput(
				'session1',
				'Always use tests',
				'Context',
				'instruction',
			);

			// Manually set timestamp to be older than retention period
			const patterns = service.getPatterns();
			if (patterns[0]) {
				patterns[0].timestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
			}

			// Force cleanup
			service.clearOldPatterns();

			expect(service.getPatterns()).toHaveLength(0);
		});
	});
});
