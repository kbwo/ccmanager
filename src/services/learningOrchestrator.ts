import {EventEmitter} from 'events';
import {
	AutopilotConfig,
	LearnedPattern,
	LearningConfig,
} from '../types/index.js';
import {PatternTrackerService} from './patternTracker.js';
import {PatternLearnerService} from './patternLearner.js';
import {PromptEvolverService} from './promptEvolver.js';
import {LLMClient} from './llmClient.js';

// interface LearningNotification {
// 	type: 'patterns_detected' | 'prompt_evolution_ready' | 'learning_error';
// 	data: unknown;
// 	timestamp: Date;
// }

interface PendingPromptUpdate {
	id: string;
	originalPrompt: string | undefined;
	suggestedPrompt: string;
	patterns: LearnedPattern[];
	confidence: number;
	reasoning: string;
	changesApplied: string[];
	timestamp: Date;
}

export class LearningOrchestratorService extends EventEmitter {
	private patternTracker: PatternTrackerService;
	private patternLearner: PatternLearnerService;
	private promptEvolver: PromptEvolverService;
	private learningConfig: LearningConfig;
	private llmClient?: LLMClient;

	// State management
	private learnedPatterns: LearnedPattern[] = [];
	private pendingPatterns: LearnedPattern[] = [];
	private pendingPromptUpdates: PendingPromptUpdate[] = [];
	private lastAnalysisTime?: Date;

	constructor(autopilotConfig: AutopilotConfig) {
		super();

		// Initialize with default learning config if not provided
		this.learningConfig = autopilotConfig.learningConfig || {
			enabled: false,
			approvalRequired: false, // When learning is enabled, auto-approve patterns
			retentionDays: 30, // Keep user input patterns for 30 days before auto-deletion
			minPatternConfidence: 0.7, // Only use patterns with 70%+ confidence from LLM
		};

		// Initialize LLM client if available
		if (autopilotConfig.enabled) {
			this.llmClient = new LLMClient(autopilotConfig);
		}

		// Initialize services
		this.patternTracker = new PatternTrackerService(
			this.learningConfig,
			this.llmClient,
		);
		this.patternLearner = new PatternLearnerService(
			this.learningConfig,
			this.llmClient,
		);
		this.promptEvolver = new PromptEvolverService(this.llmClient);
	}

	updateConfig(autopilotConfig: AutopilotConfig): void {
		this.learningConfig = autopilotConfig.learningConfig || this.learningConfig;

		// Update LLM client
		if (autopilotConfig.enabled) {
			if (!this.llmClient) {
				this.llmClient = new LLMClient(autopilotConfig);
			} else {
				this.llmClient.updateConfig(autopilotConfig);
			}
		}

		// Update all services
		this.patternTracker.updateConfig(this.learningConfig, this.llmClient);
		this.patternLearner.updateConfig(this.learningConfig, this.llmClient);
		this.promptEvolver.updateConfig(this.llmClient);
	}

	/**
	 * Track user input and potentially trigger learning
	 */
	async trackUserInput(
		sessionId: string,
		input: string,
		context: string,
		inputType: 'instruction' | 'correction' | 'question',
	): Promise<void> {
		if (!this.learningConfig.enabled) {
			return;
		}

		try {
			// Track the input
			await this.patternTracker.trackUserInput(
				sessionId,
				input,
				context,
				inputType,
			);

			// Periodically analyze patterns (every 10 tracked inputs)
			const patterns = this.patternTracker.getPatterns();
			if (patterns.length > 0 && patterns.length % 10 === 0) {
				await this.analyzeAndLearnPatterns();
			}
		} catch (error) {
			this.emit('learning_error', {
				error,
				context: 'tracking user input',
				sessionId,
			});
		}
	}

	/**
	 * Analyze tracked patterns and learn new guidance
	 */
	async analyzeAndLearnPatterns(): Promise<void> {
		if (!this.learningConfig.enabled || !this.llmClient) {
			return;
		}

		try {
			const allPatterns = this.patternTracker.getGuidancePatterns();

			if (allPatterns.length < 3) {
				return; // Need more patterns for meaningful analysis
			}

			// Analyze patterns for learning
			const analysisResult =
				await this.patternLearner.analyzePatterns(allPatterns);

			if (analysisResult.patterns.length > 0) {
				// Add to pending patterns (requires approval)
				const newPatterns = analysisResult.patterns.filter(
					newPattern =>
						!this.isPatternDuplicate(newPattern, [
							...this.learnedPatterns,
							...this.pendingPatterns,
						]),
				);

				if (newPatterns.length > 0) {
					this.pendingPatterns.push(...newPatterns);
					this.lastAnalysisTime = new Date();

					this.emit('patterns_detected', {
						patterns: newPatterns,
						confidence: analysisResult.confidence,
						reasoning: analysisResult.reasoning,
						totalPending: this.pendingPatterns.length,
					});

					// If approval is not required, auto-approve patterns
					if (!this.learningConfig.approvalRequired) {
						await this.approvePatterns(newPatterns.map(p => p.id));
					}
				}
			}
		} catch (error) {
			this.emit('learning_error', {
				error,
				context: 'analyzing patterns',
			});
		}
	}

	/**
	 * Approve specific patterns and potentially update guide prompt
	 */
	async approvePatterns(patternIds: string[]): Promise<void> {
		const approvedPatterns = this.pendingPatterns.filter(p =>
			patternIds.includes(p.id),
		);

		if (approvedPatterns.length === 0) {
			return;
		}

		// Move patterns from pending to learned
		approvedPatterns.forEach(pattern => {
			pattern.approved = true;
			this.learnedPatterns.push(pattern);
		});

		// Remove from pending
		this.pendingPatterns = this.pendingPatterns.filter(
			p => !patternIds.includes(p.id),
		);

		// Check if we should suggest a prompt update
		if (approvedPatterns.length > 0) {
			await this.considerPromptEvolution();
		}

		this.emit('patterns_approved', {
			approvedPatterns,
			totalLearned: this.learnedPatterns.length,
		});
	}

