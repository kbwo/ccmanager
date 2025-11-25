import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Effect} from 'effect';
import {EventEmitter} from 'events';
import type {ChildProcess} from 'child_process';
import type {Writable} from 'node:stream';

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
				const child = new EventEmitter() as ChildProcess;
				const write = vi.fn();
				const end = vi.fn();
				child.stdin = {write, end} as unknown as Writable;

				setTimeout(() => {
					callback(null, '{"needsPermission":false}', '');
					child.emit('close', 0);
				}, 5);

				return child;
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
		const child = execFileMock.mock.results[0]?.value as ChildProcess & {
			stdin: {write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>};
		};

		expect(execFileMock).toHaveBeenCalledWith(
			'claude',
			expect.arrayContaining(['--model', 'haiku']),
			expect.objectContaining({encoding: 'utf8'}),
			expect.any(Function),
		);
		expect(child.stdin.write).toHaveBeenCalledTimes(1);
		expect(child.stdin.end).toHaveBeenCalledTimes(1);
	});

	it('returns true when Claude response indicates permission is needed', async () => {
		execFileMock.mockImplementationOnce(
			(
				_cmd: string,
				_args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				const child = new EventEmitter() as ChildProcess;
				child.stdin = {write: vi.fn(), end: vi.fn()} as unknown as Writable;
				setTimeout(() => {
					callback(null, '{"needsPermission":true}', '');
					child.emit('close', 0);
				}, 0);
				return child;
			},
		);

		const {autoApprovalVerifier} = await import('./autoApprovalVerifier.js');
		const resultPromise = Effect.runPromise(
			autoApprovalVerifier.verifyNeedsPermission('Error: critical'),
		);

		await vi.runAllTimersAsync();
		expect(await resultPromise).toBe(true);
	});

	it('defaults to requiring permission on malformed JSON', async () => {
		execFileMock.mockImplementationOnce(
			(
				_cmd: string,
				_args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				const child = new EventEmitter() as ChildProcess;
				child.stdin = {write: vi.fn(), end: vi.fn()} as unknown as Writable;
				setTimeout(() => {
					callback(null, 'not-json', '');
					child.emit('close', 0);
				}, 0);
				return child;
			},
		);

		const {autoApprovalVerifier} = await import('./autoApprovalVerifier.js');
		const resultPromise = Effect.runPromise(
			autoApprovalVerifier.verifyNeedsPermission('logs'),
		);

		await vi.runAllTimersAsync();
		expect(await resultPromise).toBe(true);
	});

	it('defaults to requiring permission when execution errors', async () => {
		execFileMock.mockImplementationOnce(
			(
				_cmd: string,
				_args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				const child = new EventEmitter() as ChildProcess;
				child.stdin = {write: vi.fn(), end: vi.fn()} as unknown as Writable;
				setTimeout(() => {
					callback(new Error('Command failed'), '', '');
					child.emit('close', 1);
				}, 0);
				return child;
			},
		);

		const {autoApprovalVerifier} = await import('./autoApprovalVerifier.js');
		const resultPromise = Effect.runPromise(
			autoApprovalVerifier.verifyNeedsPermission('logs'),
		);

		await vi.runAllTimersAsync();
		expect(await resultPromise).toBe(true);
	});

	it('passes JSON schema flag and prompt content to claude helper', async () => {
		const write = vi.fn();
		const terminalOutput = 'test output';
		execFileMock.mockImplementationOnce(
			(
				_cmd: string,
				args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				const child = new EventEmitter() as ChildProcess;
				child.stdin = {write, end: vi.fn()} as unknown as Writable;
				setTimeout(() => {
					callback(null, '{"needsPermission":false}', '');
					child.emit('close', 0);
				}, 0);
				// Capture the args for assertions
				(child as unknown as {capturedArgs: string[]}).capturedArgs = args;
				return child;
			},
		);

		const {autoApprovalVerifier} = await import('./autoApprovalVerifier.js');
		const resultPromise = Effect.runPromise(
			autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
		);

		await vi.runAllTimersAsync();
		await resultPromise;

		const args =
			(execFileMock.mock.calls[0]?.[1] as string[] | undefined) ?? [];
		expect(args).toEqual(
			expect.arrayContaining(['--output-format', 'json', '--json-schema']),
		);
		expect(write).toHaveBeenCalledWith(expect.stringContaining(terminalOutput));
	});
});
