import {describe, it, expect, beforeEach, vi} from 'vitest';
import {PatternLearnerService} from './patternLearner.js';
import {
	LearningConfig,
	UserInputPattern,
	LearnedPattern,
} from '../types/index.js';
import {LLMClient} from './llmClient.js';

describe('PatternLearnerService', () => {
	let service: PatternLearnerService;
	let mockLearningConfig: LearningConfig;
	let mockLLMClient: LLMClient;

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
			getApiKeyForProvider: vi.fn(() => 'test-key'),
			createModelWithApiKey: vi.fn(() => ({model: 'mock-model'})),
		} as any;

		service = new PatternLearnerService(mockLearningConfig, mockLLMClient);
	});

	describe('analyzePatterns', () => {
		it('should return empty result when LLM is not available', async () => {
			mockLLMClient.isAvailable = vi.fn(() => false);

			const result = await service.analyzePatterns([]);

			expect(result.patterns).toHaveLength(0);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('LLM not available');
		});

		it('should return empty result when insufficient guidance inputs', async () => {
			const inputs: UserInputPattern[] = [
				{
					sessionId: 'session1',
					timestamp: new Date(),
					input: 'Always use tests',
					context: 'Context',
					inputType: 'instruction',
					isGuidanceRelated: true,
				},
			];

			const result = await service.analyzePatterns(inputs);

			expect(result.patterns).toHaveLength(0);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('Insufficient guidance inputs');
		});

		it('should analyze patterns when sufficient inputs provided', async () => {
			const inputs: UserInputPattern[] = [
				{
					sessionId: 'session1',
					timestamp: new Date(),
					input: 'Always use TypeScript strict mode',
					context: 'Setting up project',
					inputType: 'instruction',
					isGuidanceRelated: true,
				},
				{
					sessionId: 'session1',
					timestamp: new Date(),
					input: 'Prefer composition over inheritance',
					context: 'Designing classes',
					inputType: 'correction',
					isGuidanceRelated: true,
				},
				{
					sessionId: 'session1',
					timestamp: new Date(),
					input: 'Write tests first',
					context: 'Starting new feature',
					inputType: 'instruction',
					isGuidanceRelated: true,
				},
			];

			// Mock LLM response
			const mockGenerateText = vi.fn().mockResolvedValue({
				text: JSON.stringify({
					patterns: [
						{
							category: 'style',
							instruction: 'Use TypeScript strict mode',
							confidence: 0.8,
							frequency: 1,
							examples: ['Always use TypeScript strict mode'],
						},
						{
							category: 'testing',
							instruction: 'Write tests first',
							confidence: 0.9,
							frequency: 1,
							examples: ['Write tests first'],
						},
					],
					overallConfidence: 0.85,
					reasoning: 'Found clear patterns in user preferences',
				}),
			});

			// Mock the dynamic import
			vi.doMock('ai', () => ({
				generateText: mockGenerateText,
			}));

			const result = await service.analyzePatterns(inputs);

			expect(result.patterns).toHaveLength(2);
			expect(result.patterns[0]?.category).toBe('style');
			expect(result.patterns[0]?.instruction).toBe(
				'Use TypeScript strict mode',
			);
			expect(result.patterns[0]?.approved).toBe(false);
			expect(result.confidence).toBe(0.85);
		});

		it('should filter patterns below minimum confidence threshold', async () => {
			const inputs: UserInputPattern[] = [
				{
					sessionId: 'session1',
					timestamp: new Date(),
					input: 'Maybe use TypeScript',
					context: 'Context',
					inputType: 'instruction',
					isGuidanceRelated: true,
				},
				{
					sessionId: 'session1',
					timestamp: new Date(),
					input: 'Sometimes write tests',
					context: 'Context',
					inputType: 'instruction',
					isGuidanceRelated: true,
				},
			];

			const mockGenerateText = vi.fn().mockResolvedValue({
				text: JSON.stringify({
					patterns: [
						{
							category: 'style',
							instruction: 'Use TypeScript',
							confidence: 0.5, // Below threshold
							frequency: 1,
							examples: ['Maybe use TypeScript'],
						},
						{
							category: 'testing',
							instruction: 'Write tests',
							confidence: 0.8, // Above threshold
							frequency: 1,
							examples: ['Sometimes write tests'],
						},
					],
					overallConfidence: 0.65,
					reasoning: 'Mixed confidence patterns',
				}),
			});

			vi.doMock('ai', () => ({
				generateText: mockGenerateText,
			}));

			const result = await service.analyzePatterns(inputs);

			expect(result.patterns).toHaveLength(1);
			expect(result.patterns[0]?.confidence).toBe(0.8);
		});
	});

	describe('analyzeNewInput', () => {
		it('should return empty array when LLM not available', async () => {
			mockLLMClient.isAvailable = vi.fn(() => false);

			const input: UserInputPattern = {
				sessionId: 'session1',
				timestamp: new Date(),
				input: 'Always use tests',
				context: 'Context',
				inputType: 'instruction',
				isGuidanceRelated: true,
			};

			const result = await service.analyzeNewInput(input, []);

			expect(result).toHaveLength(0);
		});

		it('should return empty array for non-guidance input', async () => {
			const input: UserInputPattern = {
				sessionId: 'session1',
				timestamp: new Date(),
				input: 'What is this?',
				context: 'Context',
				inputType: 'question',
				isGuidanceRelated: false,
			};

			const result = await service.analyzeNewInput(input, []);

			expect(result).toHaveLength(0);
		});

		it('should identify new patterns from guidance input', async () => {
			const input: UserInputPattern = {
				sessionId: 'session1',
				timestamp: new Date(),
				input: 'Always use functional components',
				context: 'React development',
				inputType: 'instruction',
				isGuidanceRelated: true,
			};

			const existingPatterns: LearnedPattern[] = [
				{
					id: 'pattern1',
					category: 'testing',
					instruction: 'Write tests first',
					confidence: 0.8,
					frequency: 2,
					lastSeen: new Date(),
					approved: true,
				},
			];

			const mockGenerateText = vi.fn().mockResolvedValue({
				text: JSON.stringify({
					newPatterns: [
						{
							category: 'architecture',
							instruction: 'Prefer functional components in React',
							confidence: 0.9,
							reasoning: 'Strong preference for functional components',
						},
					],
					reasoning: 'Found new architectural pattern',
				}),
			});

			vi.doMock('ai', () => ({
				generateText: mockGenerateText,
			}));

			const result = await service.analyzeNewInput(input, existingPatterns);

			expect(result).toHaveLength(1);
			expect(result[0]?.category).toBe('architecture');
			expect(result[0]?.instruction).toBe(
				'Prefer functional components in React',
			);
			expect(result[0]?.approved).toBe(false);
		});
	});

	describe('updatePatternConfidence', () => {
		it('should increase confidence and frequency with supporting inputs', () => {
			const pattern: LearnedPattern = {
				id: 'pattern1',
				category: 'testing',
				instruction: 'Write tests first',
				confidence: 0.7,
				frequency: 1,
				lastSeen: new Date(Date.now() - 1000),
				approved: true,
			};

			const supportingInputs: UserInputPattern[] = [
				{
					sessionId: 'session1',
					timestamp: new Date(),
					input: 'Write tests first',
					context: 'Context',
					inputType: 'instruction',
					isGuidanceRelated: true,
				},
				{
					sessionId: 'session2',
					timestamp: new Date(),
					input: 'Make sure to write tests first',
					context: 'Context',
					inputType: 'correction',
					isGuidanceRelated: true,
				},
			];

			const updated = service.updatePatternConfidence(
				pattern,
				supportingInputs,
			);

			expect(updated.confidence).toBeGreaterThan(pattern.confidence);
			expect(updated.frequency).toBe(2);
			expect(updated.lastSeen.getTime()).toBeGreaterThan(
				pattern.lastSeen.getTime(),
			);
		});

		it('should not exceed maximum confidence of 1.0', () => {
			const pattern: LearnedPattern = {
				id: 'pattern1',
				category: 'testing',
				instruction: 'Write tests first',
				confidence: 0.95,
				frequency: 1,
				lastSeen: new Date(),
				approved: true,
			};

			const manyInputs: UserInputPattern[] = Array(20)
				.fill(null)
				.map((_, i) => ({
					sessionId: `session${i}`,
					timestamp: new Date(),
					input: 'Write tests first',
					context: 'Context',
					inputType: 'instruction' as const,
					isGuidanceRelated: true,
				}));

			const updated = service.updatePatternConfidence(pattern, manyInputs);

			expect(updated.confidence).toBeLessThanOrEqual(1.0);
		});
	});
});
