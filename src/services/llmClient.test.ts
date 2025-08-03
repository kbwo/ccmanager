import {describe, it, expect, beforeEach, vi} from 'vitest';
import {LLMClient} from './llmClient.js';
import type {AutopilotConfig} from '../types/index.js';

// Mock Vercel AI SDK
vi.mock('ai', () => ({
	generateText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
	createOpenAI: vi
		.fn()
		.mockReturnValue((model: string) => `mock-openai-model-${model}`),
}));

vi.mock('@ai-sdk/anthropic', () => ({
	createAnthropic: vi
		.fn()
		.mockReturnValue((model: string) => `mock-anthropic-model-${model}`),
}));

describe('LLMClient', () => {
	let llmClient: LLMClient;
	let mockConfig: AutopilotConfig;
	let mockGenerateText: any; // eslint-disable-line @typescript-eslint/no-explicit-any

	beforeEach(async () => {
		vi.clearAllMocks();

		// Mock environment variables
		process.env['OPENAI_API_KEY'] = 'test-openai-key';
		process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';

		mockConfig = {
			enabled: true,
			provider: 'openai',
			model: 'gpt-4.1',
			maxGuidancesPerHour: 3,
			analysisDelayMs: 3000,
			apiKeys: {
				openai: 'test-openai-key',
				anthropic: 'test-anthropic-key',
			},
		};

		const ai = await import('ai');
		mockGenerateText = vi.mocked(ai.generateText);

		llmClient = new LLMClient(mockConfig);
	});

	describe('isAvailable', () => {
		it('should return true when API key is available', () => {
			expect(llmClient.isAvailable()).toBe(true);
		});

		it('should return false when API key is not available', () => {
			// Clear environment variables
			delete process.env['OPENAI_API_KEY'];
			delete process.env['ANTHROPIC_API_KEY'];

			const configWithoutKey = {
				...mockConfig,
				apiKeys: {},
			};
			const clientWithoutKey = new LLMClient(configWithoutKey);
			expect(clientWithoutKey.isAvailable()).toBe(false);

			// Restore environment variables for other tests
			process.env['OPENAI_API_KEY'] = 'test-openai-key';
			process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
		});

		it('should work with different providers', () => {
			const anthropicConfig = {
				...mockConfig,
				provider: 'anthropic' as const,
				apiKeys: {anthropic: 'test-anthropic-key'},
			};
			const anthropicClient = new LLMClient(anthropicConfig);
			expect(anthropicClient.isAvailable()).toBe(true);
		});

		it('should return false when config key not available (no environment fallback)', () => {
			// Config without API keys - should not fallback to env vars
			const configWithoutKeys = {
				...mockConfig,
				apiKeys: {},
			};
			const client = new LLMClient(configWithoutKeys);
			expect(client.isAvailable()).toBe(false); // No environment variable fallback
		});
	});

	describe('provider information', () => {
		it('should return current provider name', () => {
			expect(llmClient.getCurrentProviderName()).toBe('OpenAI');
		});

		it('should return supported models for OpenAI', () => {
			const models = llmClient.getSupportedModels();
			expect(models).toContain('gpt-4.1');
			expect(models).toContain('o4-mini');
			expect(models).toContain('o3');
		});

		it('should return supported models for Anthropic', () => {
			const anthropicConfig = {
				...mockConfig,
				provider: 'anthropic' as const,
				apiKeys: {anthropic: 'test-anthropic-key'},
			};
			const anthropicClient = new LLMClient(anthropicConfig);
			const models = anthropicClient.getSupportedModels();
			expect(models).toContain('claude-4-sonnet');
			expect(models).toContain('claude-4-opus');
		});

		it('should return available providers', () => {
			const providers = llmClient.getAvailableProviders();
			expect(providers).toHaveLength(2);
			expect(providers[0]).toMatchObject({
				name: 'OpenAI',
				available: true,
			});
			expect(providers[1]).toMatchObject({
				name: 'Anthropic',
				available: true,
			});
		});
	});

	describe('analyzeClaudeOutput', () => {
		it('should return intervention decision when Claude needs help', async () => {
			const mockResponse = {
				shouldIntervene: true,
				guidance: 'Try breaking this into smaller steps',
				confidence: 0.8,
				reasoning: 'Claude is repeating the same task',
			};

			mockGenerateText.mockResolvedValue({
				text: JSON.stringify(mockResponse),
			});

			const result = await llmClient.analyzeClaudeOutput(
				'Repeating the same task over and over',
			);

			expect(result).toEqual(mockResponse);
			expect(mockGenerateText).toHaveBeenCalledWith({
				model: 'mock-openai-model-gpt-4.1',
				prompt: expect.stringContaining('Claude Code terminal output'),
				temperature: 0.3,
			});
		});

		it('should return no intervention when Claude is working normally', async () => {
			const mockResponse = {
				shouldIntervene: false,
				confidence: 0.3,
				reasoning: 'Claude is making normal progress',
			};

			mockGenerateText.mockResolvedValue({
				text: JSON.stringify(mockResponse),
			});

			const result = await llmClient.analyzeClaudeOutput(
				'Making good progress on the task',
			);

			expect(result).toEqual(mockResponse);
		});

		it('should handle API errors gracefully', async () => {
			mockGenerateText.mockRejectedValue(new Error('API Error'));

			const result = await llmClient.analyzeClaudeOutput('Some output');

			expect(result.shouldIntervene).toBe(false);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('Analysis failed');
		});

		it('should handle invalid JSON responses', async () => {
			mockGenerateText.mockResolvedValue({
				text: 'Invalid JSON response',
			});

			const result = await llmClient.analyzeClaudeOutput('Some output');

			expect(result.shouldIntervene).toBe(false);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('Analysis failed');
		});

		it('should return no intervention when API key is not available', async () => {
			// Clear environment variables
			delete process.env['OPENAI_API_KEY'];
			delete process.env['ANTHROPIC_API_KEY'];

			const configWithoutKey = {
				...mockConfig,
				apiKeys: {},
			};
			const clientWithoutKey = new LLMClient(configWithoutKey);

			const result = await clientWithoutKey.analyzeClaudeOutput('Some output');

			expect(result.shouldIntervene).toBe(false);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('API key not configured');

			// Restore environment variables for other tests
			process.env['OPENAI_API_KEY'] = 'test-openai-key';
			process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
		});

		it('should validate unsupported models', async () => {
			const invalidConfig = {...mockConfig, model: 'invalid-model'};
			const clientWithInvalidModel = new LLMClient(invalidConfig);

			const result =
				await clientWithInvalidModel.analyzeClaudeOutput('Some output');

			expect(result.shouldIntervene).toBe(false);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('Unsupported model');
		});
	});

	describe('configuration updates', () => {
		it('should update configuration', () => {
			const newConfig: AutopilotConfig = {
				enabled: false,
				provider: 'anthropic',
				model: 'claude-4-sonnet',
				maxGuidancesPerHour: 5,
				analysisDelayMs: 2000,
				apiKeys: {
					anthropic: 'test-anthropic-key',
				},
			};

			llmClient.updateConfig(newConfig);
			expect(llmClient.getCurrentProviderName()).toBe('Anthropic');
		});
	});

	describe('static methods', () => {
		it('should return available providers statically', () => {
			const providers = LLMClient.getAvailableProviders();
			expect(providers).toHaveLength(2);
		});

		it('should return all supported models statically', () => {
			const modelsByProvider = LLMClient.getAllSupportedModels();
			expect(modelsByProvider).toHaveLength(2);
			expect(modelsByProvider[0]).toMatchObject({
				provider: 'OpenAI',
				models: expect.arrayContaining(['gpt-4.1']),
			});
		});

		it('should check provider availability with config', () => {
			// Clear environment variables to test config-only behavior
			delete process.env['OPENAI_API_KEY'];
			delete process.env['ANTHROPIC_API_KEY'];

			const configWithOpenAI = {
				...mockConfig,
				apiKeys: {openai: 'test-key'},
			};
			expect(LLMClient.isProviderAvailable('openai', configWithOpenAI)).toBe(
				true,
			);
			expect(LLMClient.isProviderAvailable('anthropic', configWithOpenAI)).toBe(
				false,
			);

			// Restore environment variables
			process.env['OPENAI_API_KEY'] = 'test-openai-key';
			process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
		});

		it('should return false when no config provided (no environment fallback)', () => {
			// No config provided - should not use environment variables
			expect(LLMClient.isProviderAvailable('openai')).toBe(false);
			expect(LLMClient.isProviderAvailable('anthropic')).toBe(false);
		});

		it('should get available provider keys from config', () => {
			const configWithBoth = {
				...mockConfig,
				apiKeys: {
					openai: 'test-openai-key',
					anthropic: 'test-anthropic-key',
				},
			};
			const availableKeys = LLMClient.getAvailableProviderKeys(configWithBoth);
			expect(availableKeys).toContain('openai');
			expect(availableKeys).toContain('anthropic');
		});

		it('should check if any provider keys are available', () => {
			// Clear environment variables to test config-only behavior
			delete process.env['OPENAI_API_KEY'];
			delete process.env['ANTHROPIC_API_KEY'];

			const configWithKeys = {
				...mockConfig,
				apiKeys: {openai: 'test-key'},
			};
			const configWithoutKeys = {
				...mockConfig,
				apiKeys: {},
			};
			expect(LLMClient.hasAnyProviderKeys(configWithKeys)).toBe(true);
			expect(LLMClient.hasAnyProviderKeys(configWithoutKeys)).toBe(false);

			// Restore environment variables
			process.env['OPENAI_API_KEY'] = 'test-openai-key';
			process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
		});
	});
});
