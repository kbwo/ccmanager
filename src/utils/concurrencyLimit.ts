import {Effect} from 'effect';

/**
 * Create a function that limits concurrent executions
 */
export function createConcurrencyLimited<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
	maxConcurrent: number,
): (...args: TArgs) => Promise<TResult> {
	if (maxConcurrent < 1) {
		throw new RangeError('maxConcurrent must be at least 1');
	}

	let activeCount = 0;
	const queue: Array<() => void> = [];

	return async (...args: TArgs): Promise<TResult> => {
		// Wait for a slot if at capacity
		if (activeCount >= maxConcurrent) {
			await new Promise<void>(resolve => {
				queue.push(resolve);
			});
		}

		activeCount++;

		try {
			return await fn(...args);
		} finally {
			activeCount--;
			// Release the next waiter in queue
			const next = queue.shift();
			if (next) {
				next();
			}
		}
	};
}

/**
 * Create a function that limits concurrent Effect executions
 */
export function createEffectConcurrencyLimited<TArgs extends unknown[], A, E>(
	fn: (...args: TArgs) => Effect.Effect<A, E>,
	maxConcurrent: number,
): (...args: TArgs) => Effect.Effect<A, E> {
	if (maxConcurrent < 1) {
		throw new RangeError('maxConcurrent must be at least 1');
	}

	const semaphore = Effect.unsafeMakeSemaphore(maxConcurrent);

	return (...args: TArgs): Effect.Effect<A, E> =>
		semaphore.withPermits(1)(fn(...args));
}
