/**
 * A simple mutex implementation for protecting shared state.
 * Provides exclusive access to wrapped data through async locking.
 */
export class Mutex<T> {
	private data: T;
	private locked = false;
	private waitQueue: Array<() => void> = [];

	constructor(initialData: T) {
		this.data = initialData;
	}

	/**
	 * Acquire the lock. Returns a promise that resolves when the lock is acquired.
	 */
	private async acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true;
			return;
		}

		return new Promise<void>(resolve => {
			this.waitQueue.push(resolve);
		});
	}

	/**
	 * Release the lock, allowing the next waiter to proceed.
	 */
	private release(): void {
		const next = this.waitQueue.shift();
		if (next) {
			next();
		} else {
			this.locked = false;
		}
	}

	/**
	 * Run a function with exclusive access to the protected data.
	 * The lock is acquired before the function runs and released after it completes.
	 *
	 * @param fn - Function that receives the current data and returns updated data or a promise of updated data
	 * @returns Promise that resolves with the function's return value
	 */
	async runExclusive<R>(fn: (data: T) => R | Promise<R>): Promise<R> {
		await this.acquire();
		try {
			const result = await fn(this.data);
			return result;
		} finally {
			this.release();
		}
	}

	/**
	 * Run a function with exclusive access and update the protected data.
	 * The lock is acquired before the function runs and released after it completes.
	 *
	 * @param fn - Function that receives the current data and returns the updated data
	 */
	async update(fn: (data: T) => T | Promise<T>): Promise<void> {
		await this.acquire();
		try {
			this.data = await fn(this.data);
		} finally {
			this.release();
		}
	}

	/**
	 * Get a snapshot of the current data without acquiring the lock.
	 * Use with caution - this does not guarantee consistency.
	 * Prefer runExclusive for reads that need to be consistent with writes.
	 */
	getSnapshot(): T {
		return this.data;
	}
}

/**
 * Interface for the session state data protected by mutex.
 */
export interface SessionStateData {
	state: import('../types/index.js').SessionState;
	pendingState: import('../types/index.js').SessionState | undefined;
	pendingStateStart: number | undefined;
	autoApprovalFailed: boolean;
	autoApprovalReason: string | undefined;
	autoApprovalAbortController: AbortController | undefined;
}

/**
 * Create initial session state data with default values.
 */
export function createInitialSessionStateData(): SessionStateData {
	return {
		state: 'busy',
		pendingState: undefined,
		pendingStateStart: undefined,
		autoApprovalFailed: false,
		autoApprovalReason: undefined,
		autoApprovalAbortController: undefined,
	};
}
