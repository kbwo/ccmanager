/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {BaseLLMGuidanceSource} from './baseLLMGuidanceSource.js';
import type {AutopilotConfig, AnalysisContext} from '../../types/index.js';

// Mock LLMClient
vi.mock('../llmClient.js', () => ({
	LLMClient: vi.fn().mockImplementation(() => ({
		isAvailable: vi.fn().mockReturnValue(true),
		updateConfig: vi.fn(),
		getCurrentProviderName: vi.fn().mockReturnValue('OpenAI'),
		getSupportedModels: vi.fn().mockReturnValue(['gpt-4.1', 'o4-mini', 'o3']),
		analyzeClaudeOutput: vi.fn().mockResolvedValue({
			shouldIntervene: false,
			confidence: 0.3,
			guidance: undefined,
			reasoning: 'No intervention needed',
		}),
	})),
}));

describe('BaseLLMGuidanceSource', () => {
	let guidanceSource: BaseLLMGuidanceSource;
	let config: AutopilotConfig;
	let context: AnalysisContext;

	beforeEach(() => {
		config = {
			enabled: true,
			provider: 'openai',
			model: 'gpt-4.1',
			maxGuidancesPerHour: 3,
			analysisDelayMs: 1000,
			interventionThreshold: 0.5,
			apiKeys: {
				openai: 'test-openai-key',
			},
		};

		guidanceSource = new BaseLLMGuidanceSource(config);

		context = {
			terminalOutput: 'Some terminal output from Claude Code',
			projectPath: '/test/project',
			sessionState: 'idle',
			worktreePath: '/test/project',
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('properties', () => {
		it('should have correct static properties', () => {
			expect(guidanceSource.id).toBe('base-llm');
			expect(guidanceSource.priority).toBe(100);
			expect(guidanceSource.canShortCircuit).toBe(false);
		});
	});

	describe('analyze', () => {
		it('should return guidance result when LLM suggests no intervention', async () => {
			const result = await guidanceSource.analyze(context);

			expect(result).toEqual({
				shouldIntervene: false,
				confidence: 0.3,
				guidance: undefined,
				reasoning: 'No intervention needed',
				source: 'base-llm',
				priority: 100,
				metadata: {
					llmProvider: 'OpenAI',
					analysisTimestamp: expect.any(String),
				},
			});
		});

		it('should return guidance result when LLM suggests intervention', async () => {
			const mockLLMResult = {
				shouldIntervene: true,
				confidence: 0.8,
				guidance: 'Try a different approach',
				reasoning: 'Claude seems stuck in a loop',
			};

			// Mock the LLMClient to return intervention result
			const mockLLMClient = (guidanceSource as any).llmClient;
			mockLLMClient.analyzeClaudeOutput.mockResolvedValueOnce(mockLLMResult);

			const result = await guidanceSource.analyze(context);

			expect(result).toEqual({
				shouldIntervene: true,
				confidence: 0.8,
				guidance: 'Try a different approach',
				reasoning: 'Claude seems stuck in a loop',
				source: 'base-llm',
				priority: 100,
				metadata: {
					llmProvider: 'OpenAI',
					analysisTimestamp: expect.any(String),
				},
			});
		});

		it('should handle LLM client errors gracefully', async () => {
			const mockLLMClient = (guidanceSource as any).llmClient;
			const error = new Error('API request failed');
			mockLLMClient.analyzeClaudeOutput.mockRejectedValueOnce(error);

			const result = await guidanceSource.analyze(context);

			expect(result).toEqual({
				shouldIntervene: false,
				confidence: 0,
				reasoning: 'LLM analysis failed: API request failed',
				source: 'base-llm',
				priority: 100,
				metadata: {
					error: true,
					errorMessage: 'API request failed',
				},
			});
		});

		it('should pass correct parameters to LLM client', async () => {
			const mockLLMClient = (guidanceSource as any).llmClient;

			await guidanceSource.analyze(context);

			expect(mockLLMClient.analyzeClaudeOutput).toHaveBeenCalledWith(
				context.terminalOutput,
				context.projectPath,
			);
		});
	});

	describe('updateConfig', () => {
		it('should update LLM client configuration', () => {
			const newConfig = {
				...config,
				provider: 'anthropic' as const,
				model: 'claude-4-sonnet',
			};

			const mockLLMClient = (guidanceSource as any).llmClient;

			guidanceSource.updateConfig(newConfig);

			expect(mockLLMClient.updateConfig).toHaveBeenCalledWith(newConfig);
		});
	});

	describe('isAvailable', () => {
		it('should return LLM client availability', () => {
			const mockLLMClient = (guidanceSource as any).llmClient;
			mockLLMClient.isAvailable.mockReturnValue(true);

			expect(guidanceSource.isAvailable()).toBe(true);

			mockLLMClient.isAvailable.mockReturnValue(false);

			expect(guidanceSource.isAvailable()).toBe(false);
		});
	});

	describe('getCurrentProviderName', () => {
		it('should return current LLM provider name', () => {
			const mockLLMClient = (guidanceSource as any).llmClient;
			mockLLMClient.getCurrentProviderName.mockReturnValue('Anthropic');

			expect(guidanceSource.getCurrentProviderName()).toBe('Anthropic');
		});
	});
});
