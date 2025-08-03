import {generateText, type LanguageModel} from 'ai';
import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';
import type {AutopilotDecision, AutopilotConfig} from '../types/index.js';

type SupportedProvider = 'openai' | 'anthropic';

interface ProviderInfo {
	name: string;
	models: string[];
	createModel: (modelName: string) => LanguageModel;
}

const PROVIDERS: Record<SupportedProvider, ProviderInfo> = {
	openai: {
		name: 'OpenAI',
		models: ['gpt-4.1', 'o4-mini', 'o3'],
		createModel: (model: string) => {
			const provider = createOpenAI();
			return provider(model);
		},
	},
	anthropic: {
		name: 'Anthropic',
		models: ['claude-4-sonnet', 'claude-4-opus'],
		createModel: (model: string) => {
			const provider = createAnthropic();
			return provider(model);
		},
	},
};

export class LLMClient {
	private config: AutopilotConfig;

	constructor(config: AutopilotConfig) {
		this.config = config;
	}

	updateConfig(config: AutopilotConfig): void {
		this.config = config;
	}

	isAvailable(): boolean {
		const provider = PROVIDERS[this.config.provider];
		if (!provider) return false;

		const apiKey = this.getApiKeyForProvider(this.config.provider);
		return Boolean(apiKey);
	}

	private getApiKeyForProvider(
		provider: SupportedProvider,
	): string | undefined {
		// Only use API keys from config - no environment variable fallback
		return this.config.apiKeys?.[provider];
	}

	private createModelWithApiKey(
		provider: SupportedProvider,
		model: string,
		apiKey: string,
	) {
		switch (provider) {
			case 'openai':
				return createOpenAI({apiKey})(model);
			case 'anthropic':
				return createAnthropic({apiKey})(model);
			default:
				throw new Error(`Unknown provider: ${provider}`);
		}
	}

	getCurrentProviderName(): string {
		const provider = PROVIDERS[this.config.provider];
		return provider?.name ?? 'Unknown';
	}

	getSupportedModels(): string[] {
		const provider = PROVIDERS[this.config.provider];
		return provider?.models ?? [];
	}

	static isProviderAvailable(
		provider: SupportedProvider,
		config?: AutopilotConfig,
	): boolean {
		const providerInfo = PROVIDERS[provider];
		if (!providerInfo) return false;

		// Only check config - no environment variable fallback
		return Boolean(config?.apiKeys?.[provider]);
	}

	static getAvailableProviderKeys(
		config?: AutopilotConfig,
	): SupportedProvider[] {
		return Object.keys(PROVIDERS).filter(provider =>
			LLMClient.isProviderAvailable(provider as SupportedProvider, config),
		) as SupportedProvider[];
	}

	static hasAnyProviderKeys(config?: AutopilotConfig): boolean {
		return LLMClient.getAvailableProviderKeys(config).length > 0;
	}

	getAvailableProviders(): Array<{
		name: string;
		models: string[];
		available: boolean;
	}> {
		return Object.entries(PROVIDERS).map(([key, provider]) => ({
			name: provider.name,
			models: provider.models,
			available: Boolean(this.getApiKeyForProvider(key as SupportedProvider)),
		}));
	}

