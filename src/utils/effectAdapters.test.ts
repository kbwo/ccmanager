import {describe, it, expect} from 'vitest';
import type {GitOperationResult} from './gitStatus.js';
import type {AppError} from '../types/errors.js';

/**
 * Tests for Effect adapter utilities
 * These utilities provide backward compatibility during the migration from
 * GitOperationResult to Effect types
 */
describe('Effect Adapters', () => {
	describe('resultToEither', () => {
		it('should convert successful GitOperationResult to Either.right', async () => {
			const {resultToEither} = await import('./effectAdapters.js');
			const {Either} = await import('effect');

			const result: GitOperationResult<string> = {
				success: true,
				data: 'test data',
			};

			const either = resultToEither(result);

			expect(Either.isRight(either)).toBe(true);
			if (Either.isRight(either)) {
				expect(either.right).toBe('test data');
			}
		});

		it('should convert failed GitOperationResult to Either.left', async () => {
			const {resultToEither} = await import('./effectAdapters.js');
			const {Either} = await import('effect');

			const result: GitOperationResult<string> = {
				success: false,
				error: 'test error',
			};

			const either = resultToEither(result);

			expect(Either.isLeft(either)).toBe(true);
			if (Either.isLeft(either)) {
				expect(either.left).toBe('test error');
			}
		});

		it('should handle missing data in successful result', async () => {
			const {resultToEither} = await import('./effectAdapters.js');
			const {Either} = await import('effect');

			const result: GitOperationResult<string> = {
				success: true,
			};

			const either = resultToEither(result);

			expect(Either.isRight(either)).toBe(true);
			if (Either.isRight(either)) {
				expect(either.right).toBeUndefined();
			}
		});

		it('should handle missing error in failed result', async () => {
			const {resultToEither} = await import('./effectAdapters.js');
			const {Either} = await import('effect');

			const result: GitOperationResult<string> = {
				success: false,
			};

			const either = resultToEither(result);

			expect(Either.isLeft(either)).toBe(true);
			if (Either.isLeft(either)) {
				expect(either.left).toBeUndefined();
			}
		});
	});

	describe('eitherToResult', () => {
		it('should convert Either.right to successful GitOperationResult', async () => {
			const {eitherToResult} = await import('./effectAdapters.js');
			const {Either} = await import('effect');

			const either = Either.right('test data');
			const result = eitherToResult(either);

			expect(result.success).toBe(true);
			expect(result.data).toBe('test data');
			expect(result.error).toBeUndefined();
		});

		it('should convert Either.left to failed GitOperationResult', async () => {
			const {eitherToResult} = await import('./effectAdapters.js');
			const {Either} = await import('effect');

			const either = Either.left('test error');
			const result = eitherToResult(either);

			expect(result.success).toBe(false);
			expect(result.error).toBe('test error');
			expect(result.data).toBeUndefined();
		});
	});

	describe('effectToPromise', () => {
		it('should convert successful Effect to resolved Promise', async () => {
			const {effectToPromise} = await import('./effectAdapters.js');
			const {Effect} = await import('effect');

			const effect = Effect.succeed(42);
			const promise = effectToPromise(effect);

			await expect(promise).resolves.toBe(42);
		});

		it('should convert failed Effect to rejected Promise', async () => {
			const {effectToPromise} = await import('./effectAdapters.js');
			const {Effect} = await import('effect');

			const effect = Effect.fail('test error');
			const promise = effectToPromise(effect);

			await expect(promise).rejects.toThrow();
		});
	});

	describe('effectToPromiseWithErrorMapping', () => {
		it('should map errors using provided mapper function', async () => {
			const {effectToPromiseWithErrorMapping} = await import(
				'./effectAdapters.js'
			);
			const {Effect} = await import('effect');
			const {GitError} = await import('../types/errors.js');

			const error = new GitError({
				command: 'git status',
				exitCode: 128,
				stderr: 'not a git repository',
			});

			const effect = Effect.fail(error);
			const errorMapper = (e: AppError) => {
				if (e._tag === 'GitError') {
					return `Git command failed: ${e.command} (exit ${e.exitCode})`;
				}
				return 'Unknown error';
			};

			const promise = effectToPromiseWithErrorMapping(effect, errorMapper);

			await expect(promise).rejects.toThrow(
				'Git command failed: git status (exit 128)',
			);
		});

		it('should preserve success values', async () => {
			const {effectToPromiseWithErrorMapping} = await import(
				'./effectAdapters.js'
			);
			const {Effect} = await import('effect');

			const effect = Effect.succeed('success data');
			const errorMapper = (e: AppError) => {
				if (e._tag === 'GitError') {
					return `Error: ${e.command}`;
				}
				return 'Unknown error';
			};

			const promise = effectToPromiseWithErrorMapping(effect, errorMapper);

			await expect(promise).resolves.toBe('success data');
		});
	});

	describe('Round-trip conversions', () => {
		it('should preserve data through resultToEither -> eitherToResult', async () => {
			const {resultToEither, eitherToResult} = await import(
				'./effectAdapters.js'
			);

			const original: GitOperationResult<number> = {
				success: true,
				data: 42,
			};

			const roundTrip = eitherToResult(resultToEither(original));

			expect(roundTrip).toEqual(original);
		});

		it('should preserve error through resultToEither -> eitherToResult', async () => {
			const {resultToEither, eitherToResult} = await import(
				'./effectAdapters.js'
			);

			const original: GitOperationResult<number> = {
				success: false,
				error: 'test error',
			};

			const roundTrip = eitherToResult(resultToEither(original));

			expect(roundTrip).toEqual(original);
		});
	});
});
