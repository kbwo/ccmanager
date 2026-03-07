import {describe, expect, it} from 'vitest';
import {
	extractBranchNameFromOutput,
	worktreeNameGenerator as generator,
} from './worktreeNameGenerator.js';

describe('WorktreeNameGenerator output parsing', () => {
	it('normalizes direct json branchName responses', async () => {
		const value = extractBranchNameFromOutput(
			'{"branchName":"feature/add prompt"}',
		);

		expect(value).toBe('feature/add-prompt');
		expect(generator).toBeDefined();
	});

	it('extracts nested text payloads', async () => {
		const value = extractBranchNameFromOutput(
			'{"type":"result","result":{"text":"fix/worktree-loading-state"}}',
		);

		expect(value).toBe('fix/worktree-loading-state');
	});

	it('falls back to plain text output', async () => {
		const value = extractBranchNameFromOutput(
			'```text\nfeature/generated-name\n```',
		);

		expect(value).toBe('feature/generated-name');
	});

	it('extracts branchName from verbose result payloads', () => {
		const value = extractBranchNameFromOutput(
			'type":"result","subtype":"success","structured_output":{"branchName":"fix/trim-worktree-name"},"uuid":"123"',
		);

		expect(value).toBe('fix/trim-worktree-name');
	});
});
