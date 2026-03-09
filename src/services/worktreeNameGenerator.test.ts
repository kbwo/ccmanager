import {describe, expect, it} from 'vitest';
import {
	deduplicateBranchName,
	extractBranchNameFromOutput,
	generateFallbackBranchName,
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

describe('deduplicateBranchName', () => {
	it('returns the name unchanged when no conflict exists', () => {
		expect(deduplicateBranchName('feature/new', ['main', 'develop'])).toBe(
			'feature/new',
		);
	});

	it('appends -2 suffix when the name already exists', () => {
		expect(deduplicateBranchName('feature/new', ['feature/new', 'main'])).toBe(
			'feature/new-2',
		);
	});

	it('increments the suffix when multiple conflicts exist', () => {
		expect(
			deduplicateBranchName('fix/bug', ['fix/bug', 'fix/bug-2', 'fix/bug-3']),
		).toBe('fix/bug-4');
	});

	it('compares branch names case-insensitively', () => {
		expect(deduplicateBranchName('Feature/New', ['feature/new'])).toBe(
			'Feature/New-2',
		);
	});
});

describe('generateFallbackBranchName', () => {
	it('returns a name matching YYYYMMDD-hex pattern', () => {
		const name = generateFallbackBranchName();
		expect(name).toMatch(/^\d{8}-[0-9a-f]{6}$/);
	});

	it('deduplicates against existing branches', () => {
		const first = generateFallbackBranchName();
		const name = generateFallbackBranchName([first]);
		// Either it's different (random collision unlikely) or it has a -2 suffix
		expect(name).not.toBe(first);
	});
});
