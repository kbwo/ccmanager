import {UserInputPattern, LearningConfig} from '../types/index.js';
import {LLMClient} from './llmClient.js';

interface PatternTracker {
	trackUserInput(
		sessionId: string,
		input: string,
		context: string,
		inputType: 'instruction' | 'correction' | 'question',
	): Promise<void>;
	getPatterns(sessionId?: string): UserInputPattern[];
	clearPatterns(sessionId?: string): void;
	clearOldPatterns(): void;
}

export class PatternTrackerService implements PatternTracker {
	private patterns: UserInputPattern[] = [];
	private learningConfig: LearningConfig;
	private llmClient?: LLMClient;

	constructor(learningConfig: LearningConfig, llmClient?: LLMClient) {
		this.learningConfig = learningConfig;
		this.llmClient = llmClient;
	}

	updateConfig(learningConfig: LearningConfig, llmClient?: LLMClient): void {
		this.learningConfig = learningConfig;
		this.llmClient = llmClient;
	}

	async trackUserInput(
		sessionId: string,
		input: string,
		context: string,
		inputType: 'instruction' | 'correction' | 'question',
	): Promise<void> {
		// Only track if learning is enabled
		if (!this.learningConfig.enabled) {
			return;
		}

		// Skip empty or very short inputs
		if (!input.trim() || input.trim().length < 3) {
			return;
		}

		try {
			// Determine if input is guidance-related using LLM if available
			let isGuidanceRelated = false;
			if (this.llmClient && this.llmClient.isAvailable()) {
				isGuidanceRelated = await this.isGuidanceRelated(input, context);
			} else {
				// Fallback to keyword-based detection
				isGuidanceRelated = this.isGuidanceRelatedKeyword(input);
			}

			const pattern: UserInputPattern = {
				sessionId,
				timestamp: new Date(),
				input: input.trim(),
				context: context.substring(0, 500), // Limit context size
				inputType,
				isGuidanceRelated,
			};

			this.patterns.push(pattern);

			// Clean up old patterns periodically
			this.cleanupOldPatterns();
		} catch (_error) {
			// Silently fail - don't disrupt the user experience
			console.warn('Failed to track user input pattern:', _error);
		}
	}

	private async isGuidanceRelated(
		input: string,
		context: string,
	): Promise<boolean> {
		if (!this.llmClient) return false;

		try {
			const prompt = `
Determine if this user input contains guidance, instructions, or preferences that would be useful for future AI assistance.

User Input: "${input}"
Context: "${context.substring(0, 200)}"

Look for:
- Instructions about coding style or approach
- Corrections or preferences about how tasks should be done
- Workflow or process guidance
- Quality standards or requirements
- Framework or tool preferences

Respond with JSON: {"isGuidanceRelated": boolean, "reasoning": "brief explanation"}
`.trim();

			const apiKey = this.llmClient['getApiKeyForProvider'](
				this.llmClient['config'].provider,
			);
			if (!apiKey) {
				return this.isGuidanceRelatedKeyword(input);
			}

			const model = this.llmClient['createModelWithApiKey'](
				this.llmClient['config'].provider,
				this.llmClient['config'].model,
				apiKey,
			);

			const {generateText} = await import('ai');
			const {text} = await generateText({
				model,
				prompt,
				temperature: 0.1,
			});

			const result = JSON.parse(text);
			return result.isGuidanceRelated === true;
		} catch (_error) {
			// Fallback to keyword detection
			return this.isGuidanceRelatedKeyword(input);
		}
	}

	private isGuidanceRelatedKeyword(input: string): boolean {
		const guidanceKeywords = [
			'should',
			'prefer',
			'always',
			'never',
			'make sure',
			'remember',
			'use',
			"don't",
			'avoid',
			'better',
			'instead',
			'try',
			'focus',
			'check',
			'test',
			'write',
			'follow',
			'pattern',
			'style',
			'convention',
		];

		const lowerInput = input.toLowerCase();
		return guidanceKeywords.some(keyword => lowerInput.includes(keyword));
	}

	getPatterns(sessionId?: string): UserInputPattern[] {
		if (sessionId) {
			return this.patterns.filter(p => p.sessionId === sessionId);
		}
		return [...this.patterns];
	}

	clearPatterns(sessionId?: string): void {
		if (sessionId) {
			this.patterns = this.patterns.filter(p => p.sessionId !== sessionId);
		} else {
			this.patterns = [];
		}
	}

	clearOldPatterns(): void {
		this.cleanupOldPatterns();
	}

	private cleanupOldPatterns(): void {
		const retentionMs = this.learningConfig.retentionDays * 24 * 60 * 60 * 1000;
		const cutoffDate = new Date(Date.now() - retentionMs);

		this.patterns = this.patterns.filter(
			pattern => pattern.timestamp > cutoffDate,
		);
	}

	// Get guidance-related patterns for learning
	getGuidancePatterns(sessionId?: string): UserInputPattern[] {
		return this.getPatterns(sessionId).filter(p => p.isGuidanceRelated);
	}

	// Get pattern statistics
	getPatternStats(): {
		total: number;
		guidanceRelated: number;
		byType: Record<string, number>;
		bySession: Record<string, number>;
	} {
		const total = this.patterns.length;
		const guidanceRelated = this.patterns.filter(
			p => p.isGuidanceRelated,
		).length;

		const byType: Record<string, number> = {};
		const bySession: Record<string, number> = {};

		for (const pattern of this.patterns) {
			byType[pattern.inputType] = (byType[pattern.inputType] || 0) + 1;
			bySession[pattern.sessionId] = (bySession[pattern.sessionId] || 0) + 1;
		}

		return {total, guidanceRelated, byType, bySession};
	}
}
