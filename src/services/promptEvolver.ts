import {LearnedPattern} from '../types/index.js';
import {LLMClient} from './llmClient.js';

interface PromptEvolutionResult {
	updatedPrompt: string;
	confidence: number;
	reasoning: string;
	changesApplied: string[];
}

export class PromptEvolverService {
	private llmClient?: LLMClient;

	constructor(llmClient?: LLMClient) {
		this.llmClient = llmClient;
	}

	updateConfig(llmClient?: LLMClient): void {
		this.llmClient = llmClient;
	}

	/**
	 * Generate an updated guide prompt by incorporating approved learned patterns
	 */
	async evolveGuidePrompt(
		currentPrompt: string | undefined,
		approvedPatterns: LearnedPattern[],
	): Promise<PromptEvolutionResult> {
		if (!this.llmClient || !this.llmClient.isAvailable()) {
			return {
				updatedPrompt: currentPrompt || '',
				confidence: 0,
				reasoning: 'LLM not available for prompt evolution',
				changesApplied: [],
			};
		}

		if (approvedPatterns.length === 0) {
			return {
				updatedPrompt: currentPrompt || '',
				confidence: 1.0,
				reasoning: 'No approved patterns to incorporate',
				changesApplied: [],
			};
		}

		try {
			const prompt = this.buildPromptEvolutionPrompt(
				currentPrompt,
				approvedPatterns,
			);

			const apiKey = this.llmClient['getApiKeyForProvider'](
				this.llmClient['config'].provider,
			);
			if (!apiKey) {
				return {
					updatedPrompt: currentPrompt || '',
					confidence: 0,
					reasoning: 'API key not available',
					changesApplied: [],
				};
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
				temperature: 0.2, // Low temperature for consistent, conservative updates
			});

			const result = JSON.parse(text) as {
				updatedPrompt: string;
				confidence: number;
				reasoning: string;
				changesApplied: string[];
				preservedOriginal: boolean;
			};

			return {
				updatedPrompt: result.updatedPrompt,
				confidence: result.confidence,
				reasoning: result.reasoning,
				changesApplied: result.changesApplied,
			};
		} catch (error) {
			return {
				updatedPrompt: currentPrompt || '',
				confidence: 0,
				reasoning: `Prompt evolution failed: ${error instanceof Error ? error.message : String(error)}`,
				changesApplied: [],
			};
		}
	}

	private buildPromptEvolutionPrompt(
		currentPrompt: string | undefined,
		approvedPatterns: LearnedPattern[],
	): string {
		const patternsByCategory = this.groupPatternsByCategory(approvedPatterns);

		return `
You are updating a user's guide prompt for an AI coding assistant. Your job is to incorporate learned patterns while preserving the user's original intent and style.

CURRENT GUIDE PROMPT:
${currentPrompt || '(No current prompt - create a new one)'}

APPROVED LEARNED PATTERNS TO INCORPORATE:

Style Patterns (${patternsByCategory.style.length}):
${patternsByCategory.style.map(p => `- ${p.instruction} (confidence: ${p.confidence})`).join('\n')}

Workflow Patterns (${patternsByCategory.workflow.length}):
${patternsByCategory.workflow.map(p => `- ${p.instruction} (confidence: ${p.confidence})`).join('\n')}

Testing Patterns (${patternsByCategory.testing.length}):
${patternsByCategory.testing.map(p => `- ${p.instruction} (confidence: ${p.confidence})`).join('\n')}

Architecture Patterns (${patternsByCategory.architecture.length}):
${patternsByCategory.architecture.map(p => `- ${p.instruction} (confidence: ${p.confidence})`).join('\n')}

Communication Patterns (${patternsByCategory.communication.length}):
${patternsByCategory.communication.map(p => `- ${p.instruction} (confidence: ${p.confidence})`).join('\n')}

INSTRUCTIONS:
1. If there's a current prompt, preserve its core intent and style
2. Incorporate the learned patterns in a natural, coherent way
3. Avoid redundancy - don't repeat similar instructions
4. Keep the updated prompt concise but comprehensive
5. Maintain the user's tone and level of detail
6. Organize patterns logically (group related concepts)
7. Be conservative - only make changes that clearly improve the prompt

RULES:
- If current prompt already covers a pattern, don't duplicate it
- Prioritize higher-confidence patterns
- Keep the prompt under 500 words
- Maintain readability and clarity
- Preserve any specific technical requirements from the original

Respond with JSON in this exact format:
{
  "updatedPrompt": "The evolved guide prompt incorporating learned patterns",
  "confidence": number (0.0-1.0 - how confident you are in this update),
  "reasoning": "Brief explanation of changes made and why",
  "changesApplied": ["List of specific changes/additions made"],
  "preservedOriginal": boolean (whether original prompt content was preserved)
}

Guidelines:
- Be very conservative about changing existing content
- Only add patterns that genuinely enhance the guidance
- Ensure the final prompt feels natural and cohesive
- If patterns conflict with original prompt, favor the original
- High confidence (>0.8) only if changes are clearly beneficial
`.trim();
	}

	private groupPatternsByCategory(patterns: LearnedPattern[]) {
		return {
			style: patterns.filter(p => p.category === 'style'),
			workflow: patterns.filter(p => p.category === 'workflow'),
			testing: patterns.filter(p => p.category === 'testing'),
			architecture: patterns.filter(p => p.category === 'architecture'),
			communication: patterns.filter(p => p.category === 'communication'),
		};
	}

	/**
	 * Preview how patterns would be incorporated without actually updating
	 */
	async previewPromptEvolution(
		currentPrompt: string | undefined,
		patterns: LearnedPattern[],
	): Promise<{
		preview: string;
		addedInstructions: string[];
		potentialConflicts: string[];
		recommendation: string;
	}> {
		if (!this.llmClient || !this.llmClient.isAvailable()) {
			return {
				preview: currentPrompt || '',
				addedInstructions: [],
				potentialConflicts: [],
				recommendation: 'LLM not available for preview',
			};
		}

		try {
			const prompt = `
Analyze how these learned patterns would be incorporated into this guide prompt:

CURRENT PROMPT:
${currentPrompt || '(No current prompt)'}

PATTERNS TO INCORPORATE:
${patterns.map(p => `- [${p.category}] ${p.instruction} (confidence: ${p.confidence})`).join('\n')}

Provide a preview of changes without actually updating the prompt.

Respond with JSON:
{
  "preview": "What the updated prompt would look like",
  "addedInstructions": ["New instructions that would be added"],
  "potentialConflicts": ["Any patterns that might conflict with existing content"],
  "recommendation": "Whether to proceed with update and why"
}
`;

			const apiKey = this.llmClient['getApiKeyForProvider'](
				this.llmClient['config'].provider,
			);
			if (!apiKey) {
				return {
					preview: currentPrompt || '',
					addedInstructions: [],
					potentialConflicts: [],
					recommendation: 'API key not available',
				};
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

			return JSON.parse(text);
		} catch (error) {
			return {
				preview: currentPrompt || '',
				addedInstructions: [],
				potentialConflicts: [],
				recommendation: `Preview failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Merge multiple guide prompts from different users or sessions
	 */
	async mergeGuidePrompts(
		prompts: Array<{prompt: string; weight: number}>,
	): Promise<PromptEvolutionResult> {
		if (!this.llmClient || !this.llmClient.isAvailable()) {
			return {
				updatedPrompt: prompts[0]?.prompt || '',
				confidence: 0,
				reasoning: 'LLM not available for prompt merging',
				changesApplied: [],
			};
		}

		if (prompts.length <= 1) {
			return {
				updatedPrompt: prompts[0]?.prompt || '',
				confidence: 1.0,
				reasoning: 'Only one prompt provided, no merging needed',
				changesApplied: [],
			};
		}

		try {
			const prompt = `
Merge these guide prompts into a single, cohesive prompt that captures the best elements from each:

PROMPTS TO MERGE:
${prompts
	.map(
		(p, i) => `
Prompt ${i + 1} (weight: ${p.weight}):
${p.prompt}
`,
	)
	.join('\n---\n')}

Create a merged prompt that:
1. Preserves the most important guidance from all prompts
2. Eliminates redundancy and conflicts
3. Maintains clarity and readability
4. Weighs prompts according to their importance
5. Results in a coherent, actionable guide

Respond with JSON:
{
  "updatedPrompt": "The merged guide prompt",
  "confidence": number (0.0-1.0),
  "reasoning": "Explanation of merge approach and decisions",
  "changesApplied": ["Key elements incorporated from each prompt"]
}
`;

			const apiKey = this.llmClient['getApiKeyForProvider'](
				this.llmClient['config'].provider,
			);
			if (!apiKey) {
				return {
					updatedPrompt: prompts[0]?.prompt || '',
					confidence: 0,
					reasoning: 'API key not available',
					changesApplied: [],
				};
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
				temperature: 0.2,
			});

			return JSON.parse(text);
		} catch (error) {
			return {
				updatedPrompt: prompts[0]?.prompt || '',
				confidence: 0,
				reasoning: `Prompt merging failed: ${error instanceof Error ? error.message : String(error)}`,
				changesApplied: [],
			};
		}
	}

	/**
	 * Validate that a prompt evolution is safe and beneficial
	 */
	validatePromptEvolution(
		original: string | undefined,
		evolved: string,
		patterns: LearnedPattern[],
	): {
		isValid: boolean;
		issues: string[];
		suggestions: string[];
	} {
		const issues: string[] = [];
		const suggestions: string[] = [];

		// Basic validation
		if (!evolved.trim()) {
			issues.push('Evolved prompt is empty');
		}

		if (evolved.length > 1000) {
			issues.push('Evolved prompt is too long (>1000 characters)');
			suggestions.push('Consider making the prompt more concise');
		}

		// Check if evolution actually incorporates patterns
		const incorporatedPatterns = patterns.filter(pattern =>
			evolved
				.toLowerCase()
				.includes(pattern.instruction.toLowerCase().substring(0, 20)),
		);

		if (incorporatedPatterns.length === 0 && patterns.length > 0) {
			issues.push('No learned patterns appear to be incorporated');
		}

		// Check if original content is preserved (if exists)
		if (original && original.trim()) {
			const originalWords = new Set(original.toLowerCase().split(/\s+/));
			const evolvedWords = new Set(evolved.toLowerCase().split(/\s+/));
			const preservedWords = [...originalWords].filter(word =>
				evolvedWords.has(word),
			);
			const preservationRatio = preservedWords.length / originalWords.size;

			if (preservationRatio < 0.3) {
				issues.push('Too much original content was lost in evolution');
				suggestions.push('Try to preserve more of the original prompt content');
			}
		}

		// Check for reasonable length
		if (evolved.split(/\s+/).length < 5) {
			issues.push('Evolved prompt is too short to be useful');
		}

		return {
			isValid: issues.length === 0,
			issues,
			suggestions,
		};
	}
}
