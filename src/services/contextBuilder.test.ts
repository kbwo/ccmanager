import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {ContextBuilder} from './contextBuilder.js';
import {ProjectTypeDetector} from './projectTypeDetector.js';
import type {ContextAwareConfig} from '../types/index.js';

// Mock dependencies
vi.mock('./projectTypeDetector.js');
vi.mock('../utils/gitStatus.js', () => ({
	getGitStatus: vi.fn(),
}));
vi.mock('fs/promises', () => ({
	readdir: vi.fn(),
	stat: vi.fn(),
	readFile: vi.fn(),
}));

const mockProjectTypeDetector = vi.mocked(ProjectTypeDetector);
const {getGitStatus} = await import('../utils/gitStatus.js');
const mockGetGitStatus = vi.mocked(getGitStatus);

const {readdir, stat, readFile} = await import('fs/promises');
const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockReadFile = vi.mocked(readFile);

describe('ContextBuilder', () => {
	let contextBuilder: ContextBuilder;
	let mockDetector: any;
	const defaultConfig: ContextAwareConfig = {
		enabled: true,
		enableFrameworkDetection: true,
		enableGitIntegration: true,
		cacheIntervalMinutes: 5,
		frameworkPatterns: {},
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock ProjectTypeDetector instance
		mockDetector = {
			detectProjectType: vi.fn(),
			getCompliancePatterns: vi.fn(),
			clearCache: vi.fn(),
		};
		mockProjectTypeDetector.mockImplementation(() => mockDetector);

		contextBuilder = new ContextBuilder(defaultConfig);
	});

	afterEach(() => {
		contextBuilder.clearCache();
	});

	describe('buildProjectContext', () => {
		it('should build comprehensive project context', async () => {
			// Mock project type detection
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'react',
				language: 'typescript',
				buildSystem: 'npm',
				patterns: [
					{
						type: 'component-based',
						confidence: 0.8,
						indicators: ['components/', 'src/'],
					},
				],
			});

			// Mock git status
			mockGetGitStatus.mockResolvedValue({
				success: true,
				data: {
					filesAdded: 2,
					filesDeleted: 0,
					aheadCount: 2,
					behindCount: 0,
					parentBranch: 'main',
				},
			});

			// Mock file operations
			mockReaddir
				.mockResolvedValueOnce([
					{name: 'src', isDirectory: () => true},
					{name: 'components', isDirectory: () => true},
					{name: '__tests__', isDirectory: () => true},
					{name: 'README.md', isFile: () => true},
				] as any)
				.mockResolvedValueOnce([
					{name: 'App.tsx', isFile: () => true},
					{name: 'utils.ts', isFile: () => true},
				] as any);

			mockStat
				.mockResolvedValueOnce({mtime: new Date('2024-01-01')} as any)
				.mockResolvedValueOnce({mtime: new Date('2024-01-02')} as any);

			mockReadFile.mockResolvedValue(
				JSON.stringify({
					dependencies: {react: '^18.0.0'},
					devDependencies: {typescript: '^5.0.0'},
				}),
			);

			const result = await contextBuilder.buildProjectContext('/test/project');

			expect(result).toEqual({
				projectType: {
					framework: 'react',
					language: 'typescript',
					buildSystem: 'npm',
					patterns: [
						{
							type: 'component-based',
							confidence: 0.8,
							indicators: ['components/', 'src/'],
						},
					],
				},
				gitStatus: {
					filesAdded: 2,
					filesDeleted: 0,
					aheadCount: 2,
					behindCount: 0,
					parentBranch: 'main',
				},
				recentFiles: ['utils.ts', 'App.tsx'],
				hasTests: true,
				hasDocumentation: true,
				dependencies: ['react'],
				devDependencies: ['typescript'],
				cacheTimestamp: expect.any(Date),
			});
		});

		it('should handle disabled framework detection', async () => {
			const disabledConfig = {
				...defaultConfig,
				enableFrameworkDetection: false,
			};
			const builderWithDisabled = new ContextBuilder(disabledConfig);

			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const result = await builderWithDisabled.buildProjectContext('/test/project');

			expect(result.projectType.framework).toBe('unknown');
			expect(result.projectType.language).toBe('unknown');
			expect(mockDetector.detectProjectType).not.toHaveBeenCalled();
		});

		it('should handle disabled git integration', async () => {
			const disabledConfig = {
				...defaultConfig,
				enableGitIntegration: false,
			};
			const builderWithDisabled = new ContextBuilder(disabledConfig);

			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'node',
				language: 'javascript',
				buildSystem: 'npm',
				patterns: [],
			});

			mockReaddir.mockResolvedValue([] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const result = await builderWithDisabled.buildProjectContext('/test/project');

			expect(result.gitStatus).toBeUndefined();
			expect(mockGetGitStatus).not.toHaveBeenCalled();
		});
	});

	describe('caching', () => {
		it('should cache context results', async () => {
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'react',
				language: 'typescript',
				buildSystem: 'npm',
				patterns: [],
			});

			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			// First call
			await contextBuilder.buildProjectContext('/test/project');

			// Second call should use cache
			await contextBuilder.buildProjectContext('/test/project');

			expect(mockDetector.detectProjectType).toHaveBeenCalledTimes(1);
		});

		it('should respect cache invalidation', async () => {
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'react',
				language: 'typescript',
				buildSystem: 'npm',
				patterns: [],
			});

			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			// First call
			await contextBuilder.buildProjectContext('/test/project');

			// Manually expire cache by setting old timestamp
			const cache = (contextBuilder as any).cache;
			const cachedItem = cache.get('/test/project');
			cachedItem.cacheTimestamp = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

			// Second call should rebuild context
			await contextBuilder.buildProjectContext('/test/project');

			expect(mockDetector.detectProjectType).toHaveBeenCalledTimes(2);
		});
	});

	describe('error handling', () => {
		it('should return minimal context on error', async () => {
			mockDetector.detectProjectType.mockRejectedValue(new Error('Detection failed'));

			const result = await contextBuilder.buildProjectContext('/test/project');

			expect(result.projectType.framework).toBe('unknown');
			expect(result.projectType.language).toBe('unknown');
			expect(result.recentFiles).toEqual([]);
			expect(result.hasTests).toBe(false);
			expect(result.hasDocumentation).toBe(false);
		});

		it('should handle git status errors gracefully', async () => {
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'node',
				language: 'javascript',
				buildSystem: 'npm',
				patterns: [],
			});

			mockGetGitStatus.mockRejectedValue(new Error('Git error'));
			mockReaddir.mockResolvedValue([] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const result = await contextBuilder.buildProjectContext('/test/project');

			expect(result.gitStatus).toBeUndefined();
			expect(result.projectType.framework).toBe('node');
		});
	});

	describe('file analysis', () => {
		it('should detect test directories', async () => {
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'unknown',
				language: 'unknown',
				buildSystem: 'unknown',
				patterns: [],
			});

			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([
				{name: '__tests__', isDirectory: () => true},
			] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const result = await contextBuilder.buildProjectContext('/test/project');

			expect(result.hasTests).toBe(true);
		});

		it('should detect test files', async () => {
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'unknown',
				language: 'unknown',
				buildSystem: 'unknown',
				patterns: [],
			});

			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([
				{name: 'utils.test.ts', isFile: () => true},
			] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const result = await contextBuilder.buildProjectContext('/test/project');

			expect(result.hasTests).toBe(true);
		});

		it('should detect documentation', async () => {
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'unknown',
				language: 'unknown',
				buildSystem: 'unknown',
				patterns: [],
			});

			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([
				{name: 'README.md', isFile: () => true},
			] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const result = await contextBuilder.buildProjectContext('/test/project');

			expect(result.hasDocumentation).toBe(true);
		});
	});

	describe('compliance patterns', () => {
		it('should get compliance patterns for project', async () => {
			const mockPatterns = [
				{
					id: 'react-hooks',
					pattern: /useEffect/,
					severity: 'warning' as const,
					message: 'Use hooks correctly',
					category: 'maintainability' as const,
				},
			];

			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'react',
				language: 'typescript',
				buildSystem: 'npm',
				patterns: [],
			});

			mockDetector.getCompliancePatterns.mockResolvedValue(mockPatterns);
			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const patterns = await contextBuilder.getCompliancePatterns('/test/project');

			expect(patterns).toEqual(mockPatterns);
			expect(mockDetector.getCompliancePatterns).toHaveBeenCalledWith({
				framework: 'react',
				language: 'typescript',
				buildSystem: 'npm',
				patterns: [],
			});
		});
	});

	describe('configuration updates', () => {
		it('should update configuration', () => {
			const newConfig = {
				...defaultConfig,
				cacheIntervalMinutes: 10,
			};

			contextBuilder.updateConfig(newConfig);

			const debugInfo = contextBuilder.getDebugInfo() as any;
			expect(debugInfo.config.cacheIntervalMinutes).toBe(10);
		});
	});

	describe('debug information', () => {
		it('should provide debug information', async () => {
			mockDetector.detectProjectType.mockResolvedValue({
				framework: 'react',
				language: 'typescript',
				buildSystem: 'npm',
				patterns: [],
			});

			mockGetGitStatus.mockResolvedValue({
				success: false,
				error: 'Not a git repository',
			});
			mockReaddir.mockResolvedValue([] as any);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			await contextBuilder.buildProjectContext('/test/project1');
			await contextBuilder.buildProjectContext('/test/project2');

			const debug = contextBuilder.getDebugInfo();

			expect(debug).toEqual({
				cacheSize: 2,
				config: defaultConfig,
				cacheKeys: ['project1', 'project2'],
			});
		});
	});
});