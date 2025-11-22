import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {autoApprovalVerifier} from '../autoApprovalVerifier.js';
import {Effect} from 'effect';
import * as childProcess from 'child_process';

vi.mock('child_process');

describe('AutoApprovalVerifier', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('verifyNeedsPermission', () => {
		it('should return true when Claude detects a problem requiring permission', async () => {
			const terminalOutput = 'Error: Invalid configuration';
			const response = JSON.stringify({needsPermission: true});

			vi.spyOn(childProcess, 'execSync').mockReturnValue(response);

			const result = await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			expect(result).toBe(true);
		});

		it('should return false when Claude determines output is safe', async () => {
			const terminalOutput = 'Processing completed successfully...';
			const response = JSON.stringify({needsPermission: false});

			vi.spyOn(childProcess, 'execSync').mockReturnValue(response);

			const result = await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			expect(result).toBe(false);
		});

		it('should return true (default to caution) when JSON parsing fails', async () => {
			const terminalOutput = 'Some output';
			const invalidResponse = 'Invalid JSON response';

			vi.spyOn(childProcess, 'execSync').mockReturnValue(invalidResponse);

			const result = await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			expect(result).toBe(true);
		});

		it('should detect error messages as requiring permission', async () => {
			const terminalOutput = 'Error: Connection failed';
			const response = JSON.stringify({needsPermission: true});

			vi.spyOn(childProcess, 'execSync').mockReturnValue(response);

			const result = await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			expect(result).toBe(true);
		});

		it('should detect warnings as requiring permission', async () => {
			const terminalOutput = 'WARNING: This action cannot be undone';
			const response = JSON.stringify({needsPermission: true});

			vi.spyOn(childProcess, 'execSync').mockReturnValue(response);

			const result = await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			expect(result).toBe(true);
		});

		it('should handle multiline output correctly', async () => {
			const terminalOutput = `Processing...
> Ready for input
Waiting for user action`;
			const response = JSON.stringify({needsPermission: true});

			vi.spyOn(childProcess, 'execSync').mockReturnValue(response);

			const result = await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			expect(result).toBe(true);
		});

		it('should call claude command with correct flags', async () => {
			const terminalOutput = 'test output';
			const execSyncSpy = vi
				.spyOn(childProcess, 'execSync')
				.mockReturnValue(JSON.stringify({needsPermission: false}));

			await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			const callArgs = (execSyncSpy.mock.calls[0]?.[0] as string) || '';
			expect(callArgs).toContain('--output-format json');
			expect(callArgs).toContain('--json-schema');
		});

		it('should pass prompt via stdin', async () => {
			const terminalOutput = 'test output';
			const execSyncSpy = vi
				.spyOn(childProcess, 'execSync')
				.mockReturnValue(JSON.stringify({needsPermission: false}));

			await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			const options = execSyncSpy.mock.calls[0]?.[1] as {input?: string};
			expect(options?.input).toContain(terminalOutput);
		});

		it('should return true on execution error', async () => {
			const terminalOutput = 'test output';
			vi.spyOn(childProcess, 'execSync').mockImplementation(() => {
				throw new Error('Command failed');
			});

			const result = await Effect.runPromise(
				autoApprovalVerifier.verifyNeedsPermission(terminalOutput),
			);

			expect(result).toBe(true);
		});
	});
});
