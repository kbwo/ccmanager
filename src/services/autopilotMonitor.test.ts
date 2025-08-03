/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {AutopilotMonitor} from './autopilotMonitor.js';
import type {Session, AutopilotConfig} from '../types/index.js';

// Mock GuidanceOrchestrator
vi.mock('./guidance/guidanceOrchestrator.js', () => ({
	GuidanceOrchestrator: vi.fn().mockImplementation(() => ({
		isAvailable: vi.fn().mockReturnValue(true),
		updateConfig: vi.fn(),
		getDebugInfo: vi.fn().mockReturnValue({
			sourceCount: 1,
			sources: [{id: 'base-llm', priority: 100, canShortCircuit: false}],
			isAvailable: true,
		}),
		generateGuidance: vi.fn().mockResolvedValue({
			shouldIntervene: false,
			confidence: 0.3,
			reasoning: 'No intervention needed',
			source: 'base-llm',
			priority: 100,
		}),
	})),
}));

// Mock stripAnsi
vi.mock('strip-ansi', () => ({
	default: vi.fn((str: string) => str),
}));

describe('AutopilotMonitor', () => {
	let autopilotMonitor: AutopilotMonitor;
	let mockSession: Session;
	let config: AutopilotConfig;

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
				anthropic: 'test-anthropic-key',
			},
		};

		autopilotMonitor = new AutopilotMonitor(config);

		mockSession = {
			id: 'test-session',
			worktreePath: '/test/path',
			process: {
				write: vi.fn(),
			} as any,
			state: 'idle',
			output: ['test output line 1', 'test output line 2'],
			outputHistory: [],
			lastActivity: new Date(),
			isActive: true,
			terminal: {} as any,
		};
	});

	afterEach(() => {
		autopilotMonitor.destroy();
		vi.clearAllTimers();
	});

	describe('enable/disable', () => {
		it('should enable auto-pilot monitoring', () => {
			autopilotMonitor.enable(mockSession);

			expect(mockSession.autopilotState?.isActive).toBe(true);
		});

		it('should disable auto-pilot monitoring', () => {
			autopilotMonitor.enable(mockSession);
			autopilotMonitor.disable(mockSession);

			expect(mockSession.autopilotState?.isActive).toBe(false);
		});

		it('should emit status change events', () => {
			const statusChangeSpy = vi.fn();
			autopilotMonitor.on('statusChanged', statusChangeSpy);

			autopilotMonitor.enable(mockSession);
			expect(statusChangeSpy).toHaveBeenCalledWith(mockSession, 'ACTIVE');

			autopilotMonitor.disable(mockSession);
			expect(statusChangeSpy).toHaveBeenCalledWith(mockSession, 'STANDBY');
		});
	});

	describe('toggle', () => {
		it('should toggle from disabled to enabled', () => {
			const result = autopilotMonitor.toggle(mockSession);

			expect(result).toBe(true);
			expect(mockSession.autopilotState?.isActive).toBe(true);
		});

		it('should toggle from enabled to disabled', () => {
			autopilotMonitor.enable(mockSession);
			const result = autopilotMonitor.toggle(mockSession);

			expect(result).toBe(false);
			expect(mockSession.autopilotState?.isActive).toBe(false);
		});
	});

	describe('rate limiting', () => {
		beforeEach(() => {
			autopilotMonitor.enable(mockSession);
			// Mock the guidance orchestrator to return intervention
			const orchestrator = (autopilotMonitor as any).guidanceOrchestrator;
			orchestrator.generateGuidance.mockResolvedValue({
				shouldIntervene: true,
				guidance: 'Test guidance',
				confidence: 0.8,
				reasoning: 'Test reasoning',
				source: 'base-llm',
				priority: 100,
			});
		});

		it('should respect max guidances per hour limit', () => {
			const state = mockSession.autopilotState!;

			// Simulate hitting the limit
			state.guidancesProvided = 3;
			state.lastGuidanceTime = new Date();

			// Should not be able to provide more guidance
			const canProvide = (autopilotMonitor as any).canProvideGuidance(state);
			expect(canProvide).toBe(false);
		});

		it('should reset counter after an hour', () => {
			const state = mockSession.autopilotState!;

			// Simulate guidance from over an hour ago
			state.guidancesProvided = 3;
			state.lastGuidanceTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

			// Should be able to provide guidance again
			const canProvide = (autopilotMonitor as any).canProvideGuidance(state);
			expect(canProvide).toBe(true);
		});
	});

	describe('guidance provision', () => {
		it('should provide guidance to session when intervention is needed', async () => {
			const orchestrator = (autopilotMonitor as any).guidanceOrchestrator;
			orchestrator.generateGuidance.mockResolvedValue({
				shouldIntervene: true,
				guidance: 'Try a different approach',
				confidence: 0.9,
				reasoning: 'Claude seems stuck',
				source: 'base-llm',
				priority: 100,
			});

			autopilotMonitor.enable(mockSession);

			// Manually trigger analysis
			await (autopilotMonitor as any).analyzeSession(mockSession);

			expect(mockSession.process.write).toHaveBeenCalledWith(
				'Try a different approach\n',
			);
			expect(mockSession.autopilotState?.guidancesProvided).toBe(1);
		});

		it('should not provide guidance when no intervention is needed', async () => {
			const orchestrator = (autopilotMonitor as any).guidanceOrchestrator;
			orchestrator.generateGuidance.mockResolvedValue({
				shouldIntervene: false,
				confidence: 0.3,
				reasoning: 'Everything looks fine',
				source: 'base-llm',
				priority: 100,
			});

			autopilotMonitor.enable(mockSession);

			// Manually trigger analysis
			await (autopilotMonitor as any).analyzeSession(mockSession);

			expect(mockSession.process.write).not.toHaveBeenCalled();
			expect(mockSession.autopilotState?.guidancesProvided).toBe(0);
		});
	});

	describe('state change triggering', () => {
		it('should NOT trigger analysis when state changes from busy to waiting_input', async () => {
			autopilotMonitor.enable(mockSession);

			// Spy on analyzeSession method
			const analyzeSessionSpy = vi.spyOn(
				autopilotMonitor as any,
				'analyzeSession',
			);

			// Simulate state change from busy to waiting_input (should NOT trigger)
			autopilotMonitor.onSessionStateChanged(
				mockSession,
				'busy',
				'waiting_input',
			);

			// Wait to ensure no delayed analysis
			await new Promise(resolve => setTimeout(resolve, 1100));

			expect(analyzeSessionSpy).not.toHaveBeenCalled();
		});

		it('should trigger analysis when state changes from busy to idle', async () => {
			autopilotMonitor.enable(mockSession);

			// Spy on analyzeSession method
			const analyzeSessionSpy = vi.spyOn(
				autopilotMonitor as any,
				'analyzeSession',
			);

			// Simulate state change from busy to idle (should trigger)
			autopilotMonitor.onSessionStateChanged(mockSession, 'busy', 'idle');

			// Wait for the delayed analysis
			await new Promise(resolve => setTimeout(resolve, 1100));

			expect(analyzeSessionSpy).toHaveBeenCalledWith(mockSession);
		});

		it('should NOT trigger analysis for other state changes', async () => {
			autopilotMonitor.enable(mockSession);

			// Spy on analyzeSession method
			const analyzeSessionSpy = vi.spyOn(
				autopilotMonitor as any,
				'analyzeSession',
			);

			// Simulate state changes that should NOT trigger analysis
			autopilotMonitor.onSessionStateChanged(mockSession, 'idle', 'busy');
			autopilotMonitor.onSessionStateChanged(
				mockSession,
				'waiting_input',
				'busy',
			);
			autopilotMonitor.onSessionStateChanged(
				mockSession,
				'idle',
				'waiting_input',
			);

			// Wait to ensure no delayed analysis
			await new Promise(resolve => setTimeout(resolve, 1100));

			expect(analyzeSessionSpy).not.toHaveBeenCalled();
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
				interventionThreshold: 0.7,
				apiKeys: {
					anthropic: 'test-anthropic-key',
				},
			};

			autopilotMonitor.updateConfig(newConfig);

			expect((autopilotMonitor as any).config).toEqual(newConfig);
		});
	});

	describe('error handling', () => {
		it('should handle guidance orchestrator errors gracefully', async () => {
			const orchestrator = (autopilotMonitor as any).guidanceOrchestrator;
			orchestrator.generateGuidance.mockRejectedValue(new Error('API Error'));

			const errorSpy = vi.fn();
			autopilotMonitor.on('analysisError', errorSpy);

			autopilotMonitor.enable(mockSession);

			// Manually trigger analysis
			await (autopilotMonitor as any).analyzeSession(mockSession);

			expect(errorSpy).toHaveBeenCalledWith(mockSession, expect.any(Error));
			expect(mockSession.autopilotState?.analysisInProgress).toBe(false);
		});
	});
});
