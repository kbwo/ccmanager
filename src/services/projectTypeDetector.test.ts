import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {ProjectTypeDetector} from './projectTypeDetector.js';
import {readFile, access, readdir} from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
	readFile: vi.fn(),
	access: vi.fn(),
	readdir: vi.fn(),
}));

const mockReadFile = vi.mocked(readFile);
const mockAccess = vi.mocked(access);
const mockReaddir = vi.mocked(readdir);

describe('ProjectTypeDetector', () => {
	let detector: ProjectTypeDetector;

	beforeEach(() => {
		detector = new ProjectTypeDetector();
		vi.clearAllMocks();
	});

	afterEach(() => {
		detector.clearCache();
	});

	describe('React project detection', () => {
		it('should detect React TypeScript project', async () => {
			// Mock package.json
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					dependencies: {
						react: '^18.0.0',
						'@types/react': '^18.0.0',
					},
					devDependencies: {
						typescript: '^5.0.0',
						'@types/node': '^18.0.0',
					},
				}),
			);

			// Mock directories and files
			mockReaddir
				.mockResolvedValueOnce([
					{name: 'src', isDirectory: () => true},
					{name: 'components', isDirectory: () => true},
					{name: 'node_modules', isDirectory: () => true},
				] as any)
				.mockResolvedValueOnce([
					{name: 'tsconfig.json', isFile: () => true},
					{name: 'package.json', isFile: () => true},
					{name: 'package-lock.json', isFile: () => true},
				] as any);

			const result = await detector.detectProjectType('/test/project');

			expect(result.framework).toBe('react');
			expect(result.language).toBe('typescript');
			expect(result.buildSystem).toBe('npm');
			expect(result.patterns).toContainEqual(
				expect.objectContaining({
					type: 'component-based',
					confidence: 0.8,
				}),
			);
		});

		it('should detect Next.js project', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					dependencies: {
						react: '^18.0.0',
						next: '^13.0.0',
					},
				}),
			);

			mockReaddir
				.mockResolvedValueOnce([
					{name: 'pages', isDirectory: () => true},
					{name: 'src', isDirectory: () => true},
				] as any)
				.mockResolvedValueOnce([
					{name: 'next.config.js', isFile: () => true},
					{name: 'package.json', isFile: () => true},
				] as any);

			const result = await detector.detectProjectType('/test/nextjs');

			expect(result.framework).toBe('next');
			expect(result.language).toBe('javascript');
		});
	});

	describe('Node.js project detection', () => {
		it('should detect Express TypeScript project', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					dependencies: {
						express: '^4.18.0',
					},
					devDependencies: {
						typescript: '^5.0.0',
						'@types/express': '^4.17.0',
					},
				}),
			);

			mockReaddir
				.mockResolvedValueOnce([
					{name: 'routes', isDirectory: () => true},
					{name: 'controllers', isDirectory: () => true},
				] as any)
				.mockResolvedValueOnce([
					{name: 'tsconfig.json', isFile: () => true},
					{name: 'package.json', isFile: () => true},
				] as any);

			const result = await detector.detectProjectType('/test/express');

			expect(result.framework).toBe('express');
			expect(result.language).toBe('typescript');
			expect(result.patterns).toContainEqual(
				expect.objectContaining({
					type: 'mvc',
					confidence: 0.7,
				}),
			);
		});
	});

	describe('Build system detection', () => {
		it('should detect Yarn workspace', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			mockReaddir
				.mockResolvedValueOnce([{name: 'packages', isDirectory: () => true}] as any)
				.mockResolvedValueOnce([
					{name: 'yarn.lock', isFile: () => true},
					{name: 'package.json', isFile: () => true},
				] as any);

			const result = await detector.detectProjectType('/test/monorepo');

			expect(result.buildSystem).toBe('yarn');
			expect(result.patterns).toContainEqual(
				expect.objectContaining({
					type: 'monorepo',
					confidence: 0.9,
				}),
			);
		});

		it('should detect Vite project', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			mockReaddir
				.mockResolvedValueOnce([] as any)
				.mockResolvedValueOnce([
					{name: 'vite.config.ts', isFile: () => true},
					{name: 'package.json', isFile: () => true},
				] as any);

			const result = await detector.detectProjectType('/test/vite');

			expect(result.buildSystem).toBe('vite');
		});
	});

	describe('Test framework detection', () => {
		it('should detect Vitest', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					devDependencies: {
						vitest: '^1.0.0',
					},
				}),
			);

			mockReaddir.mockResolvedValue([] as any);

			const result = await detector.detectProjectType('/test/vitest');

			expect(result.testFramework).toBe('vitest');
		});

		it('should detect Jest', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					devDependencies: {
						jest: '^29.0.0',
						'@types/jest': '^29.0.0',
					},
				}),
			);

			mockReaddir.mockResolvedValue([] as any);

			const result = await detector.detectProjectType('/test/jest');

			expect(result.testFramework).toBe('jest');
		});
	});

	describe('Compliance patterns', () => {
		it('should return React-specific patterns', async () => {
			const projectType = {
				framework: 'react' as const,
				language: 'typescript' as const,
				buildSystem: 'npm' as const,
				patterns: [],
			};

			const patterns = await detector.getCompliancePatterns(projectType);

			expect(patterns).toContainEqual(
				expect.objectContaining({
					id: 'react-hooks-pattern',
					framework: 'react',
					severity: 'warning',
				}),
			);

			expect(patterns).toContainEqual(
				expect.objectContaining({
					id: 'typescript-any-usage',
					severity: 'error',
				}),
			);
		});
	});

	describe('Error handling', () => {
		it('should handle missing package.json', async () => {
			mockAccess.mockRejectedValue(new Error('File not found'));
			mockReaddir.mockResolvedValue([] as any);

			const result = await detector.detectProjectType('/test/empty');

			expect(result.framework).toBe('unknown');
			expect(result.language).toBe('unknown');
		});

		it('should handle malformed package.json', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue('invalid json');
			mockReaddir.mockResolvedValue([] as any);

			const result = await detector.detectProjectType('/test/malformed');

			expect(result.framework).toBe('unknown');
			expect(result.language).toBe('unknown');
		});
	});

	describe('Caching', () => {
		it('should cache package.json results', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify({}));
			mockReaddir.mockResolvedValue([] as any);

			// First call
			await detector.detectProjectType('/test/cached');
			
			// Second call should use cache
			await detector.detectProjectType('/test/cached');

			expect(mockReadFile).toHaveBeenCalledTimes(1);
		});

		it('should clear cache', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify({}));
			mockReaddir.mockResolvedValue([] as any);

			await detector.detectProjectType('/test/cached');
			detector.clearCache();
			await detector.detectProjectType('/test/cached');

			expect(mockReadFile).toHaveBeenCalledTimes(2);
		});
	});
});