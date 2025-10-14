import {describe, it, expect} from 'vitest';
import {Effect, Either} from 'effect';
import {
	runEffectSync,
	runEffectPromise,
	expectEffectSuccess,
	expectEffectFailure,
	expectEitherRight,
	expectEitherLeft,
	matchEffectError,
} from './testHelpers.js';
import {GitError, ValidationError} from '../types/errors.js';

describe('testHelpers', () => {
	describe('runEffectSync', () => {
		it('should run Effect synchronously and return success value', () => {
			const effect = Effect.succeed(42);
			const result = runEffectSync(effect);
			expect(result).toBe(42);
		});

		it('should throw error when Effect fails', () => {
			const effect = Effect.fail(new Error('test error'));
			expect(() => runEffectSync(effect)).toThrow('test error');
		});
	});

	describe('runEffectPromise', () => {
		it('should run Effect as Promise and resolve with success value', async () => {
			const effect = Effect.succeed(42);
			const result = await runEffectPromise(effect);
			expect(result).toBe(42);
		});

		it('should reject when Effect fails', async () => {
			const effect = Effect.fail(new Error('async error'));
			await expect(runEffectPromise(effect)).rejects.toThrow('async error');
		});
	});

	describe('expectEffectSuccess', () => {
		it('should return success value when Effect succeeds', () => {
			const effect = Effect.succeed('success');
			const result = expectEffectSuccess(effect);
			expect(result).toBe('success');
		});

		it('should throw when Effect fails', () => {
			const effect = Effect.fail(
				new GitError({command: 'git test', exitCode: 1, stderr: 'error'}),
			);
			expect(() => expectEffectSuccess(effect)).toThrow();
		});
	});

	describe('expectEffectFailure', () => {
		it('should return error when Effect fails', () => {
			const gitError = new GitError({
				command: 'git test',
				exitCode: 1,
				stderr: 'error',
			});
			const effect = Effect.fail(gitError);
			const error = expectEffectFailure(effect);
			expect(error).toBe(gitError);
		});

		it('should throw when Effect succeeds', () => {
			const effect = Effect.succeed(42);
			expect(() => expectEffectFailure(effect)).toThrow();
		});
	});

	describe('expectEitherRight', () => {
		it('should return right value when Either is Right', () => {
			const either = Either.right('success');
			const result = expectEitherRight(either);
			expect(result).toBe('success');
		});

		it('should throw when Either is Left', () => {
			const either = Either.left('error');
			expect(() => expectEitherRight(either)).toThrow();
		});
	});

	describe('expectEitherLeft', () => {
		it('should return left value when Either is Left', () => {
			const either = Either.left('error');
			const result = expectEitherLeft(either);
			expect(result).toBe('error');
		});

		it('should throw when Either is Right', () => {
			const either = Either.right('success');
			expect(() => expectEitherLeft(either)).toThrow();
		});
	});

	describe('matchEffectError', () => {
		it('should match GitError and return extracted value', () => {
			const gitError = new GitError({
				command: 'git test',
				exitCode: 1,
				stderr: 'error',
			});
			const effect = Effect.fail(gitError);
			const result = matchEffectError(effect, {
				GitError: err => err.command,
			});
			expect(result).toBe('git test');
		});

		it('should match ValidationError and return extracted value', () => {
			const validationError = new ValidationError({
				field: 'test',
				constraint: 'required',
				receivedValue: null,
			});
			const effect = Effect.fail(validationError);
			const result = matchEffectError(effect, {
				ValidationError: err => err.field,
			});
			expect(result).toBe('test');
		});

		it('should throw when error type does not match', () => {
			const gitError = new GitError({
				command: 'git test',
				exitCode: 1,
				stderr: 'error',
			});
			const effect = Effect.fail(gitError);
			expect(() =>
				matchEffectError(effect, {
					ValidationError: err => err.field,
				}),
			).toThrow();
		});
	});
});
