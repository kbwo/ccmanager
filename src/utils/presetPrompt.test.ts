import {describe, expect, it} from 'vitest';
import {
	describePromptInjection,
	getPromptInjectionMethod,
	preparePresetLaunch,
} from './presetPrompt.js';

describe('presetPrompt', () => {
	it('uses the final argument for claude presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'claude', args: ['--resume'], detectionStrategy: 'claude'},
				'fix the tests',
			),
		).toEqual({
			args: ['--resume', '--teammate-mode', 'in-process', 'fix the tests'],
			method: 'final-arg',
		});
	});

	it('uses --prompt for opencode presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'opencode', args: ['run'], detectionStrategy: 'opencode'},
				'implement feature',
			),
		).toEqual({
			args: ['run', '--prompt', 'implement feature'],
			method: 'flag',
		});
	});

	it('falls back to stdin for unknown commands', () => {
		expect(
			preparePresetLaunch(
				{command: 'custom-agent', args: ['--interactive']},
				'hello',
			),
		).toEqual({
			args: ['--interactive'],
			method: 'stdin',
			stdinPayload: 'hello\r',
		});
	});

	it('describes the configured prompt injection method', () => {
		expect(
			describePromptInjection({command: 'codex', detectionStrategy: 'codex'}),
		).toContain('final command argument');
		expect(
			describePromptInjection({
				command: 'opencode',
				detectionStrategy: 'opencode',
			}),
		).toContain('--prompt');
		expect(getPromptInjectionMethod({command: 'custom'})).toBe('stdin');
	});
});
