import {describe, it, expect} from 'vitest';
import {injectTeammateMode} from './commandArgs.js';

describe('injectTeammateMode', () => {
	it('should inject --teammate-mode in-process for claude command with claude strategy', () => {
		const result = injectTeammateMode('claude', ['--resume'], 'claude');
		expect(result).toEqual(['--resume', '--teammate-mode', 'in-process']);
	});

	it('should inject when detectionStrategy is undefined (defaults to claude)', () => {
		const result = injectTeammateMode('claude', ['--resume'], undefined);
		expect(result).toEqual(['--resume', '--teammate-mode', 'in-process']);
	});

	it('should append to existing args without mutating the original array', () => {
		const original = ['--flag1', '--flag2'];
		const result = injectTeammateMode('claude', original, 'claude');
		expect(result).toEqual([
			'--flag1',
			'--flag2',
			'--teammate-mode',
			'in-process',
		]);
		expect(original).toEqual(['--flag1', '--flag2']);
		expect(result).not.toBe(original);
	});

	it('should inject into empty args array', () => {
		const result = injectTeammateMode('claude', [], undefined);
		expect(result).toEqual(['--teammate-mode', 'in-process']);
	});

	it('should not inject when --teammate-mode is already present', () => {
		const args = ['--teammate-mode', 'tmux'];
		const result = injectTeammateMode('claude', args, 'claude');
		expect(result).toEqual(['--teammate-mode', 'tmux']);
		expect(result).toBe(args);
	});

	it('should not inject for non-claude command', () => {
		const args = ['--resume'];
		const result = injectTeammateMode('gemini', args, 'claude');
		expect(result).toEqual(['--resume']);
		expect(result).toBe(args);
	});

	it('should not inject for non-claude detection strategy', () => {
		const args = ['--resume'];
		const result = injectTeammateMode('claude', args, 'gemini');
		expect(result).toEqual(['--resume']);
		expect(result).toBe(args);
	});

	it('should not inject for custom command even with claude-like name', () => {
		const args = ['--config', '/path'];
		const result = injectTeammateMode('my-custom-claude', args, undefined);
		expect(result).toEqual(['--config', '/path']);
		expect(result).toBe(args);
	});
});
