import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Effect} from 'effect';
import type {ChildProcess} from 'child_process';

const execFileMock = vi.fn();

vi.mock('child_process', () => ({
	execFile: (...args: unknown[]) => execFileMock(...args),
}));

describe('AutoApprovalVerifier', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		execFileMock.mockImplementation(
			(
				_cmd: string,
				_args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				setTimeout(() => callback(null, '{"needsPermission":false}', ''), 5);
				return {} as ChildProcess;
			},
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('executes claude check asynchronously without blocking input', async () => {
		const {autoApprovalVerifier} = await import('./autoApprovalVerifier.js');

		let ticked = false;
		setTimeout(() => {
			ticked = true;
		}, 1);

		const needsPermissionPromise = Effect.runPromise(
			autoApprovalVerifier.verifyNeedsPermission('output'),
		);

		await vi.runAllTimersAsync();
		const needsPermission = await needsPermissionPromise;

		expect(needsPermission).toBe(false);
		expect(ticked).toBe(true);
		expect(execFileMock).toHaveBeenCalledWith(
			'claude',
			expect.arrayContaining(['--model', 'haiku']),
			expect.objectContaining({encoding: 'utf8'}),
			expect.any(Function),
		);
	});
});
