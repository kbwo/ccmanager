import {Effect} from 'effect';
import {ProcessError} from '../types/errors.js';
import {AutoApprovalResponse} from '../types/index.js';
import {configurationManager} from './configurationManager.js';
import {logger} from '../utils/logger.js';
import {
	execFile,
	spawn,
	type ChildProcess,
	type ExecFileOptionsWithStringEncoding,
	type SpawnOptions,
} from 'child_process';

const AUTO_APPROVAL_TIMEOUT_MS = 60_000;

const createAbortError = (): Error => {
	const error = new Error('Auto-approval verification aborted');
	error.name = 'AbortError';
	return error;
};

/**
 * Service to verify if auto-approval should be granted for pending states
 * Uses Claude Haiku model to analyze terminal output and determine if
 * user permission is required before proceeding
 */
export class AutoApprovalVerifier {
	private readonly model = 'haiku';

	private async runCustomCommand(
		command: string,
		prompt: string,
		terminalOutput: string,
		signal?: AbortSignal,
	): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let settled = false;
			let timeoutId: NodeJS.Timeout;

			const settle = (action: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				if (signal) {
					signal.removeEventListener('abort', abortListener);
				}
				action();
			};

			const abortListener = () => {
				settle(() => {
					child.kill('SIGKILL');
					reject(createAbortError());
				});
			};

			const spawnOptions: SpawnOptions = {
				shell: true,
				env: {
					...process.env,
					DEFAULT_PROMPT: prompt,
					TERMINAL_OUTPUT: terminalOutput,
				},
				stdio: ['ignore', 'pipe', 'pipe'],
				signal,
			};

			const child = spawn(command, [], spawnOptions);

			let stdout = '';
			let stderr = '';

			timeoutId = setTimeout(() => {
				logger.warn(
					'Auto-approval custom command timed out, terminating process',
				);
				settle(() => {
					child.kill('SIGKILL');
					reject(
						new Error(
							'Auto-approval verification custom command timed out after 60s',
						),
					);
				});
			}, AUTO_APPROVAL_TIMEOUT_MS);

			if (signal) {
				if (signal.aborted) {
					abortListener();
					return;
				}
				signal.addEventListener('abort', abortListener, {once: true});
			}

			child.stdout?.on('data', chunk => {
				stdout += chunk.toString();
			});

			child.stderr?.on('data', chunk => {
				const data = chunk.toString();
				stderr += data;
				logger.debug('Auto-approval custom command stderr', data);
			});

			child.on('error', error => {
				settle(() => reject(error));
			});

