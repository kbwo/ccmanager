import {describe, it, expect} from 'vitest';
import type {AppError} from './errors.js';

/**
 * Tests for structured error types using Effect-ts Data.TaggedError
 */
describe('Error Types', () => {
	describe('GitError', () => {
		it('should create GitError with required fields', async () => {
			const {GitError} = await import('./errors.js');

			const error = new GitError({
				command: 'git worktree add',
				exitCode: 1,
				stderr: 'fatal: invalid reference',
			});

			expect(error).toBeInstanceOf(Error);
			expect(error._tag).toBe('GitError');
			expect(error.command).toBe('git worktree add');
			expect(error.exitCode).toBe(1);
			expect(error.stderr).toBe('fatal: invalid reference');
		});

		it('should create GitError with optional stdout', async () => {
			const {GitError} = await import('./errors.js');

			const error = new GitError({
				command: 'git status',
				exitCode: 128,
				stderr: 'not a git repository',
				stdout: 'some output',
			});

			expect(error.stdout).toBe('some output');
		});

		it('should have stack trace', async () => {
			const {GitError} = await import('./errors.js');

			const error = new GitError({
				command: 'git log',
				exitCode: 1,
				stderr: 'error',
			});

			expect(error.stack).toBeDefined();
		});
	});

	describe('FileSystemError', () => {
		it('should create FileSystemError with required fields', async () => {
			const {FileSystemError} = await import('./errors.js');

			const error = new FileSystemError({
				operation: 'read',
				path: '/tmp/config.json',
				cause: 'ENOENT: no such file or directory',
			});

			expect(error).toBeInstanceOf(Error);
			expect(error._tag).toBe('FileSystemError');
			expect(error.operation).toBe('read');
			expect(error.path).toBe('/tmp/config.json');
			expect(error.cause).toBe('ENOENT: no such file or directory');
		});

		it('should support all operation types', async () => {
			const {FileSystemError} = await import('./errors.js');

			const operations: Array<'read' | 'write' | 'delete' | 'mkdir' | 'stat'> =
				['read', 'write', 'delete', 'mkdir', 'stat'];

			for (const operation of operations) {
				const error = new FileSystemError({
					operation,
					path: '/test',
					cause: 'test',
				});
				expect(error.operation).toBe(operation);
			}
		});
	});

	describe('ConfigError', () => {
		it('should create ConfigError with required fields', async () => {
			const {ConfigError} = await import('./errors.js');

			const error = new ConfigError({
				configPath: '~/.config/ccmanager/config.json',
				reason: 'parse',
				details: 'Unexpected token in JSON at position 42',
			});

			expect(error).toBeInstanceOf(Error);
			expect(error._tag).toBe('ConfigError');
			expect(error.configPath).toBe('~/.config/ccmanager/config.json');
			expect(error.reason).toBe('parse');
			expect(error.details).toBe('Unexpected token in JSON at position 42');
		});

		it('should support all reason types', async () => {
			const {ConfigError} = await import('./errors.js');

			const reasons: Array<'parse' | 'validation' | 'missing' | 'migration'> = [
				'parse',
				'validation',
				'missing',
				'migration',
			];

			for (const reason of reasons) {
				const error = new ConfigError({
					configPath: '/test',
					reason,
					details: 'test',
				});
				expect(error.reason).toBe(reason);
			}
		});
	});

	describe('ProcessError', () => {
		it('should create ProcessError with required fields', async () => {
			const {ProcessError} = await import('./errors.js');

			const error = new ProcessError({
				command: 'claude',
				message: 'Failed to spawn process',
			});

			expect(error).toBeInstanceOf(Error);
			expect(error._tag).toBe('ProcessError');
			expect(error.command).toBe('claude');
			expect(error.message).toBe('Failed to spawn process');
		});

		it('should create ProcessError with optional fields', async () => {
			const {ProcessError} = await import('./errors.js');

			const error = new ProcessError({
				processId: 1234,
				command: 'devcontainer exec',
				signal: 'SIGTERM',
				exitCode: 143,
				message: 'Process terminated',
			});

			expect(error.processId).toBe(1234);
			expect(error.signal).toBe('SIGTERM');
			expect(error.exitCode).toBe(143);
		});
	});

	describe('ValidationError', () => {
		it('should create ValidationError with required fields', async () => {
			const {ValidationError} = await import('./errors.js');

			const error = new ValidationError({
				field: 'presetId',
				constraint: 'must be a valid preset ID',
				receivedValue: 'invalid-id',
			});

			expect(error).toBeInstanceOf(Error);
			expect(error._tag).toBe('ValidationError');
			expect(error.field).toBe('presetId');
			expect(error.constraint).toBe('must be a valid preset ID');
			expect(error.receivedValue).toBe('invalid-id');
		});

		it('should handle null and undefined received values', async () => {
			const {ValidationError} = await import('./errors.js');

			const nullError = new ValidationError({
				field: 'name',
				constraint: 'required',
				receivedValue: null,
			});
			expect(nullError.receivedValue).toBeNull();

			const undefinedError = new ValidationError({
				field: 'name',
				constraint: 'required',
				receivedValue: undefined,
			});
			expect(undefinedError.receivedValue).toBeUndefined();
		});
	});

	describe('AppError Union Type', () => {
		it('should support discriminated union via _tag', async () => {
			const {
				GitError,
				FileSystemError,
				ConfigError,
				ProcessError,
				ValidationError,
			} = await import('./errors.js');

			const errors = [
				new GitError({command: 'git', exitCode: 1, stderr: 'error'}),
				new FileSystemError({operation: 'read', path: '/test', cause: 'error'}),
				new ConfigError({
					configPath: '/test',
					reason: 'parse',
					details: 'error',
				}),
				new ProcessError({command: 'cmd', message: 'error'}),
				new ValidationError({
					field: 'test',
					constraint: 'required',
					receivedValue: null,
				}),
			];

			const tags = errors.map(e => e._tag);
			expect(tags).toEqual([
				'GitError',
				'FileSystemError',
				'ConfigError',
				'ProcessError',
				'ValidationError',
			]);
		});

		it('should be able to narrow types using _tag', async () => {
			const {GitError} = await import('./errors.js');

			// Create a GitError which is a valid AppError
			const error: AppError = new GitError({
				command: 'git log',
				exitCode: 1,
				stderr: 'error',
			});

			if (error._tag === 'GitError') {
				// TypeScript should narrow the type here
				expect(error.command).toBe('git log');
				expect(error.exitCode).toBe(1);
				expect(error.stderr).toBe('error');
			} else {
				throw new Error('Should be GitError');
			}
		});
	});
});