	async analyzeClaudeOutput(
		output: string,
		projectPath?: string,
	): Promise<AutopilotDecision> {
		if (!this.isAvailable()) {
			const provider = PROVIDERS[this.config.provider];
			return {
				shouldIntervene: false,
				confidence: 0,
				reasoning: `${provider?.name ?? 'Provider'} API key not configured`,
			};
		}

		const provider = PROVIDERS[this.config.provider];
		if (!provider) {
			return {
				shouldIntervene: false,
				confidence: 0,
				reasoning: `Unknown provider: ${this.config.provider}`,
			};
		}

		if (!provider.models.includes(this.config.model)) {
			return {
				shouldIntervene: false,
				confidence: 0,
				reasoning: `Unsupported model: ${this.config.model} for provider ${provider.name}`,
			};
		}

		try {
			const apiKey = this.getApiKeyForProvider(this.config.provider);
			if (!apiKey) {
				return {
					shouldIntervene: false,
					confidence: 0,
					reasoning: `API key not available for ${provider.name}`,
				};
			}

			const model = this.createModelWithApiKey(
				this.config.provider,
				this.config.model,
				apiKey,
			);
			const prompt = this.buildAnalysisPrompt(output, projectPath);

			const {text} = await generateText({
				model,
				prompt,
				temperature: 0.3,
			});

			// Parse JSON response
			const decision = JSON.parse(text) as AutopilotDecision;

			// Validate response structure
			if (
				typeof decision.shouldIntervene !== 'boolean' ||
				typeof decision.confidence !== 'number' ||
				typeof decision.reasoning !== 'string'
			) {
				throw new Error('Invalid response structure');
			}

			return decision;
		} catch (error) {
			return {
				shouldIntervene: false,
				confidence: 0,
				reasoning: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private buildAnalysisPrompt(output: string, projectPath?: string): string {
		let projectContext = '';
		let userGuidance = '';

		// Add user's custom guidance if available
		if (this.config.guidePrompt) {
			userGuidance = `\n\nUSER'S GUIDANCE INSTRUCTIONS:
${this.config.guidePrompt}

Focus guidance on these user preferences while maintaining general helpfulness.`;
		}

		// Try to read project documentation for context
		if (projectPath) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const fs = require('fs');
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const path = require('path');

				// Look for common documentation files
				const docFiles = ['CLAUDE.md', 'README.md', 'package.json'];
				const foundDocs: string[] = [];

				for (const docFile of docFiles) {
					const filePath = path.join(projectPath, docFile);
					if (fs.existsSync(filePath)) {
						try {
							const content = fs.readFileSync(filePath, 'utf8');
							// Limit content to prevent prompt bloat
							const truncated =
								content.length > 2000
									? content.substring(0, 2000) + '...'
									: content;
							foundDocs.push(`${docFile}:\n${truncated}`);
						} catch (_e) {
							// Ignore read errors
						}
					}
				}

				if (foundDocs.length > 0) {
					projectContext = `\n\nPROJECT CONTEXT:\n${foundDocs.join('\n\n---\n\n')}`;
				}
			} catch (_e) {
				// Ignore any filesystem errors
			}
		}

		return `
You are an AI assistant monitoring Claude Code sessions. Your job is to detect when Claude needs guidance and provide brief, actionable suggestions.

Analyze this Claude Code terminal output and determine if Claude needs guidance:

TERMINAL OUTPUT:
${output}${projectContext}${userGuidance}

Look for patterns indicating Claude needs help:
- Repetitive behavior or loops
- Error messages being ignored  
- Confusion or uncertainty in responses
- Getting stuck on the same task
- Making the same mistakes repeatedly
- Overthinking simple problems
- Not following project conventions or patterns
- Missing obvious solutions based on project structure
- Struggling with project-specific tools or frameworks

Enhanced Decision Criteria:
- Consider project context when evaluating if Claude is stuck
- Look for signs Claude isn't using available project information
- Detect when Claude is reinventing solutions that already exist in the project
- Notice if Claude is struggling with project-specific commands or workflows
- Be more proactive about offering guidance when patterns suggest Claude could benefit

Respond with JSON in this exact format:
{
  "shouldIntervene": boolean,
  "guidance": "Brief actionable suggestion (max 60 chars)" or null,
  "confidence": number (0-1),
  "reasoning": "Why you made this decision"
}

Updated Guidelines:
- The user has configurable intervention thresholds (typically 0.3-0.7)
- Be more proactive about helping with project-specific issues
- Consider context from project documentation
- Help when Claude seems to be working inefficiently relative to project setup
- Focus on actionable guidance that leverages project knowledge
- Provide confidence scores that accurately reflect the certainty of your assessment
`.trim();
	}

	// Static methods for provider discovery
	static getAvailableProviders(): Array<{
		name: string;
		models: string[];
		available: boolean;
	}> {
		return Object.entries(PROVIDERS).map(([_key, provider]) => ({
			name: provider.name,
			models: provider.models,
			available: false, // No environment variables - must be configured via UI
		}));
	}

	static getAllSupportedModels(): Array<{provider: string; models: string[]}> {
		return Object.entries(PROVIDERS).map(([_key, provider]) => ({
			provider: provider.name,
			models: provider.models,
		}));
	}
}
