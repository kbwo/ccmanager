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

const DEFAULT_TIMEOUT_SECONDS = 30;

const getTimeoutMs = (): number => {
	const config = configurationManager.getAutoApprovalConfig();
	const timeoutSeconds = config.timeout ?? DEFAULT_TIMEOUT_SECONDS;
	return timeoutSeconds * 1000;
};

const createAbortError = (): Error => {
	const error = new Error('Auto-approval verification aborted');
	error.name = 'AbortError';
	return error;
};

const PLACEHOLDER = {
	terminal: '{{TERMINAL_OUTPUT}}',
};
const PROMPT_TEMPLATE = `You are a safety gate preventing risky auto-approvals of CLI actions. Examine the terminal output below and decide if the agent must pause for user permission.

Terminal Output:
${PLACEHOLDER.terminal}

Return true (permission needed) if ANY of these apply:
- Output includes or references commands that write/modify/delete files (e.g., rm, mv, chmod, chown, cp, tee, sed -i), manage packages (npm/pip/apt/brew install), change git history, or alter configs.
- Privilege escalation or sensitive areas are involved (sudo, root, /etc, /var, /boot, system services), or anything touching SSH keys/credentials, browser data, environment secrets, or home dotfiles.
- Network or data exfiltration is possible (curl/wget, ssh/scp/rsync, docker/podman, port binding, npm publish, git push/fetch from unknown hosts).
- Process/system impact is likely (kill, pkill, systemctl, reboot, heavy loops, resource-intensive builds/tests, spawning many processes).
- Signs of command injection, untrusted input being executed, or unclear placeholders like \`<path>\`, \`$(...)\`, backticks, or pipes that could be unsafe.
- Errors, warnings, ambiguous states, manual review requests, or anything not clearly safe/read-only.

Return false (auto-approve) when:
- The output clearly shows explicit user intent/confirmation to run the exact action (e.g., user typed the command AND confirmed, or explicitly said “I want to delete <path>; please do it now”). Explicit intent should normally override the risk list unless there are signs of coercion/compromise, the target path is unclear, or the action differs from what was confirmed.
- The output shows strictly read-only, low-risk operations (e.g., lint/test passing, help text, formatting dry runs, simple logs) with no pending commands that could change the system or touch sensitive data.

When unsure, return true.

Respond with ONLY valid JSON matching: {"needsPermission": true|false, "reason"?: string}. When needsPermission is true, include a brief reason (<=140 chars) explaining why permission is needed. Do not add any other fields or text.`;

const buildPrompt = (terminalOutput: string): string =>
	PROMPT_TEMPLATE.replace(PLACEHOLDER.terminal, terminalOutput);

/**
 * Service to verify if auto-approval should be granted for pending states
 * Uses Claude Haiku model to analyze terminal output and determine if
 * user permission is required before proceeding
 */
export class AutoApprovalVerifier {
	private readonly model = 'haiku';

	private createExecOptions(
		signal?: AbortSignal,
	): ExecFileOptionsWithStringEncoding {
		return {
			encoding: 'utf8',
			maxBuffer: 10 * 1024 * 1024,
			signal,
		};
	}

	private runClaudePrompt(
		prompt: string,
		jsonSchema: string,
		signal?: AbortSignal,
	): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let settled = false;
			let child: ChildProcess | undefined;
			const execOptions = this.createExecOptions(signal);

			const settle = (action: () => void) => {
				if (settled) return;
				settled = true;
				removeAbortListener();
				clearTimeout(timeoutId);
				action();
			};

			const abortListener = () => {
				settle(() => {
					if (child?.pid) {
						child.kill('SIGKILL');
					}
					reject(createAbortError());
				});
			};

			const removeAbortListener = () => {
				if (!signal) return;
				signal.removeEventListener('abort', abortListener);
			};

			const timeoutMs = getTimeoutMs();
			const timeoutId = setTimeout(() => {
				settle(() => {
					logger.warn(
						'Auto-approval verification timed out, terminating helper Claude process',
					);
					if (child?.pid) {
						child.kill('SIGKILL');
					}
					reject(
						new Error(
							`Auto-approval verification timed out after ${timeoutMs / 1000}s`,
						),
					);
				});
			}, timeoutMs);

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
						if (error) {
							reject(error);
							return;
						}
						resolve(stdout);
					});
				},
			);

			child.stderr?.on('data', chunk => {
				logger.debug('Auto-approval stderr chunk', chunk.toString());
			});

			child.on('error', err => {
				settle(() => reject(err));
			});

			if (child.stdin) {
				child.stdin.write(prompt);
				child.stdin.end();
			} else {
				settle(() => reject(new Error('claude stdin unavailable')));
			}

			child.on('close', code => {
				if (code && code !== 0) {
					settle(() => reject(new Error(`claude exited with code ${code}`)));
				}
			});
		});
	}

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

			const timeoutMs = getTimeoutMs();
			timeoutId = setTimeout(() => {
				logger.warn(
					'Auto-approval custom command timed out, terminating process',
				);
				settle(() => {
					child.kill('SIGKILL');
					reject(
						new Error(
							`Auto-approval verification custom command timed out after ${timeoutMs / 1000}s`,
						),
					);
				});
			}, timeoutMs);

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
	): Effect.Effect<AutoApprovalResponse, ProcessError, never> {
		const attemptVerification = Effect.tryPromise({
			try: async () => {
				const autoApprovalConfig = configurationManager.getAutoApprovalConfig();
				const customCommand = autoApprovalConfig.customCommand?.trim();
				const prompt = buildPrompt(terminalOutput);

				const jsonSchema = JSON.stringify({
					type: 'object',
					properties: {
						needsPermission: {
							type: 'boolean',
							description:
								'Whether user permission is needed before auto-approval',
						},
						reason: {
							type: 'string',
							description:
								'Optional reason describing why user permission is needed',
						},
					},
					required: ['needsPermission'],
				});

				const signal = options?.signal;

				if (signal?.aborted) {
					throw createAbortError();
				}

				const responseText = customCommand
					? await this.runCustomCommand(
							customCommand,
							prompt,
							terminalOutput,
							signal,
						)
					: await this.runClaudePrompt(prompt, jsonSchema, signal);

				return JSON.parse(responseText) as AutoApprovalResponse;
			},
			catch: (error: unknown) => error as Error,
		});

		return Effect.catchAll(attemptVerification, (error: Error) => {
			if (error.name === 'AbortError') {
				return Effect.fail(
					new ProcessError({
						command: 'autoApprovalVerifier.verifyNeedsPermission',
						message: 'Auto-approval verification aborted',
					}),
				);
			}

			const isParseError = error instanceof SyntaxError;
			const reason = isParseError
				? 'Failed to parse auto-approval helper response'
				: 'Auto-approval helper command failed';

			logger.error(reason, error);

			return Effect.succeed({
				needsPermission: true,
				reason: `${reason}: ${error.message ?? 'unknown error'}`,
			});
		});
	}
}

export const autoApprovalVerifier = new AutoApprovalVerifier();
