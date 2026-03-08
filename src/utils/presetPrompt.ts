import type {CommandPreset} from '../types/index.js';
import {injectTeammateMode} from './commandArgs.js';

export type PromptInjectionMethod = 'final-arg' | 'flag' | 'stdin';

export interface PreparedPresetLaunch {
	args: string[];
	stdinPayload?: string;
	method: PromptInjectionMethod;
}

const getCommandName = (command: string): string => {
	const normalized = command.trim().toLowerCase();
	const parts = normalized.split(/[\\/]/);
	return parts[parts.length - 1] || normalized;
};

export const getPromptInjectionMethod = (
	preset: Pick<CommandPreset, 'command' | 'detectionStrategy'>,
): PromptInjectionMethod => {
	const commandName = getCommandName(preset.command);

	if (preset.detectionStrategy === 'opencode' || commandName === 'opencode') {
		return 'flag';
	}

	if (
		preset.detectionStrategy === 'claude' ||
		preset.detectionStrategy === 'codex' ||
		commandName === 'claude' ||
		commandName === 'codex'
	) {
		return 'final-arg';
	}

	return 'stdin';
};

export const describePromptInjection = (
	preset: Pick<CommandPreset, 'command' | 'detectionStrategy'>,
): string => {
	switch (getPromptInjectionMethod(preset)) {
		case 'flag':
			return 'The prompt will be passed as a command flag, for example `--prompt "<your prompt>"`.';
		case 'stdin':
			return 'The prompt will be sent via standard input after the session command starts.';
		case 'final-arg':
			return 'The prompt will be passed as the final command argument.';
	}
};

export const preparePresetLaunch = (
	preset: Pick<CommandPreset, 'command' | 'args' | 'detectionStrategy'>,
	prompt?: string,
): PreparedPresetLaunch => {
	const baseArgs = injectTeammateMode(
		preset.command,
		preset.args || [],
		preset.detectionStrategy,
	);

	if (!prompt) {
		return {
			args: baseArgs,
			method: getPromptInjectionMethod(preset),
		};
	}

	switch (getPromptInjectionMethod(preset)) {
		case 'flag':
			return {
				args: [...baseArgs, '--prompt', prompt],
				method: 'flag',
			};
		case 'stdin':
			return {
				args: baseArgs,
				method: 'stdin',
				stdinPayload: `${prompt}\r`,
			};
		case 'final-arg':
			return {
				args: [...baseArgs, prompt],
				method: 'final-arg',
			};
	}
};
