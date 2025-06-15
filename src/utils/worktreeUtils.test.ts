import {describe, it, expect} from 'vitest';
import {generateWorktreeDirectory, extractBranchParts} from './worktreeUtils.js';

describe('generateWorktreeDirectory', () => {
	describe('with default pattern', () => {
		it('should generate directory with sanitized branch name', () => {
			expect(generateWorktreeDirectory('feature/my-feature')).toBe(
				'../feature-my-feature',
			);
			expect(generateWorktreeDirectory('bugfix/fix-123')).toBe(
				'../bugfix-fix-123',
			);
			expect(generateWorktreeDirectory('release/v1.0.0')).toBe(
				'../release-v1.0.0',
			);
		});

		it('should handle branch names without slashes', () => {
			expect(generateWorktreeDirectory('main')).toBe('../main');
			expect(generateWorktreeDirectory('develop')).toBe('../develop');
			expect(generateWorktreeDirectory('my-feature')).toBe('../my-feature');
		});

		it('should remove special characters', () => {
			expect(generateWorktreeDirectory('feature/my@feature!')).toBe(
				'../feature-myfeature',
			);
			expect(generateWorktreeDirectory('bugfix/#123')).toBe('../bugfix-123');
			expect(generateWorktreeDirectory('release/v1.0.0-beta')).toBe(
				'../release-v1.0.0-beta',
			);
		});

		it('should handle edge cases', () => {
			expect(generateWorktreeDirectory('//feature//')).toBe('../feature');
			expect(generateWorktreeDirectory('-feature-')).toBe('../feature');
			expect(generateWorktreeDirectory('FEATURE/UPPERCASE')).toBe(
				'../feature-uppercase',
			);
		});
	});

	describe('with custom patterns', () => {
		it('should use custom pattern with {branch} placeholder', () => {
			expect(
				generateWorktreeDirectory('feature/my-feature', '../worktrees/{branch}'),
			).toBe('../worktrees/feature-my-feature');
			expect(
				generateWorktreeDirectory('bugfix/123', '/tmp/{branch}-wt'),
			).toBe('/tmp/bugfix-123-wt');
		});

		it('should handle patterns without placeholders', () => {
			expect(
				generateWorktreeDirectory('feature/test', '../fixed-directory'),
			).toBe('../fixed-directory');
		});

		it('should normalize paths', () => {
			expect(
				generateWorktreeDirectory('feature/test', '../foo/../bar/{branch}'),
			).toBe('../bar/feature-test');
			expect(
				generateWorktreeDirectory('feature/test', './worktrees/{branch}'),
			).toBe('worktrees/feature-test');
		});
	});
});

describe('extractBranchParts', () => {
	it('should extract prefix and name from branch with slash', () => {
		expect(extractBranchParts('feature/my-feature')).toEqual({
			prefix: 'feature',
			name: 'my-feature',
		});
		expect(extractBranchParts('bugfix/fix-123')).toEqual({
			prefix: 'bugfix',
			name: 'fix-123',
		});
	});

	it('should handle branches with multiple slashes', () => {
		expect(extractBranchParts('feature/user/profile-page')).toEqual({
			prefix: 'feature',
			name: 'user/profile-page',
		});
		expect(extractBranchParts('release/v1.0/final')).toEqual({
			prefix: 'release',
			name: 'v1.0/final',
		});
	});

	it('should handle branches without slashes', () => {
		expect(extractBranchParts('main')).toEqual({
			name: 'main',
		});
		expect(extractBranchParts('develop')).toEqual({
			name: 'develop',
		});
	});

	it('should handle empty branch name', () => {
		expect(extractBranchParts('')).toEqual({
			name: '',
		});
	});
});