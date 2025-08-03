import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {ContextBuilder} from './contextBuilder.js';
// Types are used in inference and testing but not directly imported

// Mock fs and child_process
vi.mock('fs/promises');
vi.mock('child_process');

const mockFs = vi.mocked(fs);

describe('ContextBuilder', () => {
	let contextBuilder: ContextBuilder;
	const testProjectPath = '/test/project';

	beforeEach(() => {
		contextBuilder = new ContextBuilder();
		vi.clearAllMocks();
	});

	afterEach(() => {
		contextBuilder.clearCache();
	});

	describe('buildProjectContext', () => {
		it('should build basic project context', async () => {
			// Mock package.json - readFile called multiple times for different purposes
			mockFs.readFile.mockImplementation(async filePath => {
				if (filePath.toString().endsWith('package.json')) {
					return JSON.stringify({
						name: 'test-project',
						version: '1.0.0',
						dependencies: {
							react: '^18.0.0',
							typescript: '^5.0.0',
						},
						scripts: {
							start: 'react-scripts start',
							test: 'vitest',
						},
					});
				}
				throw new Error('File not found');
			});

			// Mock file structure
			mockFs.readdir.mockImplementation(async dirPath => {
				if (dirPath === testProjectPath) {
					return ['package.json', 'src', 'tsconfig.json'] as any;
				}
				if (dirPath === path.join(testProjectPath, 'src')) {
					return ['App.tsx', 'index.ts', 'components'] as any;
				}
				return [] as any;
			});

			mockFs.stat.mockResolvedValue({isDirectory: () => true} as any);

			const context = await contextBuilder.buildProjectContext(testProjectPath);

			expect(context).toBeDefined();
			expect(context.projectType.framework).toBe('react');
			expect(context.projectType.language).toBe('typescript');
			expect(context.packageInfo?.name).toBe('test-project');
		});

		it('should cache project context', async () => {
			let readFileCallCount = 0;

			// Mock package.json
			mockFs.readFile.mockImplementation(async filePath => {
				if (filePath.toString().endsWith('package.json')) {
					readFileCallCount++;
					return JSON.stringify({
						name: 'test-project',
						dependencies: {vue: '^3.0.0'},
					});
				}
				throw new Error('File not found');
			});

			mockFs.readdir.mockResolvedValue(['package.json'] as any);

			// First call
			const context1 =
				await contextBuilder.buildProjectContext(testProjectPath);
			const firstCallCount = readFileCallCount;

			// Second call should use cache
			const context2 =
				await contextBuilder.buildProjectContext(testProjectPath);
			expect(readFileCallCount).toBe(firstCallCount); // No additional calls
			expect(context1).toBe(context2);
		});

		it('should handle missing package.json gracefully', async () => {
			mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
			mockFs.readdir.mockResolvedValue(['src'] as any);
			mockFs.stat.mockResolvedValue({isDirectory: () => true} as any);

			const context = await contextBuilder.buildProjectContext(testProjectPath);

			expect(context).toBeDefined();
			expect(context.projectType.framework).toBe('unknown');
			expect(context.packageInfo).toBeUndefined();
		});

		it('should return fallback context on error', async () => {
			mockFs.readFile.mockRejectedValue(new Error('Permission denied'));
			mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

			const context = await contextBuilder.buildProjectContext(testProjectPath);

			expect(context).toBeDefined();
			expect(context.projectType.framework).toBe('unknown');
			expect(context.projectType.language).toBe('unknown');
			expect(context.recentFiles).toEqual([]);
		});
	});

	describe('detectProjectType', () => {
		it('should detect React TypeScript project', async () => {
			mockFs.readFile.mockResolvedValue(
				JSON.stringify({
					dependencies: {
						react: '^18.0.0',
						'@types/react': '^18.0.0',
						typescript: '^5.0.0',
					},
					devDependencies: {
						vitest: '^1.0.0',
					},
				}),
			);

			mockFs.readdir.mockImplementation(async dirPath => {
				if (dirPath === testProjectPath) {
					return ['package.json', 'tsconfig.json', 'src'] as any;
				}
				if (dirPath === path.join(testProjectPath, 'src')) {
					return ['App.tsx', 'components'] as any;
				}
				return [] as any;
			});

			mockFs.stat.mockResolvedValue({isDirectory: () => true} as any);

			const projectType =
				await contextBuilder.detectProjectType(testProjectPath);

			expect(projectType.framework).toBe('react');
			expect(projectType.language).toBe('typescript');
			expect(projectType.testFramework).toBe('vitest');
			expect(projectType.patterns).toBeDefined();
		});

		it('should detect Next.js project', async () => {
			mockFs.readFile.mockResolvedValue(
				JSON.stringify({
					dependencies: {
						next: '^14.0.0',
						react: '^18.0.0',
					},
				}),
			);

			mockFs.readdir.mockResolvedValue(['package.json', 'pages'] as any);
			mockFs.stat.mockResolvedValue({isDirectory: () => true} as any);

			const projectType =
				await contextBuilder.detectProjectType(testProjectPath);

			expect(projectType.framework).toBe('next');
		});

		it('should detect Express Node.js project', async () => {
			mockFs.readFile.mockResolvedValue(
				JSON.stringify({
					dependencies: {
						express: '^4.18.0',
					},
					scripts: {
						start: 'node server.js',
					},
				}),
			);

			mockFs.readdir.mockResolvedValue(['package.json', 'server.js'] as any);
			mockFs.stat.mockResolvedValue({isDirectory: () => false} as any);

			const projectType =
				await contextBuilder.detectProjectType(testProjectPath);

			expect(projectType.framework).toBe('express');
			expect(projectType.language).toBe('javascript');
		});

		it('should detect Python project', async () => {
			mockFs.readFile.mockRejectedValue(new Error('No package.json'));
			mockFs.readdir.mockResolvedValue(['main.py', 'requirements.txt'] as any);
			mockFs.stat.mockResolvedValue({isDirectory: () => false} as any);

			const projectType =
				await contextBuilder.detectProjectType(testProjectPath);

			expect(projectType.language).toBe('python');
			expect(projectType.framework).toBe('unknown');
		});
	});

	describe('detectArchitecturalPatterns', () => {
		it('should detect component-based architecture', async () => {
			const fileStructure = [
				'src/components/Button.tsx',
				'src/components/Header.tsx',
			];

			// Mock workspace check
			mockFs.readFile.mockRejectedValue(new Error('No package.json'));

			const patterns = await (
				contextBuilder as any
			).detectArchitecturalPatterns(testProjectPath, fileStructure);

			const componentPattern = patterns.find(
				(p: any) => p.type === 'component-based',
			);
			expect(componentPattern).toBeDefined();
			expect(componentPattern.confidence).toBe(0.8);
		});

		it('should detect MVC architecture', async () => {
			const fileStructure = [
				'src/models/User.ts',
				'src/views/UserView.tsx',
				'src/controllers/UserController.ts',
			];

			mockFs.readFile.mockRejectedValue(new Error('No package.json'));

			const patterns = await (
				contextBuilder as any
			).detectArchitecturalPatterns(testProjectPath, fileStructure);

			const mvcPattern = patterns.find((p: any) => p.type === 'mvc');
			expect(mvcPattern).toBeDefined();
			expect(mvcPattern.confidence).toBe(0.9);
		});

		it('should detect microservice patterns', async () => {
			const fileStructure = ['Dockerfile', 'docker-compose.yml'];

			mockFs.readFile.mockRejectedValue(new Error('No package.json'));

			const patterns = await (
				contextBuilder as any
			).detectArchitecturalPatterns(testProjectPath, fileStructure);

			const microservicePattern = patterns.find(
				(p: any) => p.type === 'microservice',
			);
			expect(microservicePattern).toBeDefined();
		});

		it('should detect monorepo pattern', async () => {
			const fileStructure = ['packages/app1', 'packages/app2'];

			// Mock workspace detection
			mockFs.readFile.mockResolvedValue(
				JSON.stringify({
					workspaces: ['packages/*'],
				}),
			);

			const patterns = await (
				contextBuilder as any
			).detectArchitecturalPatterns(testProjectPath, fileStructure);

			const monorepoPattern = patterns.find((p: any) => p.type === 'monorepo');
			expect(monorepoPattern).toBeDefined();
			expect(monorepoPattern.confidence).toBe(0.9);
		});
	});

	describe('cache management', () => {
		it('should clear cache for specific project', async () => {
			mockFs.readFile.mockResolvedValue(JSON.stringify({name: 'test'}));
			mockFs.readdir.mockResolvedValue(['package.json'] as any);

			await contextBuilder.buildProjectContext(testProjectPath);
			expect(contextBuilder.getCacheStats().size).toBe(1);

			contextBuilder.clearCache(testProjectPath);
			expect(contextBuilder.getCacheStats().size).toBe(0);
		});

		it('should clear all cache', async () => {
			mockFs.readFile.mockResolvedValue(JSON.stringify({name: 'test'}));
			mockFs.readdir.mockResolvedValue(['package.json'] as any);

			await contextBuilder.buildProjectContext('/project1');
			await contextBuilder.buildProjectContext('/project2');
			expect(contextBuilder.getCacheStats().size).toBe(2);

			contextBuilder.clearCache();
			expect(contextBuilder.getCacheStats().size).toBe(0);
		});

		it('should expire cache after duration', async () => {
			// Create context builder with short cache duration for testing
			const shortCacheBuilder = new ContextBuilder();
			mockFs.readFile.mockResolvedValue(JSON.stringify({name: 'test'}));
			mockFs.readdir.mockResolvedValue(['package.json'] as any);

			const context1 =
				await shortCacheBuilder.buildProjectContext(testProjectPath);

			// Manually expire the cache by modifying timestamp
			const cacheStats = shortCacheBuilder.getCacheStats();
			if (cacheStats.size > 0) {
				const cachedContext = (shortCacheBuilder as any).contextCache.get(
					testProjectPath,
				);
				if (cachedContext) {
					cachedContext.cacheTimestamp = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
				}
			}

			// Should rebuild context due to expired cache
			const context2 =
				await shortCacheBuilder.buildProjectContext(testProjectPath);
			expect(context1).not.toBe(context2); // Different instances due to cache miss
		});
	});

	describe('error handling', () => {
		it('should handle permission errors gracefully', async () => {
			mockFs.readFile.mockRejectedValue(new Error('EACCES: permission denied'));
			mockFs.readdir.mockRejectedValue(new Error('EACCES: permission denied'));

			const context = await contextBuilder.buildProjectContext(testProjectPath);

			expect(context.projectType.framework).toBe('unknown');
			expect(context.projectType.language).toBe('unknown');
		});

		it('should handle malformed package.json', async () => {
			mockFs.readFile.mockResolvedValue('invalid json {');
			mockFs.readdir.mockResolvedValue(['package.json'] as any);

			const context = await contextBuilder.buildProjectContext(testProjectPath);

			expect(context.packageInfo).toBeUndefined();
		});
	});
});