			child.on('exit', (code, signalExit) => {
				settle(() => {
					if (code === 0) {
						resolve(stdout);
						return;
					}
					const message =
						signalExit !== null
							? `Custom command terminated by signal ${signalExit}`
							: `Custom command exited with code ${code}`;
					reject(new Error(stderr ? `${message}\nStderr: ${stderr}` : message));
				});
			});
		});
	}

	/**
	 * Verify if the current terminal output requires user permission
	 * before proceeding with auto-approval
	 *
	 * @param terminalOutput - Current terminal output to analyze
	 * @returns Effect that resolves to true if permission needed, false if can auto-approve
	 */
	verifyNeedsPermission(
		terminalOutput: string,
		options?: {signal?: AbortSignal},
	): Effect.Effect<boolean, ProcessError, never> {
		return Effect.tryPromise({
			try: async () => {
				const autoApprovalConfig = configurationManager.getAutoApprovalConfig();
				const customCommand = autoApprovalConfig.customCommand?.trim();

				const prompt = `You are a safety gate preventing risky auto-approvals of CLI actions. Examine the terminal output below and decide if the agent must pause for user permission.

Terminal Output:
${terminalOutput}

Return true (permission needed) if ANY of these apply:
- Output includes or references commands that write/modify/delete files (e.g., rm, mv, chmod, chown, cp, tee, sed -i), manage packages (npm/pip/apt/brew install), change git history, or alter configs.
- Privilege escalation or sensitive areas are involved (sudo, root, /etc, /var, /boot, system services), or anything touching SSH keys/credentials, browser data, environment secrets, or home dotfiles.
- Network or data exfiltration is possible (curl/wget, ssh/scp/rsync, docker/podman, port binding, npm publish, git push/fetch from unknown hosts).
- Process/system impact is likely (kill, pkill, systemctl, reboot, heavy loops, resource-intensive builds/tests, spawning many processes).
- Signs of command injection, untrusted input being executed, or unclear placeholders like \`<path>\`, \`$(...)\`, backticks, or pipes that could be unsafe.
- Errors, warnings, ambiguous states, manual review requests, or anything not clearly safe/read-only.

Return false (auto-approve) when:
- The output clearly shows explicit user intent/confirmation to run the action (e.g., user typed the command or answered yes/confirm), even if it is not read-only or could be destructive.
- The output shows strictly read-only, low-risk operations (e.g., lint/test passing, help text, formatting dry runs, simple logs) with no pending commands that could change the system or touch sensitive data.

When unsure, return true.

Respond with ONLY valid JSON matching: {"needsPermission": true|false}. Do not add any explanations or extra fields.`;

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
					const signal = options?.signal;

					if (signal?.aborted) {
						throw createAbortError();
					}

					const execOptions: ExecFileOptionsWithStringEncoding = {
						encoding: 'utf8',
						maxBuffer: 10 * 1024 * 1024,
						signal,
					};

					const responseText = customCommand
						? await this.runCustomCommand(
								customCommand,
								prompt,
								terminalOutput,
								signal,
							)
						: await new Promise<string>((resolve, reject) => {
								let settled = false;
								let child: ChildProcess | undefined;
								let timeoutId: NodeJS.Timeout;

								const removeAbortListener = () => {
									if (!signal) return;
									signal.removeEventListener('abort', abortListener);
								};

								const settle = (action: () => void) => {
									if (settled) {
										return;
									}
									settled = true;
									removeAbortListener();
									action();
								};

								const abortListener = () => {
									settle(() => {
										clearTimeout(timeoutId);
										if (child?.pid) {
											child.kill('SIGKILL');
										}
										reject(createAbortError());
									});
								};

								timeoutId = setTimeout(() => {
									settle(() => {
										logger.warn(
											'Auto-approval verification timed out, terminating helper Claude process',
										);
										if (child?.pid) {
											child.kill('SIGKILL');
										}
										reject(
											new Error(
												'Auto-approval verification timed out after 60s',
											),
										);
									});
								}, AUTO_APPROVAL_TIMEOUT_MS);

								if (signal) {
									if (signal.aborted) {
										abortListener();
										return;
									}
									signal.addEventListener('abort', abortListener, {once: true});
								}

								child = execFile(
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
									(error, stdout) => {
										settle(() => {
											clearTimeout(timeoutId);
											if (error) {
												reject(error);
												return;
											}
											// execFile buffers stdout/stderr for us
											resolve(stdout);
										});
									},
								);

								child.stderr?.on('data', chunk => {
									logger.debug('Auto-approval stderr chunk', chunk.toString());
								});

								child.on('error', err => {
									settle(() => {
										clearTimeout(timeoutId);
										reject(err);
									});
								});

								if (child.stdin) {
									child.stdin.write(prompt);
									child.stdin.end();
								} else {
									settle(() => {
										clearTimeout(timeoutId);
										reject(new Error('claude stdin unavailable'));
									});
								}

								child.on('close', code => {
									if (code && code !== 0) {
										settle(() => {
											clearTimeout(timeoutId);
											reject(new Error(`claude exited with code ${code}`));
										});
									}
								});
							});

					// Parse the JSON response directly
					const response = JSON.parse(responseText) as AutoApprovalResponse;
					return response.needsPermission;
				} catch (error) {
					if ((error as Error)?.name === 'AbortError') {
						throw error;
					}
					logger.error('Auto-approval verification failed', error);
					// Default to requiring permission on error
					return true;
				}
			},
			catch: (error: unknown) => {
				if ((error as Error)?.name === 'AbortError') {
					return new ProcessError({
						command: 'autoApprovalVerifier.verifyNeedsPermission',
						message: 'Auto-approval verification aborted',
					});
				}
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
