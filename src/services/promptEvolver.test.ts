import {describe, it, expect, beforeEach, vi} from 'vitest';
import {PromptEvolverService} from './promptEvolver.js';
import {LearnedPattern} from '../types/index.js';
import {LLMClient} from './llmClient.js';

describe('PromptEvolverService', () => {
	let service: PromptEvolverService;
	let mockLLMClient: Partial<LLMClient>;

	beforeEach(() => {
		mockLLMClient = {
			isAvailable: vi.fn(() => true),
			config: {
				provider: 'openai',
				model: 'gpt-4.1',
				apiKeys: {openai: 'test-key'},
			},
			getApiKeyForProvider: vi.fn(() => 'test-key'),
			createModelWithApiKey: vi.fn(() => ({model: 'mock-model'})),
		} as Partial<LLMClient>;

		service = new PromptEvolverService(mockLLMClient as LLMClient);
	});

	describe('evolveGuidePrompt', () => {
		it('should return original prompt when LLM not available', async () => {
			mockLLMClient.isAvailable = vi.fn(() => false);
			const currentPrompt = 'Use TypeScript';

			const result = await service.evolveGuidePrompt(currentPrompt, []);

			expect(result.updatedPrompt).toBe(currentPrompt);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('LLM not available');
		});

		it('should return original prompt when no patterns provided', async () => {
			const currentPrompt = 'Use TypeScript';

			const result = await service.evolveGuidePrompt(currentPrompt, []);

			expect(result.updatedPrompt).toBe(currentPrompt);
			expect(result.confidence).toBe(1.0);
			expect(result.reasoning).toContain('No approved patterns');
		});

		it('should evolve prompt with approved patterns', async () => {
			const currentPrompt = 'Use TypeScript';
			const patterns: LearnedPattern[] = [
				{
					id: 'pattern1',
					category: 'style',
					instruction: 'Use strict mode',
					confidence: 0.9,
					frequency: 3,
					lastSeen: new Date(),
					approved: true,
				},
				{
					id: 'pattern2',
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
					updatedPrompt: 'Use TypeScript with strict mode. Write tests first.',
					confidence: 0.85,
					reasoning: 'Successfully incorporated style and testing patterns',
					changesApplied: [
						'Added strict mode requirement',
						'Added test-first approach',
					],
					preservedOriginal: true,
				}),
			});

			vi.doMock('ai', () => ({
				generateText: mockGenerateText,
			}));

			const result = await service.evolveGuidePrompt(currentPrompt, patterns);

			expect(result.updatedPrompt).toContain('TypeScript');
			expect(result.updatedPrompt).toContain('strict mode');
			expect(result.updatedPrompt).toContain('tests first');
			expect(result.confidence).toBe(0.85);
			expect(result.changesApplied).toHaveLength(2);
		});
	});

	describe('previewPromptEvolution', () => {
		it('should provide preview without LLM', async () => {
			mockLLMClient.isAvailable = vi.fn(() => false);

			const result = await service.previewPromptEvolution('Use TypeScript', []);

			expect(result.preview).toBe('Use TypeScript');
			expect(result.recommendation).toContain('LLM not available');
		});

		it('should provide evolution preview', async () => {
			const patterns: LearnedPattern[] = [
				{
					id: 'pattern1',
					category: 'style',
					instruction: 'Use strict mode',
					confidence: 0.9,
					frequency: 3,
					lastSeen: new Date(),
					approved: true,
				},
			];

			const mockGenerateText = vi.fn().mockResolvedValue({
				text: JSON.stringify({
					preview: 'Use TypeScript with strict mode enabled',
					addedInstructions: ['Enable strict mode for better type safety'],
					potentialConflicts: [],
					recommendation:
						'Proceed with update - patterns align well with existing prompt',
				}),
			});

			vi.doMock('ai', () => ({
				generateText: mockGenerateText,
			}));

			const result = await service.previewPromptEvolution(
				'Use TypeScript',
				patterns,
			);

			expect(result.preview).toContain('strict mode');
			expect(result.addedInstructions).toHaveLength(1);
			expect(result.potentialConflicts).toHaveLength(0);
		});
	});

	describe('mergeGuidePrompts', () => {
		it('should return single prompt when only one provided', async () => {
			const prompts = [{prompt: 'Use TypeScript', weight: 1.0}];

			const result = await service.mergeGuidePrompts(prompts);

			expect(result.updatedPrompt).toBe('Use TypeScript');
			expect(result.confidence).toBe(1.0);
			expect(result.reasoning).toContain('no merging needed');
		});

		it('should merge multiple prompts', async () => {
			const prompts = [
				{prompt: 'Use TypeScript', weight: 0.6},
				{prompt: 'Write tests first', weight: 0.4},
			];

			const mockGenerateText = vi.fn().mockResolvedValue({
				text: JSON.stringify({
					updatedPrompt: 'Use TypeScript and write tests first',
					confidence: 0.9,
					reasoning:
						'Successfully merged both prompts with appropriate weighting',
					changesApplied: [
						'Incorporated TypeScript requirement',
						'Added test-first approach',
					],
				}),
			});

			vi.doMock('ai', () => ({
				generateText: mockGenerateText,
			}));

			const result = await service.mergeGuidePrompts(prompts);

			expect(result.updatedPrompt).toContain('TypeScript');
			expect(result.updatedPrompt).toContain('tests');
			expect(result.confidence).toBe(0.9);
		});
	});

	describe('validatePromptEvolution', () => {
		it('should validate empty prompt as invalid', () => {
			const patterns: LearnedPattern[] = [];

			const result = service.validatePromptEvolution('original', '', patterns);

			expect(result.isValid).toBe(false);
			expect(result.issues).toContain('Evolved prompt is empty');
		});

		it('should validate too long prompt as invalid', () => {
			const longPrompt = 'a'.repeat(1001);
			const patterns: LearnedPattern[] = [];

			const result = service.validatePromptEvolution(
				'original',
				longPrompt,
				patterns,
			);

			expect(result.isValid).toBe(false);
			expect(result.issues.some(issue => issue.includes('too long'))).toBe(
				true,
			);
		});

		it('should validate missing pattern incorporation', () => {
			const patterns: LearnedPattern[] = [
				{
					id: 'pattern1',
					category: 'style',
					instruction: 'Use strict mode',
					confidence: 0.9,
					frequency: 3,
					lastSeen: new Date(),
					approved: true,
				},
			];

			const result = service.validatePromptEvolution(
				'Use TypeScript',
				'Use React hooks',
				patterns,
			);

			expect(result.isValid).toBe(false);
			expect(
				result.issues.some(issue => issue.includes('No learned patterns')),
			).toBe(true);
		});

		it('should validate loss of original content', () => {
			const patterns: LearnedPattern[] = [];

			const result = service.validatePromptEvolution(
				'Always use TypeScript with strict mode',
				'Write tests',
				patterns,
			);

			expect(result.isValid).toBe(false);
			expect(
				result.issues.some(issue =>
					issue.includes('original content was lost'),
				),
			).toBe(true);
		});

		it('should validate valid evolution', () => {
			const patterns: LearnedPattern[] = [
				{
					id: 'pattern1',
					category: 'testing',
					instruction: 'Write tests first',
					confidence: 0.9,
					frequency: 3,
					lastSeen: new Date(),
					approved: true,
				},
			];

			const result = service.validatePromptEvolution(
				'Use TypeScript',
				'Use TypeScript and write tests first',
				patterns,
			);

			expect(result.isValid).toBe(true);
			expect(result.issues).toHaveLength(0);
		});
	});
});
