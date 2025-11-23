import {Effect} from 'effect';
import {ProcessError} from '../types/errors.js';
import {logger} from '../utils/logger.js';
import {execFile, type ExecFileOptionsWithStringEncoding} from 'child_process';

/**
 * Response from Claude Haiku for auto-approval verification
 */
export interface AutoApprovalResponse {
	needsPermission: boolean;
}

/**
 * Service to verify if auto-approval should be granted for pending states
 * Uses Claude Haiku model to analyze terminal output and determine if
 * user permission is required before proceeding
 */
export class AutoApprovalVerifier {
	private readonly model = 'haiku';

	/**
	 * Verify if the current terminal output requires user permission
	 * before proceeding with auto-approval
	 *
	 * @param terminalOutput - Current terminal output to analyze
	 * @returns Effect that resolves to true if permission needed, false if can auto-approve
	 */
	verifyNeedsPermission(
		terminalOutput: string,
	): Effect.Effect<boolean, ProcessError, never> {
		return Effect.tryPromise({
			try: async () => {
				const prompt = `You are a CLI assistant analyzer. Examine the following terminal output and determine if there's a problem that requires user permission before proceeding.

Terminal Output:
${terminalOutput}

Rules:
- Return true if there are error messages, warnings, or unclear states that need user review
- Return true if the output indicates a problem that might cause issues if auto-approved
- Return false if the output is clear and safe to proceed without user interaction
- Return false if this appears to be a normal continuation of work

Be conservative: when in doubt, return true to ask for user permission.`;

				const jsonSchema = JSON.stringify({
					type: 'object',
					properties: {
						needsPermission: {
							type: 'boolean',
							description:
								'Whether user permission is needed before auto-approval',
						},
					},
					required: ['needsPermission'],
				});

				try {
					const execOptions: ExecFileOptionsWithStringEncoding = {
						encoding: 'utf8',
						maxBuffer: 10 * 1024 * 1024,
					};

					const stdout = await new Promise<string>((resolve, reject) => {
						const child = execFile(
							'claude',
							[
								'--model',
								this.model,
								'-p',
								'--output-format',
								'json',
								'--json-schema',
								jsonSchema,
							],
							execOptions,
							error => {
								if (error) {
									reject(error);
								}
							},
						);

						let output = '';

						child.stdout?.setEncoding('utf8');
						child.stdout?.on('data', chunk => {
							output += chunk;
						});

						child.stderr?.on('data', chunk => {
							logger.debug('Auto-approval stderr chunk', chunk.toString());
						});

						child.on('error', err => reject(err));
						child.on('close', code => {
							if (code && code !== 0) {
								reject(new Error(`claude exited with code ${code}`));
								return;
							}
							resolve(output);
						});

						if (child.stdin) {
							child.stdin.write(prompt);
							child.stdin.end();
						} else {
							reject(new Error('claude stdin unavailable'));
						}
					});

					// Parse the JSON response directly
					const response = JSON.parse(stdout) as AutoApprovalResponse;
					return response.needsPermission;
				} catch (error) {
					logger.error('Auto-approval verification failed', error);
					// Default to requiring permission on error
					return true;
				}
			},
			catch: (error: unknown) => {
				logger.error('Auto-approval verification error', error);
				return new ProcessError({
					command: 'autoApprovalVerifier.verifyNeedsPermission',
					message:
						error instanceof Error
							? error.message
							: 'Failed to verify auto-approval',
				});
			},
		});
	}
}

export const autoApprovalVerifier = new AutoApprovalVerifier();
