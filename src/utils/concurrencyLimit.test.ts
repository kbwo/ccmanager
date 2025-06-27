import {describe, it, expect} from 'vitest';
import {createConcurrencyLimited} from './concurrencyLimit.js';

describe('createConcurrencyLimited', () => {
	it('should limit concurrent executions', async () => {
		let running = 0;
		let maxRunning = 0;

		const task = async (id: number) => {
			running++;
			maxRunning = Math.max(maxRunning, running);
			// Simulate work
			await new Promise(resolve => setTimeout(resolve, 10));
			running--;
			return id;
		};

		const limitedTask = createConcurrencyLimited(task, 2);

		// Start 5 tasks
		const promises = [
			limitedTask(1),
			limitedTask(2),
			limitedTask(3),
			limitedTask(4),
			limitedTask(5),
		];

		const results = await Promise.all(promises);

		// All tasks should complete
		expect(results).toEqual([1, 2, 3, 4, 5]);
		// Max concurrent should not exceed limit
		expect(maxRunning).toBeLessThanOrEqual(2);
		// All tasks should have finished
		expect(running).toBe(0);
	});

	it('should handle errors without blocking queue', async () => {
		let callCount = 0;
		const original = async () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('Task failed');
			}
			return 'success';
		};

		const limited = createConcurrencyLimited(original, 1);

		// Start failing task first
		const promise1 = limited().catch(e => e.message);
		// Queue successful task
		const promise2 = limited();

		const results = await Promise.all([promise1, promise2]);

		expect(results[0]).toBe('Task failed');
		expect(results[1]).toBe('success');
	});

	it('should preserve function arguments', async () => {
		const original = async (
			a: number,
			b: string,
			c: boolean,
		): Promise<string> => {
			return `${a}-${b}-${c}`;
		};

		const limited = createConcurrencyLimited(original, 1);

		const result = await limited(42, 'test', true);
		expect(result).toBe('42-test-true');
	});

	it('should throw for invalid maxConcurrent', () => {
		const fn = async () => 'test';

		expect(() => createConcurrencyLimited(fn, 0)).toThrow(
			'maxConcurrent must be at least 1',
		);
		expect(() => createConcurrencyLimited(fn, -1)).toThrow(
			'maxConcurrent must be at least 1',
		);
	});
});