	/**
	 * Reject specific patterns
	 */
	rejectPatterns(patternIds: string[]): void {
		this.pendingPatterns = this.pendingPatterns.filter(
			p => !patternIds.includes(p.id),
		);

		this.emit('patterns_rejected', {
			rejectedCount: patternIds.length,
			remainingPending: this.pendingPatterns.length,
		});
	}

	/**
	 * Consider whether to suggest a prompt evolution
	 */
	private async considerPromptEvolution(): Promise<void> {
		if (!this.llmClient || this.learnedPatterns.length === 0) {
			return;
		}

		// Get current guide prompt from config
		const currentPrompt = this.llmClient['config'].guidePrompt;

		try {
			// Generate prompt evolution suggestion
			const evolutionResult = await this.promptEvolver.evolveGuidePrompt(
				currentPrompt,
				this.learnedPatterns,
			);

			if (
				evolutionResult.confidence > 0.5 &&
				evolutionResult.changesApplied.length > 0
			) {
				const update: PendingPromptUpdate = {
					id: this.generateUpdateId(),
					originalPrompt: currentPrompt,
					suggestedPrompt: evolutionResult.updatedPrompt,
					patterns: [...this.learnedPatterns],
					confidence: evolutionResult.confidence,
					reasoning: evolutionResult.reasoning,
					changesApplied: evolutionResult.changesApplied,
					timestamp: new Date(),
				};

				this.pendingPromptUpdates.push(update);

				this.emit('prompt_evolution_ready', {
					update,
					totalPendingUpdates: this.pendingPromptUpdates.length,
				});
			}
		} catch (error) {
			this.emit('learning_error', {
				error,
				context: 'considering prompt evolution',
			});
		}
	}

	/**
	 * Apply a pending prompt update
	 */
	async applyPromptUpdate(updateId: string): Promise<boolean> {
		const update = this.pendingPromptUpdates.find(u => u.id === updateId);
		if (!update) {
			return false;
		}

		try {
			// Validate the update
			const validation = this.promptEvolver.validatePromptEvolution(
				update.originalPrompt,
				update.suggestedPrompt,
				update.patterns,
			);

			if (!validation.isValid) {
				this.emit('learning_error', {
					error: new Error(
						`Invalid prompt update: ${validation.issues.join(', ')}`,
					),
					context: 'applying prompt update',
				});
				return false;
			}

			// Apply the update (this would need to update the actual config)
			// For now, we just emit an event for the UI to handle
			this.emit('prompt_update_applied', {
				updateId,
				newPrompt: update.suggestedPrompt,
				changesApplied: update.changesApplied,
			});

			// Remove the update from pending
			this.pendingPromptUpdates = this.pendingPromptUpdates.filter(
				u => u.id !== updateId,
			);

			return true;
		} catch (error) {
			this.emit('learning_error', {
				error,
				context: 'applying prompt update',
			});
			return false;
		}
	}

	/**
	 * Get all pending patterns for review
	 */
	getPendingPatterns(): LearnedPattern[] {
		return [...this.pendingPatterns];
	}

	/**
	 * Get all learned (approved) patterns
	 */
	getLearnedPatterns(): LearnedPattern[] {
		return [...this.learnedPatterns];
	}

	/**
	 * Get pending prompt updates
	 */
	getPendingPromptUpdates(): PendingPromptUpdate[] {
		return [...this.pendingPromptUpdates];
	}

	/**
	 * Get learning statistics
	 */
	getStats(): {
		trackedInputs: number;
		guidanceInputs: number;
		learnedPatterns: number;
		pendingPatterns: number;
		pendingUpdates: number;
		lastAnalysis?: Date;
	} {
		const stats = this.patternTracker.getPatternStats();

		return {
			trackedInputs: stats.total,
			guidanceInputs: stats.guidanceRelated,
			learnedPatterns: this.learnedPatterns.length,
			pendingPatterns: this.pendingPatterns.length,
			pendingUpdates: this.pendingPromptUpdates.length,
			lastAnalysis: this.lastAnalysisTime,
		};
	}

	/**
	 * Clear all learning data
	 */
	clearLearningData(): void {
		this.patternTracker.clearPatterns();
		this.learnedPatterns = [];
		this.pendingPatterns = [];
		this.pendingPromptUpdates = [];
		this.lastAnalysisTime = undefined;

		this.emit('learning_data_cleared');
	}

	/**
	 * Export learning data for backup or sharing
	 */
	exportLearningData(): {
		learnedPatterns: LearnedPattern[];
		config: LearningConfig;
		stats: {
			trackedInputs: number;
			guidanceInputs: number;
			learnedPatterns: number;
			pendingPatterns: number;
			pendingUpdates: number;
			lastAnalysis?: Date;
		};
		exportDate: Date;
	} {
		return {
			learnedPatterns: this.learnedPatterns,
			config: this.learningConfig,
			stats: this.getStats(),
			exportDate: new Date(),
		};
	}

	// Helper methods
	private isPatternDuplicate(
		newPattern: LearnedPattern,
		existingPatterns: LearnedPattern[],
	): boolean {
		return existingPatterns.some(
			existing =>
				existing.category === newPattern.category &&
				existing.instruction.toLowerCase().trim() ===
					newPattern.instruction.toLowerCase().trim(),
		);
	}

	private generateUpdateId(): string {
		return `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
