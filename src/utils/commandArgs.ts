import type {StateDetectionStrategy} from '../types/index.js';

/**
 * Inject `--teammate-mode in-process` into args when running the `claude` command
 * with the `claude` detection strategy. This prevents tmux conflicts when
 * Claude Code's agent teams feature is used inside ccmanager's PTY-based sessions.
 *
 * Returns the original array unchanged if injection is not needed.
 */
export function injectTeammateMode(
	command: string,
	args: string[],
	detectionStrategy: StateDetectionStrategy | undefined,
): string[] {
	if (
		command === 'claude' &&
		(detectionStrategy ?? 'claude') === 'claude' &&
		!args.includes('--teammate-mode')
	) {
		return [...args, '--teammate-mode', 'in-process'];
	}

	return args;
}
