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
