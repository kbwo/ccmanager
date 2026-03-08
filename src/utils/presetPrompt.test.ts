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

	describe('describePromptInjection', () => {
		it('describes final-arg for claude', () => {
			expect(
				describePromptInjection({
					command: 'claude',
					detectionStrategy: 'claude',
				}),
			).toContain('final command argument');
		});

		it('describes final-arg for codex', () => {
			expect(
				describePromptInjection({
					command: 'codex',
					detectionStrategy: 'codex',
				}),
			).toContain('final command argument');
		});

		it('describes final-arg for cursor', () => {
			expect(
				describePromptInjection({
					command: 'agent',
					detectionStrategy: 'cursor',
				}),
			).toContain('final command argument');
		});

		it('describes final-arg for cline', () => {
			expect(
				describePromptInjection({
					command: 'cline',
					detectionStrategy: 'cline',
				}),
			).toContain('final command argument');
		});

		it('describes --prompt flag for opencode', () => {
			expect(
				describePromptInjection({
					command: 'opencode',
					detectionStrategy: 'opencode',
				}),
			).toContain('--prompt');
		});

		it('describes -i flag for gemini', () => {
			expect(
				describePromptInjection({
					command: 'gemini',
					detectionStrategy: 'gemini',
				}),
			).toContain('-i');
		});

		it('describes -i flag for github-copilot', () => {
			expect(
				describePromptInjection({
					command: 'copilot',
					detectionStrategy: 'github-copilot',
				}),
			).toContain('-i');
		});

		it('describes -p flag for kimi', () => {
			expect(
				describePromptInjection({
					command: 'kimi',
					detectionStrategy: 'kimi',
				}),
			).toContain('-p');
		});

	});

	describe('getPromptInjectionMethod', () => {
		it('returns final-arg for claude', () => {
			expect(
				getPromptInjectionMethod({
					command: 'claude',
					detectionStrategy: 'claude',
				}),
			).toBe('final-arg');
		});

		it('returns final-arg for codex', () => {
			expect(
				getPromptInjectionMethod({
					command: 'codex',
					detectionStrategy: 'codex',
				}),
			).toBe('final-arg');
		});

		it('returns final-arg for cursor', () => {
			expect(
				getPromptInjectionMethod({
					command: 'agent',
					detectionStrategy: 'cursor',
				}),
			).toBe('final-arg');
		});

		it('returns final-arg for cline', () => {
			expect(
				getPromptInjectionMethod({
					command: 'cline',
					detectionStrategy: 'cline',
				}),
			).toBe('final-arg');
		});

		it('returns flag for opencode', () => {
			expect(
				getPromptInjectionMethod({
					command: 'opencode',
					detectionStrategy: 'opencode',
				}),
			).toBe('flag');
		});

		it('returns flag for gemini', () => {
			expect(
				getPromptInjectionMethod({
					command: 'gemini',
					detectionStrategy: 'gemini',
				}),
			).toBe('flag');
		});

		it('returns flag for github-copilot', () => {
			expect(
				getPromptInjectionMethod({
					command: 'copilot',
					detectionStrategy: 'github-copilot',
				}),
			).toBe('flag');
		});

		it('returns flag for kimi', () => {
			expect(
				getPromptInjectionMethod({
					command: 'kimi',
					detectionStrategy: 'kimi',
				}),
			).toBe('flag');
		});

		it('falls back to claude strategy when detectionStrategy is not set', () => {
			expect(getPromptInjectionMethod({command: 'claude'})).toBe('final-arg');
		});
	});
});
