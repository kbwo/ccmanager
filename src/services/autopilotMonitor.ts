import {EventEmitter} from 'events';
import type {
	Session,
	AutopilotConfig,
	AutopilotDecision,
	AutopilotMonitorState,
	AnalysisContext,
	GuidanceResult,
} from '../types/index.js';
import {GuidanceOrchestrator} from './guidance/guidanceOrchestrator.js';
import stripAnsi from 'strip-ansi';

export class AutopilotMonitor extends EventEmitter {
	private guidanceOrchestrator: GuidanceOrchestrator;
	private config: AutopilotConfig;

	constructor(config: AutopilotConfig) {
		super();
		this.config = config;
		this.guidanceOrchestrator = new GuidanceOrchestrator(config);
	}

	isLLMAvailable(): boolean {
		const available = this.guidanceOrchestrator.isAvailable();
		console.log(`🔌 Guidance orchestrator availability check: ${available}`);
		return available;
	}

	updateConfig(config: AutopilotConfig): void {
		this.config = config;
		this.guidanceOrchestrator.updateConfig(config);
	}

	enable(session: Session): void {
		if (!session.autopilotState) {
			session.autopilotState = {
				isActive: false,
				guidancesProvided: 0,
				analysisInProgress: false,
			};
		}

		if (session.autopilotState.isActive) {
			console.log('✅ Autopilot already active');
			return; // Already active
		}

		console.log('🟢 Enabling autopilot monitoring');
		session.autopilotState.isActive = true;
		this.startMonitoring(session);
		this.emit('statusChanged', session, 'ACTIVE');
	}

	disable(session: Session): void {
		if (!session.autopilotState || !session.autopilotState.isActive) {
			console.log('✅ Autopilot already inactive');
			return; // Already inactive
		}

		console.log('🔴 Disabling autopilot monitoring');
		session.autopilotState.isActive = false;
		this.stopMonitoring();
		this.emit('statusChanged', session, 'STANDBY');
	}

	toggle(session: Session): boolean {
		if (!session.autopilotState || !session.autopilotState.isActive) {
			this.enable(session);
			return true;
		} else {
			this.disable(session);
			return false;
		}
	}

	getState(session: Session): AutopilotMonitorState | undefined {
		return session.autopilotState;
	}

	private startMonitoring(_session: Session): void {
		this.stopMonitoring(); // Clear any existing listeners

		console.log(`✈️ Starting autopilot monitoring (state-change triggered)`);
		// We'll listen for state changes via sessionManager events instead of using a timer
	}

	private stopMonitoring(): void {
		console.log('🛑 Stopping autopilot monitoring');
		// Remove any event listeners if needed
	}

	// New method to handle state changes from sessionManager
	onSessionStateChanged(
		session: Session,
		oldState: string,
		newState: string,
	): void {
		console.log(
			`📡 Autopilot received state change: ${oldState} → ${newState}, active: ${session.autopilotState?.isActive}, analysisInProgress: ${session.autopilotState?.analysisInProgress}`,
		);

		if (
			!session.autopilotState?.isActive ||
			session.autopilotState.analysisInProgress
		) {
			console.log(`⏸️ Autopilot skipping: not active or analysis in progress`);
			return;
		}

		// Only analyze when Claude Code has finished responding and is idle
		// NOT when Claude is waiting for user input (that's not the right time for guidance)
		const shouldAnalyze = oldState === 'busy' && newState === 'idle';

		if (shouldAnalyze) {
			console.log(`🎯 Autopilot triggered: ${oldState} → ${newState}`);
			// Add a small delay to ensure output is fully captured
			setTimeout(() => {
				this.analyzeSession(session);
			}, this.config.analysisDelayMs);
		} else {
			console.log(
				`⚠️ Autopilot not triggered: ${oldState} → ${newState} (need busy → idle)`,
			);
		}
	}

