import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
	generateWorktreeDirectory,
	extractBranchParts,
	truncateString,
	prepareWorktreeItems,
	calculateColumnPositions,
	assembleWorktreeLabel,
} from './worktreeUtils.js';
import {Worktree, Session} from '../types/index.js';
import {execSync} from 'child_process';
import {Mutex, createInitialSessionStateData} from './mutex.js';

// Mock child_process module
vi.mock('child_process');

describe('generateWorktreeDirectory', () => {
	const mockedExecSync = vi.mocked(execSync);
	const projectPath = '/home/user/src/myproject';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('with default pattern', () => {
		it('should generate directory with sanitized branch name', () => {
			expect(generateWorktreeDirectory(projectPath, 'feature/my-feature')).toBe(
				'../feature-my-feature',
			);
			expect(generateWorktreeDirectory(projectPath, 'bugfix/fix-123')).toBe(
				'../bugfix-fix-123',
			);
			expect(generateWorktreeDirectory(projectPath, 'release/v1.0.0')).toBe(
				'../release-v1.0.0',
			);
		});

		it('should handle branch names without slashes', () => {
			expect(generateWorktreeDirectory(projectPath, 'main')).toBe('../main');
			expect(generateWorktreeDirectory(projectPath, 'develop')).toBe(
				'../develop',
			);
			expect(generateWorktreeDirectory(projectPath, 'my-feature')).toBe(
				'../my-feature',
			);
		});

		it('should remove special characters', () => {
			expect(
				generateWorktreeDirectory(projectPath, 'feature/my@feature!'),
			).toBe('../feature-myfeature');
			expect(generateWorktreeDirectory(projectPath, 'bugfix/#123')).toBe(
				'../bugfix-123',
			);
			expect(
				generateWorktreeDirectory(projectPath, 'release/v1.0.0-beta'),
			).toBe('../release-v1.0.0-beta');
		});

		it('should handle edge cases', () => {
			expect(generateWorktreeDirectory(projectPath, '//feature//')).toBe(
				'../feature',
			);
			expect(generateWorktreeDirectory(projectPath, '-feature-')).toBe(
				'../feature',
			);
			expect(generateWorktreeDirectory(projectPath, 'FEATURE/UPPERCASE')).toBe(
				'../feature-uppercase',
			);
		});
	});

	describe('with custom patterns', () => {
		it('should use custom pattern with {branch} placeholder', () => {
			expect(
				generateWorktreeDirectory(
					projectPath,
					'feature/my-feature',
					'../worktrees/{branch}',
				),
			).toBe('../worktrees/feature-my-feature');
			expect(
				generateWorktreeDirectory(
					projectPath,
					'bugfix/123',
					'/tmp/{branch}-wt',
				),
			).toBe('/tmp/bugfix-123-wt');
		});

		it('should use git repository name when in main working directory', () => {
			mockedExecSync.mockReturnValue('.git');

			expect(
				generateWorktreeDirectory(
					'/home/user/src/main-repo',
					'feature/test',
					'../worktrees/{project}-{branch}',
				),
			).toBe('../worktrees/main-repo-feature-test');
		});

		it('should use git repository name when git command succeeds (worktree case)', () => {
			mockedExecSync.mockReturnValue('/home/user/src/main-repo/.git');

			expect(
				generateWorktreeDirectory(
					'/home/user/src/worktree-branch',
					'feature/test',
					'../worktrees/{project}-{branch}',
				),
			).toBe('../worktrees/main-repo-feature-test');
		});

		it('should use custom pattern with {project} placeholder (fallback case)', () => {
			mockedExecSync.mockImplementation(() => {
				throw new Error(
					'fatal: not a git repository (or any of the parent directories): .git',
				);
			});

			expect(
				generateWorktreeDirectory(
					'/home/user/src/myproject',
					'feature/test',
					'../worktrees/{project}-{branch}',
				),
			).toBe('../worktrees/myproject-feature-test');
			expect(
				generateWorktreeDirectory(
					'/home/user/src/foo',
					'main',
					'/tmp/{project}',
				),
			).toBe('/tmp/foo');
		});

		it('should handle patterns without placeholders', () => {
			expect(
				generateWorktreeDirectory(
					projectPath,
					'feature/test',
					'../fixed-directory',
				),
			).toBe('../fixed-directory');
		});

		it('should normalize paths', () => {
			expect(
				generateWorktreeDirectory(
					projectPath,
					'feature/test',
					'../foo/../bar/{branch}',
				),
			).toBe('../bar/feature-test');
			expect(
				generateWorktreeDirectory(
					projectPath,
					'feature/test',
					'./worktrees/{branch}',
				),
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

describe('truncateString', () => {
	it('should return original string if shorter than max length', () => {
		expect(truncateString('hello', 10)).toBe('hello');
		expect(truncateString('test', 4)).toBe('test');
	});

	it('should truncate and add ellipsis if longer than max length', () => {
		expect(truncateString('hello world', 8)).toBe('hello...');
		expect(truncateString('this is a long string', 10)).toBe('this is...');
	});

	it('should handle edge cases', () => {
		expect(truncateString('', 5)).toBe('');
		expect(truncateString('abc', 3)).toBe('abc');
		expect(truncateString('abcd', 3)).toBe('...');
	});
});

describe('prepareWorktreeItems', () => {
	const mockWorktree: Worktree = {
		path: '/path/to/worktree',
		branch: 'feature/test-branch',
		isMainWorktree: false,
		hasSession: false,
	};

	// Simplified mock
	const mockSession: Session = {
		id: 'test-session',
		worktreePath: '/path/to/worktree',
		process: {} as Session['process'],
		output: [],
		outputHistory: [],
		lastActivity: new Date(),
		isActive: true,
		terminal: {} as Session['terminal'],
		stateCheckInterval: undefined,
		isPrimaryCommand: true,
		commandConfig: undefined,
		detectionStrategy: 'claude',
		devcontainerConfig: undefined,
		stateMutex: new Mutex({
			...createInitialSessionStateData(),
			state: 'idle',
		}),
	};

	it('should prepare basic worktree without git status', () => {
		const items = prepareWorktreeItems([mockWorktree], []);
		expect(items).toHaveLength(1);
		expect(items[0]?.baseLabel).toBe('feature/test-branch');
	});

	it('should include session status in label', () => {
		const items = prepareWorktreeItems([mockWorktree], [mockSession]);
		expect(items[0]?.baseLabel).toContain('[○ Idle]');
	});

	it('should mark main worktree', () => {
		const mainWorktree = {...mockWorktree, isMainWorktree: true};
		const items = prepareWorktreeItems([mainWorktree], []);
		expect(items[0]?.baseLabel).toContain('(main)');
	});

	it('should truncate long branch names', () => {
		const longBranch = {
			...mockWorktree,
			branch:
				'feature/this-is-a-very-long-branch-name-that-should-be-truncated',
		};
		const items = prepareWorktreeItems([longBranch], []);
		expect(items[0]?.baseLabel.length).toBeLessThanOrEqual(80); // 70 + status + default
	});
});

describe('column alignment', () => {
	const mockItems = [
		{
			worktree: {} as Worktree,
			baseLabel: 'feature/test-branch',
			fileChanges: '\x1b[32m+10\x1b[0m \x1b[31m-5\x1b[0m',
			aheadBehind: '\x1b[33m↑2 ↓3\x1b[0m',
			parentBranch: '',
			lengths: {
				base: 19, // 'feature/test-branch'.length
				fileChanges: 6, // '+10 -5'.length
				aheadBehind: 5, // '↑2 ↓3'.length
				parentBranch: 0,
			},
		},
		{
			worktree: {} as Worktree,
			baseLabel: 'main',
			fileChanges: '\x1b[32m+2\x1b[0m \x1b[31m-1\x1b[0m',
			aheadBehind: '\x1b[33m↑1\x1b[0m',
			parentBranch: '',
			lengths: {
				base: 4, // 'main'.length
				fileChanges: 5, // '+2 -1'.length
				aheadBehind: 2, // '↑1'.length
				parentBranch: 0,
			},
		},
	];

	it('should calculate column positions from items', () => {
		const positions = calculateColumnPositions(mockItems);
		expect(positions.fileChanges).toBe(21); // 19 + 2 padding
		expect(positions.aheadBehind).toBeGreaterThan(positions.fileChanges);
		expect(positions.parentBranch).toBeGreaterThan(positions.aheadBehind);
	});

	it('should assemble label with proper alignment', () => {
		const item = mockItems[0]!;
		const columns = calculateColumnPositions(mockItems);
		const result = assembleWorktreeLabel(item, columns);

		expect(result).toContain('feature/test-branch');
		expect(result).toContain('\x1b[32m+10\x1b[0m');
		expect(result).toContain('\x1b[33m↑2 ↓3\x1b[0m');

		// Check alignment by stripping ANSI codes
		const plain = result.replace(/\x1b\[[0-9;]*m/g, '');
		expect(plain.indexOf('+10 -5')).toBe(21); // Should start at column 21
	});
});
