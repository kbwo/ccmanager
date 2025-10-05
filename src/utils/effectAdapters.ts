import {Either, Effect} from 'effect';
import type {GitOperationResult} from './gitStatus.js';
import type {AppError} from '../types/errors.js';

/**
 * Convert legacy GitOperationResult to Either
 * Used when new Effect-based code needs to call legacy APIs
 *
 * @deprecated This adapter is temporary and will be removed after migration completion
 * @param result - The GitOperationResult to convert
 * @returns Either representation of the result
 */
export function resultToEither<T>(
	result: GitOperationResult<T>,
): Either.Either<string | undefined, T | undefined> {
	if (result.success) {
		return Either.right(result.data) as Either.Either<
			string | undefined,
			T | undefined
		>;
	} else {
		return Either.left(result.error) as Either.Either<
			string | undefined,
			T | undefined
		>;
	}
}

/**
 * Convert Either to legacy GitOperationResult
 * Used when legacy code needs to call new Effect-based APIs
 *
 * @deprecated This adapter is temporary and will be removed after migration completion
 * @param either - The Either to convert
 * @returns GitOperationResult representation
 */
export function eitherToResult<T>(
	either: Either.Either<string | undefined, T | undefined>,
): GitOperationResult<T> {
	return Either.match(either, {
		onLeft: error =>
			({
				success: false,
				error,
			}) as GitOperationResult<T>,
		onRight: data =>
			({
				success: true,
				data,
			}) as GitOperationResult<T>,
	});
}

/**
 * Convert Effect to Promise for React integration
 * Handles errors by converting to rejected Promise
 *
 * @param effect - The Effect to convert
 * @returns Promise that resolves or rejects based on Effect result
 */
export function effectToPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
	return Effect.runPromise(effect);
}

/**
 * Convert Effect to Promise with error transformation
 * Maps Effect errors to user-friendly messages
 *
 * @param effect - The Effect to convert
 * @param errorMapper - Function to transform errors to strings
 * @returns Promise that resolves or rejects with mapped errors
 */
export function effectToPromiseWithErrorMapping<A, E extends AppError>(
	effect: Effect.Effect<A, E>,
	errorMapper: (error: E) => string,
): Promise<A> {
	return Effect.runPromise(Effect.mapError(effect, errorMapper));
}
