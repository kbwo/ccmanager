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

	it('uses the final argument for codex presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'codex', args: [], detectionStrategy: 'codex'},
				'refactor utils',
			),
		).toEqual({
			args: ['refactor utils'],
			method: 'final-arg',
		});
	});

	it('uses the final argument for cursor presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'agent', args: [], detectionStrategy: 'cursor'},
				'review code',
			),
		).toEqual({
			args: ['review code'],
			method: 'final-arg',
		});
	});

	it('uses the final argument for cline presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'cline', args: [], detectionStrategy: 'cline'},
				'fix bug',
			),
		).toEqual({
			args: ['fix bug'],
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

	it('uses -i for gemini presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'gemini', args: [], detectionStrategy: 'gemini'},
				'explain code',
			),
		).toEqual({
			args: ['-i', 'explain code'],
			method: 'flag',
		});
	});

	it('uses -i for github-copilot presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'copilot', args: [], detectionStrategy: 'github-copilot'},
				'create readme',
			),
		).toEqual({
			args: ['-i', 'create readme'],
			method: 'flag',
		});
	});

	it('uses -p for kimi presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'kimi', args: [], detectionStrategy: 'kimi'},
				'summarize',
			),
		).toEqual({
			args: ['-p', 'summarize'],
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
		expect(
			describePromptInjection({
				command: 'gemini',
				detectionStrategy: 'gemini',
			}),
		).toContain('-i');
		expect(getPromptInjectionMethod({command: 'custom-agent'})).toBe('stdin');
	});

	it('uses stdin when detectionStrategy is not set even for known command names', () => {
		expect(getPromptInjectionMethod({command: 'claude'})).toBe('stdin');
		expect(getPromptInjectionMethod({command: 'opencode'})).toBe('stdin');
	});
});