	private async analyzeSession(session: Session): Promise<void> {
		if (!session.autopilotState || !this.isLLMAvailable()) {
			console.log('🚫 Autopilot analysis skipped - state or LLM not available');
			return;
		}

		// Check rate limiting
		if (!this.canProvideGuidance(session.autopilotState)) {
			console.log('🚫 Autopilot analysis skipped - rate limited');
			return;
		}

		session.autopilotState.analysisInProgress = true;
		console.log('🔍 Autopilot starting analysis...');

		try {
			// Get recent output for analysis
			const recentOutput = this.getRecentOutput(session);
			if (!recentOutput.trim()) {
				console.log('🚫 Autopilot analysis skipped - no output to analyze');
				return; // No output to analyze
			}

			console.log(
				`📝 Analyzing ${recentOutput.length} characters of output...`,
			);

			// Create analysis context for orchestrator
			const context: AnalysisContext = {
				terminalOutput: recentOutput,
				projectPath: session.worktreePath,
				sessionState: session.state,
				worktreePath: session.worktreePath,
			};

			// Use guidance orchestrator instead of direct LLM client
			const guidanceResult =
				await this.guidanceOrchestrator.generateGuidance(context);

			// Convert back to AutopilotDecision for backward compatibility
			const decision = this.convertGuidanceResultToDecision(guidanceResult);

			console.log(
				`🤖 Guidance decision: shouldIntervene=${decision.shouldIntervene}, confidence=${decision.confidence}, source=${guidanceResult.source}`,
			);

			// Use configurable intervention threshold
			const threshold = this.config.interventionThreshold;

			if (
				decision.shouldIntervene &&
				decision.confidence >= threshold &&
				decision.guidance
			) {
				this.provideGuidance(session, decision);
			} else if (decision.shouldIntervene && decision.confidence < threshold) {
				console.log(
					`⚠️ Autopilot: intervention suggested but confidence too low (${decision.confidence} < ${threshold})`,
				);
			} else if (decision.shouldIntervene && !decision.guidance) {
				console.log(
					`⚠️ Autopilot: intervention suggested but no guidance provided`,
				);
			} else {
				console.log(
					`ℹ️ Autopilot: no intervention needed (shouldIntervene: ${decision.shouldIntervene}, confidence: ${decision.confidence}, reasoning: ${decision.reasoning})`,
				);
			}

			this.emit('analysisComplete', session, decision);
		} catch (error) {
			console.log('❌ Autopilot analysis error:', error);
			this.emit('analysisError', session, error);
		} finally {
			if (session.autopilotState) {
				session.autopilotState.analysisInProgress = false;
			}
		}
	}

	private canProvideGuidance(state: AutopilotMonitorState): boolean {
		if (!state.lastGuidanceTime) {
			return true; // First guidance
		}

		const hoursSinceLastGuidance =
			(Date.now() - state.lastGuidanceTime.getTime()) / (1000 * 60 * 60);

		// Reset counter if more than an hour has passed
		if (hoursSinceLastGuidance >= 1) {
			state.guidancesProvided = 0;
			return true;
		}

		return state.guidancesProvided < this.config.maxGuidancesPerHour;
	}

	private getRecentOutput(session: Session): string {
		// Get more lines for better context (20 instead of 10)
		const recentLines = session.output.slice(-20);
		const output = recentLines.join('\n');
		const stripped = stripAnsi(output);
		console.log(
			`📖 Session output: ${session.output.length} lines, recent: ${recentLines.length} lines, stripped: ${stripped.length} chars`,
		);

		// If output is too short, try to get more context
		if (stripped.length < 200 && session.output.length > 20) {
			const moreLines = session.output.slice(-50);
			const moreOutput = moreLines.join('\n');
			const moreStripped = stripAnsi(moreOutput);
			console.log(`📖 Extended context: ${moreStripped.length} chars`);
			return moreStripped;
		}

		return stripped;
	}

	private provideGuidance(session: Session, decision: AutopilotDecision): void {
		if (!session.autopilotState || !decision.guidance) {
			return;
		}

		console.log(`🎯 Autopilot providing guidance: "${decision.guidance}"`);

		// Send guidance directly as user input to Claude Code (without prefix)
		// This allows the autopilot to actually steer Claude Code's work
		session.process.write(decision.guidance + '\n');

		// Update state
		session.autopilotState.guidancesProvided++;
		session.autopilotState.lastGuidanceTime = new Date();

		this.emit('guidanceProvided', session, decision);
	}

	/**
	 * Convert GuidanceResult back to AutopilotDecision for backward compatibility
	 */
	private convertGuidanceResultToDecision(
		guidanceResult: GuidanceResult,
	): AutopilotDecision {
		return {
			shouldIntervene: guidanceResult.shouldIntervene,
			confidence: guidanceResult.confidence,
			guidance: guidanceResult.guidance,
			reasoning: guidanceResult.reasoning,
		};
	}

	/**
	 * Get debug information about the guidance orchestrator
	 */
	getGuidanceDebugInfo(): object {
		return this.guidanceOrchestrator.getDebugInfo();
	}

	destroy(): void {
		this.stopMonitoring();
		this.removeAllListeners();
	}
}
