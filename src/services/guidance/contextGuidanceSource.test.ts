import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {ContextGuidanceSource} from './contextGuidanceSource.js';
import {contextBuilder} from '../contextBuilder.js';
import {contextPatterns} from '../contextPatterns.js';
import type {
	AnalysisContext,
	AutopilotConfig,
	ProjectContext,
} from '../../types/index.js';

// Mock the context services
vi.mock('../contextBuilder.js');
vi.mock('../contextPatterns.js');

const mockContextBuilder = vi.mocked(contextBuilder);
const mockContextPatterns = vi.mocked(contextPatterns);

describe('ContextGuidanceSource', () => {
	let contextGuidanceSource: ContextGuidanceSource;
	let mockConfig: AutopilotConfig;
	let mockContext: AnalysisContext;
	let mockProjectContext: ProjectContext;

	beforeEach(() => {
		mockConfig = {
			enabled: true,
			provider: 'openai',
			model: 'gpt-4',
			maxGuidancesPerHour: 3,
			analysisDelayMs: 3000,
			interventionThreshold: 0.7,
			apiKeys: {openai: 'test-key'},
			context: {
				enabled: true,
				frameworkDetection: true,
				gitIntegration: true,
				cacheRefreshIntervalMs: 300000,
				contextPatterns: {} as any,
			},
		};

		mockProjectContext = {
			projectType: {
				framework: 'react',
				language: 'typescript',
				buildSystem: 'npm',
				testFramework: 'vitest',
				patterns: [],
			},
			recentFiles: ['src/App.tsx', 'src/components/Button.tsx'],
			packageInfo: {
				name: 'test-app',
				version: '1.0.0',
				dependencies: {react: '^18.0.0'},
				devDependencies: {vitest: '^1.0.0'},
				scripts: {test: 'vitest'},
			},
			cacheTimestamp: new Date(),
			cacheDurationMs: 300000,
		};

		mockContext = {
			terminalOutput: 'Some terminal output',
			projectPath: '/test/project',
			sessionState: 'idle',
			worktreePath: '/test/project',
			projectContext: mockProjectContext,
		};

		contextGuidanceSource = new ContextGuidanceSource(mockConfig);

		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('analyze', () => {
		it('should return no guidance when context awareness is disabled', async () => {
			const disabledConfig = {
				...mockConfig,
				context: {
					...mockConfig.context!,
					enabled: false,
				},
			};
			contextGuidanceSource = new ContextGuidanceSource(disabledConfig);

			const result = await contextGuidanceSource.analyze(mockContext);

			expect(result.shouldIntervene).toBe(false);
			expect(result.reasoning).toBe('Context awareness disabled');
		});

		it('should build project context when not provided', async () => {
			const contextWithoutProject = {
				...mockContext,
				projectContext: undefined,
			};

			mockContextBuilder.buildProjectContext.mockResolvedValue(
				mockProjectContext,
			);
			mockContextPatterns.testPatterns.mockReturnValue([]);

			await contextGuidanceSource.analyze(contextWithoutProject);

			expect(mockContextBuilder.buildProjectContext).toHaveBeenCalledWith(
				'/test/project',
			);
		});

		it('should return no guidance when no project context available', async () => {
			const contextWithoutProject = {
				...mockContext,
				projectContext: undefined,
				projectPath: undefined,
			};

			const result = await contextGuidanceSource.analyze(contextWithoutProject);

			expect(result.shouldIntervene).toBe(false);
			expect(result.reasoning).toBe('No project context available');
		});

		it('should return no guidance when no patterns match', async () => {
			mockContextPatterns.testPatterns.mockReturnValue([]);

			const result = await contextGuidanceSource.analyze(mockContext);

			expect(result.shouldIntervene).toBe(false);
			expect(result.reasoning).toBe('No context patterns matched');
		});

		it('should provide guidance when patterns match', async () => {
			const mockPattern = {
				id: 'react-hooks-warning',
				name: 'Class Component Lifecycle',
				framework: 'react' as const,
				category: 'hooks' as const,
				pattern: /componentDidMount/gi,
				guidance:
					'Consider using React hooks instead of class lifecycle methods',
				confidence: 0.9,
			};

			const mockMatches = [
				{
					pattern: mockPattern,
					matches: [
						{
							0: 'componentDidMount',
							index: 0,
							input: 'componentDidMount() {}',
							groups: undefined,
						},
						{
							0: 'componentDidMount',
							index: 50,
							input: 'componentDidMount() {}',
							groups: undefined,
						},
					] as RegExpMatchArray[],
				},
			];

			mockContextPatterns.testPatterns.mockReturnValue(mockMatches);

			const result = await contextGuidanceSource.analyze(mockContext);

			expect(result.shouldIntervene).toBe(true);
			expect(result.confidence).toBeGreaterThan(0.9);
			expect(result.guidance).toContain('Consider using React hooks');
			expect(result.guidance).toContain('react/typescript');
			expect(result.guidance).toContain('2 instances');
			expect(result.source).toBe('context-aware');
			expect(result.metadata?.['framework']).toBe('react');
			expect(result.metadata?.['patternId']).toBe('react-hooks-warning');
		});

		it('should enhance guidance with project context', async () => {
			const mockPattern = {
				id: 'test-pattern',
				name: 'Test Pattern',
				framework: 'typescript' as const,
				category: 'testing' as const,
				pattern: /test/gi,
				guidance: 'Improve testing practices',
				confidence: 0.8,
			};

			mockContextPatterns.testPatterns.mockReturnValue([
				{
					pattern: mockPattern,
					matches: [
						{0: 'test', index: 10, input: 'test code', groups: undefined},
					] as RegExpMatchArray[],
				},
			]);

			const result = await contextGuidanceSource.analyze(mockContext);

			expect(result.guidance).toContain('typescript project');
			expect(result.guidance).toContain('vitest for testing');
		});

		it('should calculate context bonus correctly', async () => {
			const mockPattern = {
				id: 'test-pattern',
				name: 'Test Pattern',
				framework: 'react' as const,
				category: 'testing' as const,
				pattern: /test/gi,
				guidance: 'Test guidance',
				confidence: 0.7,
			};

			mockContextPatterns.testPatterns.mockReturnValue([
				{
					pattern: mockPattern,
					matches: [
						{0: 'test', index: 0, input: 'test', groups: undefined},
					] as RegExpMatchArray[],
				},
			]);

			const result = await contextGuidanceSource.analyze(mockContext);

			// Base confidence 0.7 + context bonus should be higher
			expect(result.confidence).toBeGreaterThan(0.7);
			expect(result.confidence).toBeLessThanOrEqual(0.99);
		});

		it('should handle urgency for multiple matches', async () => {
			const mockPattern = {
				id: 'urgent-pattern',
				name: 'Urgent Pattern',
				framework: 'react' as const,
				category: 'testing' as const,
				pattern: /urgent/gi,
				guidance: 'Fix urgent issue',
				confidence: 0.8,
			};

			const manyMatches = Array(5)
				.fill(0)
				.map((_, i) => ({
					0: 'urgent',
					index: i * 10,
					input: 'urgent issue',
					groups: undefined,
				})) as RegExpMatchArray[];

			mockContextPatterns.testPatterns.mockReturnValue([
				{
					pattern: mockPattern,
					matches: manyMatches,
				},
			]);

			const result = await contextGuidanceSource.analyze(mockContext);

			expect(result.guidance).toContain('5 instances');
			expect(result.guidance).toContain('addressing systematically');
		});

		it('should handle analysis errors gracefully', async () => {
			mockContextPatterns.testPatterns.mockImplementation(() => {
				throw new Error('Pattern testing failed');
			});

			const result = await contextGuidanceSource.analyze(mockContext);

			expect(result.shouldIntervene).toBe(false);
			expect(result.confidence).toBe(0);
			expect(result.reasoning).toContain('Context analysis failed');
			expect(result.metadata?.['error']).toBe(true);
		});

		it('should short-circuit with high confidence', async () => {
			const highConfidencePattern = {
				id: 'critical-pattern',
				name: 'Critical Pattern',
				framework: 'react' as const,
				category: 'testing' as const,
				pattern: /critical/gi,
				guidance: 'Critical issue detected',
				confidence: 0.95,
			};

			mockContextPatterns.testPatterns.mockReturnValue([
				{
					pattern: highConfidencePattern,
					matches: [
						{0: 'critical', index: 0, input: 'critical', groups: undefined},
					] as RegExpMatchArray[],
				},
			]);

			const result = await contextGuidanceSource.analyze(mockContext);

			expect(result.confidence).toBeGreaterThan(0.9);
			expect(contextGuidanceSource.canShortCircuit).toBe(true);
		});
	});

	describe('updateConfig', () => {
		it('should update configuration', () => {
			const newConfig = {
				...mockConfig,
				context: {
					...mockConfig.context!,
					enabled: false,
				},
			};

			contextGuidanceSource.updateConfig(newConfig);

			expect(contextGuidanceSource.isAvailable()).toBe(false);
		});
	});

	describe('isAvailable', () => {
		it('should return true when context is enabled', () => {
			expect(contextGuidanceSource.isAvailable()).toBe(true);
		});

		it('should return false when context is disabled', () => {
			const disabledConfig = {
				...mockConfig,
				context: {
					...mockConfig.context!,
					enabled: false,
				},
			};

			contextGuidanceSource.updateConfig(disabledConfig);
			expect(contextGuidanceSource.isAvailable()).toBe(false);
		});

		it('should return false when context config is missing', () => {
			const noContextConfig = {
				...mockConfig,
				context: undefined,
			};

			contextGuidanceSource.updateConfig(noContextConfig);
			expect(contextGuidanceSource.isAvailable()).toBe(false);
		});
	});

	describe('getDebugInfo', () => {
		it('should return comprehensive debug information', () => {
			mockContextPatterns.getStats.mockReturnValue({
				react: 4,
				typescript: 3,
				node: 3,
				express: 2,
				next: 3,
				vue: 2,
				unknown: 0,
			});

			mockContextBuilder.getCacheStats.mockReturnValue({
				size: 2,
				keys: ['/project1', '/project2'],
			});

			const debugInfo = contextGuidanceSource.getDebugInfo();

			expect(debugInfo).toEqual({
				id: 'context-aware',
				priority: 1,
				canShortCircuit: true,
				isAvailable: true,
				config: {
					contextEnabled: true,
					frameworkDetection: true,
					gitIntegration: true,
				},
				patternStats: {
					react: 4,
					typescript: 3,
					node: 3,
					express: 2,
					next: 3,
					vue: 2,
					unknown: 0,
				},
				cacheStats: {
					size: 2,
					keys: ['/project1', '/project2'],
				},
			});
		});
	});

	describe('priority and identification', () => {
		it('should have correct priority and ID', () => {
			expect(contextGuidanceSource.id).toBe('context-aware');
			expect(contextGuidanceSource.priority).toBe(1);
			expect(contextGuidanceSource.canShortCircuit).toBe(true);
		});
	});
});
