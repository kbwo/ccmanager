import {
	UserInputPattern,
	LearnedPattern,
	LearningConfig,
} from '../types/index.js';
import {LLMClient} from './llmClient.js';

interface PatternAnalysisResult {
	patterns: LearnedPattern[];
	confidence: number;
	reasoning: string;
}

export class PatternLearnerService {
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

	async analyzePatterns(
		userInputs: UserInputPattern[],
	): Promise<PatternAnalysisResult> {
		if (!this.llmClient || !this.llmClient.isAvailable()) {
			return {
				patterns: [],
				confidence: 0,
				reasoning: 'LLM not available for pattern analysis',
			};
		}

		// Filter to guidance-related inputs only
		const guidanceInputs = userInputs.filter(input => input.isGuidanceRelated);

		if (guidanceInputs.length < 2) {
			return {
				patterns: [],
				confidence: 0,
				reasoning: 'Insufficient guidance inputs for pattern analysis',
			};
		}

		try {
			const prompt = this.buildPatternAnalysisPrompt(guidanceInputs);

			const apiKey = this.llmClient['getApiKeyForProvider'](
				this.llmClient['config'].provider,
			);
			if (!apiKey) {
				return {
					patterns: [],
					confidence: 0,
					reasoning: 'API key not available',
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
				temperature: 0.1, // Low temperature for consistent analysis
			});

			const result = JSON.parse(text) as {
				patterns: Array<{
					category:
						| 'style'
						| 'workflow'
						| 'testing'
						| 'architecture'
						| 'communication';
					instruction: string;
					confidence: number;
					frequency: number;
					examples: string[];
				}>;
				overallConfidence: number;
				reasoning: string;
			};

			// Convert to LearnedPattern format
			const learnedPatterns: LearnedPattern[] = result.patterns
				.filter(p => p.confidence >= this.learningConfig.minPatternConfidence)
				.map(p => ({
					id: this.generatePatternId(),
					category: p.category,
					instruction: p.instruction,
					confidence: p.confidence,
					frequency: p.frequency,
					lastSeen: new Date(),
					approved: false, // Requires user approval
				}));

			return {
				patterns: learnedPatterns,
				confidence: result.overallConfidence,
				reasoning: result.reasoning,
			};
		} catch (error) {
			return {
				patterns: [],
				confidence: 0,
				reasoning: `Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private buildPatternAnalysisPrompt(
		guidanceInputs: UserInputPattern[],
	): string {
		// Group inputs by type and create examples
		const instructions = guidanceInputs
			.filter(input => input.inputType === 'instruction')
			.map(input => `- "${input.input}"`);

		const corrections = guidanceInputs
			.filter(input => input.inputType === 'correction')
			.map(input => `- "${input.input}"`);

		const questions = guidanceInputs
			.filter(input => input.inputType === 'question')
			.map(input => `- "${input.input}"`);

		return `
You are analyzing user interactions to extract recurring guidance patterns and preferences for an AI coding assistant.

GUIDANCE INPUTS TO ANALYZE:

Instructions (${instructions.length}):
${instructions.join('\n')}

Corrections (${corrections.length}):
${corrections.join('\n')}

Questions (${questions.length}):
${questions.join('\n')}

Your task is to identify recurring themes and preferences that would be useful for future AI assistance.

Look for patterns in:
1. **Style Preferences**: Code formatting, naming conventions, language features
2. **Workflow Patterns**: Testing approaches, development processes, tool usage
3. **Architecture Guidance**: Component structure, design patterns, organization
4. **Testing Philosophy**: When to test, what to test, testing tools/frameworks
5. **Communication Style**: Level of detail, explanation preferences, interaction style

For each pattern you identify:
- Extract a clear, actionable instruction
- Assess confidence (0.0-1.0) based on frequency and consistency
- Count how many inputs support this pattern
- Categorize appropriately

Only include patterns with confidence >= ${this.learningConfig.minPatternConfidence}

Respond with JSON in this exact format:
{
  "patterns": [
    {
      "category": "style" | "workflow" | "testing" | "architecture" | "communication",
      "instruction": "Clear, actionable instruction for future guidance",
      "confidence": number (0.0-1.0),
      "frequency": number (how many inputs support this),
      "examples": ["relevant input examples that led to this pattern"]
    }
  ],
  "overallConfidence": number (0.0-1.0),
  "reasoning": "Brief explanation of analysis approach and findings"
}

Guidelines:
- Be conservative: only extract patterns with strong evidence
- Make instructions specific and actionable
- Avoid overgeneralization from limited data
- Consider context and avoid misinterpretation
- Focus on preferences that would genuinely improve future assistance
`.trim();
	}

	private generatePatternId(): string {
		return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Analyze a specific input to determine if it reveals new guidance patterns
	 */
	async analyzeNewInput(
		input: UserInputPattern,
		existingPatterns: LearnedPattern[],
	): Promise<LearnedPattern[]> {
		if (
			!this.llmClient ||
			!this.llmClient.isAvailable() ||
			!input.isGuidanceRelated
		) {
			return [];
		}

		try {
			const prompt = `
Analyze this user input to see if it reveals new guidance patterns not already captured.

USER INPUT: "${input.input}"
CONTEXT: "${input.context}"
TYPE: ${input.inputType}

EXISTING PATTERNS:
${existingPatterns.map(p => `- ${p.category}: ${p.instruction}`).join('\n')}

Determine if this input suggests any new guidance patterns that aren't already covered by existing patterns.

Respond with JSON:
{
  "newPatterns": [
    {
      "category": "style" | "workflow" | "testing" | "architecture" | "communication",
      "instruction": "Clear, actionable instruction",
      "confidence": number (0.0-1.0),
      "reasoning": "Why this is a new pattern"
    }
  ],
  "reasoning": "Analysis of whether new patterns were found"
}

Only suggest patterns with confidence >= ${this.learningConfig.minPatternConfidence}
`;

			const apiKey = this.llmClient['getApiKeyForProvider'](
				this.llmClient['config'].provider,
			);
			if (!apiKey) return [];

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

			const result = JSON.parse(text) as {
				newPatterns: Array<{
					category:
						| 'style'
						| 'workflow'
						| 'testing'
						| 'architecture'
						| 'communication';
					instruction: string;
					confidence: number;
					reasoning: string;
				}>;
			};

			return result.newPatterns
				.filter(p => p.confidence >= this.learningConfig.minPatternConfidence)
				.map(p => ({
					id: this.generatePatternId(),
					category: p.category,
					instruction: p.instruction,
					confidence: p.confidence,
					frequency: 1,
					lastSeen: new Date(),
					approved: false,
				}));
		} catch (error) {
			console.warn('Failed to analyze new input for patterns:', error);
			return [];
		}
	}

	/**
	 * Update confidence and frequency of existing patterns based on new evidence
	 */
	updatePatternConfidence(
		pattern: LearnedPattern,
		supportingInputs: UserInputPattern[],
	): LearnedPattern {
		const relevantInputs = supportingInputs.filter(input => {
			const firstWord = pattern.instruction.toLowerCase().split(' ')[0];
			return (
				input.isGuidanceRelated &&
				firstWord &&
				input.input.toLowerCase().includes(firstWord)
			);
		});

		const newFrequency = relevantInputs.length;
		const confidenceBoost = Math.min(0.1, newFrequency * 0.02);
		const newConfidence = Math.min(1.0, pattern.confidence + confidenceBoost);

		return {
			...pattern,
			confidence: newConfidence,
			frequency: newFrequency,
			lastSeen: new Date(),
		};
	}

	/**
	 * Merge similar patterns to avoid duplication
	 */
	async mergeSimilarPatterns(
		patterns: LearnedPattern[],
	): Promise<LearnedPattern[]> {
		if (
			!this.llmClient ||
			!this.llmClient.isAvailable() ||
			patterns.length < 2
		) {
			return patterns;
		}

		try {
			const prompt = `
Analyze these guidance patterns and identify any that are similar or overlapping:

PATTERNS:
${patterns.map((p, i) => `${i + 1}. [${p.category}] ${p.instruction} (confidence: ${p.confidence})`).join('\n')}

Identify groups of similar patterns that should be merged. For each group, suggest a merged pattern that captures the essence of all patterns in the group.

Respond with JSON:
{
  "mergeGroups": [
    {
      "patternIndexes": [1, 3], // 1-based indexes of patterns to merge
      "mergedPattern": {
        "category": "appropriate category",
        "instruction": "Combined instruction that captures all patterns",
        "reasoning": "Why these patterns should be merged"
      }
    }
  ],
  "reasoning": "Overall analysis of pattern similarities"
}
`;

			const apiKey = this.llmClient['getApiKeyForProvider'](
				this.llmClient['config'].provider,
			);
			if (!apiKey) return patterns;

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

			const result = JSON.parse(text) as {
				mergeGroups: Array<{
					patternIndexes: number[];
					mergedPattern: {
						category:
							| 'style'
							| 'workflow'
							| 'testing'
							| 'architecture'
							| 'communication';
						instruction: string;
						reasoning: string;
					};
				}>;
			};

			// Apply merges
			const mergedPatterns = [...patterns];
			const toRemove = new Set<number>();

			for (const group of result.mergeGroups) {
				if (group.patternIndexes.length < 2) continue;

				// Get patterns to merge (convert to 0-based indexing)
				const patternsToMerge = group.patternIndexes
					.map(i => patterns[i - 1])
					.filter(p => p); // Filter out undefined

				if (patternsToMerge.length < 2) continue;

				// Create merged pattern
				const mergedPattern: LearnedPattern = {
					id: this.generatePatternId(),
					category: group.mergedPattern.category,
					instruction: group.mergedPattern.instruction,
					confidence: Math.max(...patternsToMerge.map(p => p?.confidence ?? 0)),
					frequency: patternsToMerge.reduce(
						(sum, p) => sum + (p?.frequency ?? 0),
						0,
					),
					lastSeen: new Date(),
					approved: false,
				};

				// Mark original patterns for removal
				for (const index of group.patternIndexes) {
					toRemove.add(index - 1); // Convert to 0-based
				}

				// Add merged pattern
				mergedPatterns.push(mergedPattern);
			}

			// Remove original patterns that were merged
			return mergedPatterns.filter((_, index) => !toRemove.has(index));
		} catch (error) {
			console.warn('Failed to merge similar patterns:', error);
			return patterns;
		}
	}
}
