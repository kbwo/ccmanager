import type {
	GuidanceSource,
	AnalysisContext,
	GuidanceResult,
	AutopilotConfig,
} from '../../types/index.js';
import {LLMClient} from '../llmClient.js';

/**
 * Base LLM Guidance Source - wraps existing LLMClient functionality
 * This is the foundation guidance source that provides general LLM-based analysis
 */
export class BaseLLMGuidanceSource implements GuidanceSource {
	public readonly id = 'base-llm';
	public readonly priority = 100; // Lowest priority - fallback option
	public readonly canShortCircuit = false; // General analysis doesn't short-circuit

	private llmClient: LLMClient;

	constructor(config: AutopilotConfig) {
		this.llmClient = new LLMClient(config);
	}

	async analyze(context: AnalysisContext): Promise<GuidanceResult> {
		try {
			// Use existing LLMClient logic
			const decision = await this.llmClient.analyzeClaudeOutput(
				context.terminalOutput,
				context.projectPath,
			);

			// Convert AutopilotDecision to GuidanceResult
			return {
				shouldIntervene: decision.shouldIntervene,
				confidence: decision.confidence,
				guidance: decision.guidance,
				reasoning: decision.reasoning,
				source: this.id,
				priority: this.priority,
				metadata: {
					llmProvider: this.llmClient.getCurrentProviderName(),
					analysisTimestamp: new Date().toISOString(),
				},
			};
		} catch (error) {
			// Return safe fallback result on error
			return {
				shouldIntervene: false,
				confidence: 0,
				reasoning: `LLM analysis failed: ${error instanceof Error ? error.message : String(error)}`,
				source: this.id,
				priority: this.priority,
				metadata: {
					error: true,
					errorMessage: error instanceof Error ? error.message : String(error),
				},
			};
		}
	}

	/**
	 * Update the LLM configuration
	 */
	updateConfig(config: AutopilotConfig): void {
		this.llmClient.updateConfig(config);
	}

	/**
	 * Check if LLM is available for analysis
	 */
	isAvailable(): boolean {
		return this.llmClient.isAvailable();
	}

	/**
	 * Get current LLM provider name for debugging
	 */
	getCurrentProviderName(): string {
		return this.llmClient.getCurrentProviderName();
	}
}
