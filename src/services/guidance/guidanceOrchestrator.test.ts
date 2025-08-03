/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {GuidanceOrchestrator} from './guidanceOrchestrator.js';
import type {
	AutopilotConfig,
	AnalysisContext,
	GuidanceSource,
} from '../../types/index.js';

// Mock BaseLLMGuidanceSource
vi.mock('./baseLLMGuidanceSource.js', () => ({
	BaseLLMGuidanceSource: vi.fn().mockImplementation(() => ({
		id: 'base-llm',
		priority: 100,
		canShortCircuit: false,
		analyze: vi.fn().mockResolvedValue({
			shouldIntervene: false,
			confidence: 0.3,
			reasoning: 'No intervention needed',
			source: 'base-llm',
			priority: 100,
		}),
		updateConfig: vi.fn(),
		isAvailable: vi.fn().mockReturnValue(true),
	})),
}));

describe('GuidanceOrchestrator', () => {
	let orchestrator: GuidanceOrchestrator;
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

		orchestrator = new GuidanceOrchestrator(config);

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

	describe('constructor', () => {
		it('should initialize with pattern and LLM sources', () => {
			const sourceIds = orchestrator.getSourceIds();
			expect(sourceIds).toContain('base-llm');
			expect(sourceIds).toContain('pattern-detection');
			expect(sourceIds).toHaveLength(2);
		});
	});

	describe('addSource', () => {
		it('should add a new guidance source', () => {
			const mockSource: GuidanceSource = {
				id: 'test-source',
				priority: 50,
				canShortCircuit: true,
				analyze: vi.fn().mockResolvedValue({
					shouldIntervene: false,
					confidence: 0.2,
					reasoning: 'Test source result',
					source: 'test-source',
					priority: 50,
				}),
			};

			orchestrator.addSource(mockSource);

			const sourceIds = orchestrator.getSourceIds();
			expect(sourceIds).toContain('test-source');
			expect(sourceIds).toHaveLength(3);
		});

		it('should throw error when adding duplicate source ID', () => {
			const mockSource1: GuidanceSource = {
				id: 'duplicate-id',
				priority: 50,
				canShortCircuit: true,
				analyze: vi.fn(),
			};

			const mockSource2: GuidanceSource = {
				id: 'duplicate-id',
				priority: 60,
				canShortCircuit: false,
				analyze: vi.fn(),
			};

			orchestrator.addSource(mockSource1);

			expect(() => orchestrator.addSource(mockSource2)).toThrow(
				"Guidance source with ID 'duplicate-id' already exists",
			);
		});
	});

	describe('removeSource', () => {
		it('should remove an existing source', () => {
			const result = orchestrator.removeSource('base-llm');
			expect(result).toBe(true);
			expect(orchestrator.getSourceIds()).toHaveLength(1);
		});

		it('should return false when removing non-existent source', () => {
			const result = orchestrator.removeSource('non-existent');
			expect(result).toBe(false);
		});
	});

	describe('generateGuidance', () => {
		it('should return no guidance when no sources available', async () => {
			orchestrator.removeSource('base-llm');
			orchestrator.removeSource('pattern-detection');

			const result = await orchestrator.generateGuidance(context);

			expect(result).toEqual({
				shouldIntervene: false,
				confidence: 0,
				reasoning: 'No guidance sources available',
				source: 'orchestrator',
				priority: 999,
				metadata: {
					noGuidanceReason: 'No guidance sources available',
				},
			});
		});

		it('should run sources in priority order', async () => {
			const highPrioritySource: GuidanceSource = {
				id: 'high-priority',
				priority: 10,
				canShortCircuit: false,
				analyze: vi.fn().mockResolvedValue({
					shouldIntervene: true,
					confidence: 0.8,
					guidance: 'High priority guidance',
					reasoning: 'High priority detected issue',
					source: 'high-priority',
					priority: 10,
				}),
			};

			const lowPrioritySource: GuidanceSource = {
				id: 'low-priority',
				priority: 200,
				canShortCircuit: false,
				analyze: vi.fn().mockResolvedValue({
					shouldIntervene: true,
					confidence: 0.9,
					guidance: 'Low priority guidance',
					reasoning: 'Low priority detected issue',
					source: 'low-priority',
					priority: 200,
				}),
			};

			orchestrator.addSource(highPrioritySource);
			orchestrator.addSource(lowPrioritySource);

			const result = await orchestrator.generateGuidance(context);

			// Should choose high priority source despite lower confidence
			expect(result.source).toBe('high-priority');
			expect(result.guidance).toBe('High priority guidance');
		});

		it('should short-circuit on high confidence when allowed', async () => {
			const shortCircuitSource: GuidanceSource = {
				id: 'short-circuit',
				priority: 10,
				canShortCircuit: true,
				analyze: vi.fn().mockResolvedValue({
					shouldIntervene: true,
					confidence: 0.95, // High confidence
					guidance: 'Short circuit guidance',
					reasoning: 'High confidence intervention',
					source: 'short-circuit',
					priority: 10,
				}),
			};

			const laterSource: GuidanceSource = {
				id: 'later-source',
				priority: 20,
				canShortCircuit: false,
				analyze: vi.fn().mockResolvedValue({
					shouldIntervene: false,
					confidence: 0.3,
					reasoning: 'Later source result',
					source: 'later-source',
					priority: 20,
				}),
			};

			orchestrator.addSource(shortCircuitSource);
			orchestrator.addSource(laterSource);

			const result = await orchestrator.generateGuidance(context);

			// Should short-circuit and not call later source
			expect(shortCircuitSource.analyze).toHaveBeenCalled();
			expect(laterSource.analyze).not.toHaveBeenCalled();
			expect(result.source).toBe('short-circuit');
		});

		it('should handle source errors gracefully', async () => {
			const errorSource: GuidanceSource = {
				id: 'error-source',
				priority: 10,
				canShortCircuit: false,
				analyze: vi.fn().mockRejectedValue(new Error('Source error')),
			};

			orchestrator.addSource(errorSource);

			const result = await orchestrator.generateGuidance(context);

			// Should return no intervention result since no sources recommend intervention
			expect(result.source).toBe('orchestrator');
			expect(result.shouldIntervene).toBe(false);
			expect(result.reasoning).toBe('No intervention recommended');
		});

		it('should return no intervention when no sources recommend it', async () => {
			// Base LLM source already mocked to return shouldIntervene: false

			const result = await orchestrator.generateGuidance(context);

			expect(result).toEqual({
				shouldIntervene: false,
				confidence: 0,
				reasoning: 'No intervention recommended',
				source: 'orchestrator',
				priority: 999,
				metadata: {
					noGuidanceReason: 'No intervention recommended',
				},
			});
		});

		it('should include analysis metadata in response when intervention is recommended', async () => {
			// Add a source that recommends intervention to trigger metadata inclusion
			const interventionSource: GuidanceSource = {
				id: 'intervention-source',
				priority: 50,
				canShortCircuit: false,
				analyze: vi.fn().mockResolvedValue({
					shouldIntervene: true,
					confidence: 0.8,
					guidance: 'Test intervention',
					reasoning: 'Test needs help',
					source: 'intervention-source',
					priority: 50,
				}),
			};

			orchestrator.addSource(interventionSource);

			const result = await orchestrator.generateGuidance(context);

			expect(result.metadata).toHaveProperty('analysisContext');
			expect(result.metadata?.['analysisContext']).toHaveProperty(
				'totalSources',
			);
			expect(result.metadata?.['analysisContext']).toHaveProperty(
				'sourcesAnalyzed',
			);
			expect(result.metadata?.['analysisContext']).toHaveProperty(
				'sourceResults',
			);
		});
	});

	describe('updateConfig', () => {
		it('should update base LLM source configuration', () => {
			const newConfig = {
				...config,
				provider: 'anthropic' as const,
			};

			// Get the base LLM source
			const baseLLMSource = (orchestrator as any).sources.get('base-llm');

			orchestrator.updateConfig(newConfig);

			expect(baseLLMSource.updateConfig).toHaveBeenCalledWith(newConfig);
		});
	});

	describe('isAvailable', () => {
		it('should return true when pattern source exists', () => {
			// Pattern source always exists and makes orchestrator available
			expect(orchestrator.isAvailable()).toBe(true);
		});

		it('should return false when no sources available', () => {
			orchestrator.removeSource('base-llm');
			orchestrator.removeSource('pattern-detection');

			expect(orchestrator.isAvailable()).toBe(false);
		});
	});

	describe('getDebugInfo', () => {
		it('should return debug information about orchestrator state', () => {
			const debugInfo = orchestrator.getDebugInfo();

			expect(debugInfo).toEqual({
				sourceCount: 2,
				sources: [
					{
						id: 'pattern-detection',
						priority: 10,
						canShortCircuit: true,
					},
					{
						id: 'base-llm',
						priority: 100,
						canShortCircuit: false,
					},
				],
				isAvailable: true,
			});
		});
	});
});
