/**
 * Test helper utilities for Effect-ts based testing
 *
 * This module provides utilities to simplify testing Effect and Either types:
 * - Synchronous and asynchronous Effect execution
 * - Assertions for success and failure cases
 * - Pattern matching for specific error types
 *
 * These utilities follow Effect-ts best practices and are designed to work
 * seamlessly with Vitest test framework.
 *
 * @example
 * ```typescript
 * // Test successful Effect
 * const result = expectEffectSuccess(myService.getData());
 * expect(result).toEqual(expectedData);
 *
 * // Test failed Effect
 * const error = expectEffectFailure(myService.failingOp());
 * expect(error._tag).toBe('GitError');
 *
 * // Pattern match on specific error type
 * const command = matchEffectError(effect, {
 *   GitError: (err) => err.command
 * });
 * expect(command).toBe('git status');
 * ```
 *
 * @module testHelpers
 */

import {Effect, Either, Exit} from 'effect';
import type {AppError} from '../types/errors.js';

/**
 * Run an Effect synchronously and return the success value
 * Throws if the Effect fails
 *
 * @param effect - The Effect to run
 * @returns The success value
 * @throws Error if the Effect fails
 */
export function runEffectSync<A, E>(effect: Effect.Effect<A, E, never>): A {
	const exit = Effect.runSync(Effect.exit(effect));
	if (Exit.isFailure(exit)) {
		// Extract the error from the Cause
		const cause = exit.cause;
		if (cause._tag === 'Fail') {
			throw cause.error;
		}
		throw new Error(`Unexpected cause type: ${cause._tag}`);
	}
	return exit.value;
}

/**
 * Run an Effect as a Promise
 *
 * @param effect - The Effect to run
 * @returns Promise that resolves with success value or rejects with error
 */
export function runEffectPromise<A, E>(
	effect: Effect.Effect<A, E, never>,
): Promise<A> {
	return Effect.runPromise(effect);
}

/**
 * Assert that an Effect succeeds and return the success value
 * Throws an error if the Effect fails
 *
 * @param effect - The Effect to test
 * @returns The success value
 * @throws Error if the Effect fails
 */
export function expectEffectSuccess<A, E>(
	effect: Effect.Effect<A, E, never>,
): A {
	const exit = Effect.runSync(Effect.exit(effect));
	if (Exit.isFailure(exit)) {
		throw new Error(
			`Expected Effect to succeed, but it failed with: ${JSON.stringify(exit.cause)}`,
		);
	}
	return exit.value;
}

/**
 * Assert that an Effect fails and return the error
 * Throws an error if the Effect succeeds
 *
 * @param effect - The Effect to test
 * @returns The error value
 * @throws Error if the Effect succeeds
 */
export function expectEffectFailure<A, E>(
	effect: Effect.Effect<A, E, never>,
): E {
	const exit = Effect.runSync(Effect.exit(effect));
	if (Exit.isSuccess(exit)) {
		throw new Error(
			`Expected Effect to fail, but it succeeded with: ${JSON.stringify(exit.value)}`,
		);
	}
	// Extract the error from the Cause
	const failure = exit.cause;
	if (failure._tag === 'Fail') {
		return failure.error;
	}
	throw new Error(`Expected Fail cause, got: ${failure._tag}`);
}

/**
 * Assert that an Either is Right and return the right value
 * Throws an error if the Either is Left
 *
 * @param either - The Either to test
 * @returns The right value
 * @throws Error if the Either is Left
 */
export function expectEitherRight<E, A>(either: Either.Either<E, A>): A {
	if (Either.isLeft(either)) {
		throw new Error(
			`Expected Either to be Right, but it was Left with: ${JSON.stringify(either.left)}`,
		);
	}
	return either.right;
}

/**
 * Assert that an Either is Left and return the left value
 * Throws an error if the Either is Right
 *
 * @param either - The Either to test
 * @returns The left value
 * @throws Error if the Either is Right
 */
export function expectEitherLeft<E, A>(either: Either.Either<E, A>): E {
	if (Either.isRight(either)) {
		throw new Error(
			`Expected Either to be Left, but it was Right with: ${JSON.stringify(either.right)}`,
		);
	}
	return either.left;
}

/**
 * Pattern match on Effect error and extract specific error type
 * Useful for testing specific error scenarios
 *
 * @param effect - The Effect that should fail
 * @param matchers - Object mapping error tags to extraction functions
 * @returns The extracted value from the matched error
 * @throws Error if the Effect succeeds or error doesn't match
 *
 * @example
 * ```typescript
 * const result = matchEffectError(effect, {
 *   GitError: (err) => err.command,
 *   ValidationError: (err) => err.field
 * });
 * ```
 */
export function matchEffectError<R>(
	effect: Effect.Effect<unknown, AppError, never>,
	matchers: {
		[K in AppError['_tag']]?: (
			error: Extract<AppError, {_tag: K}>,
		) => R;
	},
): R {
	const error = expectEffectFailure(effect);
	const matcher = matchers[error._tag as AppError['_tag']];
	if (!matcher) {
		throw new Error(
			`No matcher found for error tag: ${error._tag}. Available matchers: ${Object.keys(matchers).join(', ')}`,
		);
	}
	return matcher(error as any);
}
