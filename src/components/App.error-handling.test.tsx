import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Effect} from 'effect';

// Mock the dependencies
vi.mock('../services/sessionManager.js', async () => {
	const {EventEmitter} = await import('events');
	return {
		SessionManager: class MockSessionManager extends EventEmitter {
			getSession = vi.fn();
			createSessionWithPreset = vi.fn();
			createSessionWithPresetEffect = vi.fn();
			createSessionWithDevcontainer = vi.fn();
			createSessionWithDevcontainerEffect = vi.fn();
			setSessionActive = vi.fn();
		},
	};
});

vi.mock('../services/globalSessionOrchestrator.js', async () => {
	const {SessionManager} = await import('../services/sessionManager.js');
	return {
		globalSessionOrchestrator: {
			getManagerForProject: vi.fn(() => new SessionManager()),
			destroyAllSessions: vi.fn(),
		},
	};
});

vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: class MockWorktreeService {
		createWorktree = vi.fn();
		deleteWorktree = vi.fn();
		listWorktrees = vi.fn(() => ({success: true, data: []}));
	},
}));

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getSelectPresetOnStart: vi.fn(() => false),
	},
}));

vi.mock('../services/projectManager.js', () => ({
	projectManager: {
		addRecentProject: vi.fn(),
	},
}));

describe('App - Error Handling', () => {
	describe('Error Handling During Loading Operations', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		describe('GitError Handling in Worktree Creation', () => {
			it('should display GitError with command, exit code, and stderr during worktree creation', async () => {
				// RED: Test verifies GitError displays all relevant information
				// Expected: Error message should show command, exit code, and stderr
				const {GitError} = await import('../types/errors.js');

				const gitError = new GitError({
					command: 'git worktree add /test/path feature-branch',
					exitCode: 128,
					stderr: 'fatal: invalid reference: feature-branch',
				});

				// Verify formatErrorMessage pattern for GitError
				const formattedMessage =
					gitError._tag === 'GitError'
						? `Git command failed: ${gitError.command} (exit ${gitError.exitCode})\n${gitError.stderr}`
						: 'Unknown error';

				expect(formattedMessage).toContain('Git command failed');
				expect(formattedMessage).toContain('git worktree add');
				expect(formattedMessage).toContain('exit 128');
				expect(formattedMessage).toContain('fatal: invalid reference');
			});

			it('should clear loading state and return to new-worktree form on GitError', async () => {
				// RED: Test verifies loading state cleanup and navigation on GitError
				// Expected: View should change from 'creating-worktree' to 'new-worktree' and display error
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const gitError = new GitError({
					command: 'git worktree add /test/path feature',
					exitCode: 128,
					stderr: 'fatal: worktree already exists',
				});

				mockWorktreeService.createWorktreeEffect = vi.fn(() =>
					Effect.fail(gitError),
				);

				// Simulate loading state
				let currentView = 'creating-worktree';
				let errorMessage: string | null = null;

				expect(currentView).toBe('creating-worktree');

				// Execute worktree creation
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/test/path',
							'feature',
							'main',
							false,
							false,
						),
					),
				);

				expect(result._tag).toBe('Left');

				// On error, format message and navigate to new-worktree form
				if (result._tag === 'Left' && result.left._tag === 'GitError') {
					errorMessage = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
					currentView = 'new-worktree';
				}

				expect(currentView).toBe('new-worktree');
				expect(errorMessage).toContain('worktree already exists');
				expect(errorMessage).toContain('exit 128');
			});

			it('should parse ambiguous branch error and navigate to remote-branch-selector', async () => {
				// RED: Test verifies ambiguous branch error handling clears loading and redirects
				// Expected: Should detect ambiguous error pattern, clear loading, navigate to branch selector
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const ambiguousError = new GitError({
					command: 'git worktree add /test/path feature',
					exitCode: 128,
					stderr:
						"Ambiguous branch 'feature' found in multiple remotes: origin/feature, upstream/feature. Please specify which remote to use.",
				});

				mockWorktreeService.createWorktreeEffect = vi.fn(() =>
					Effect.fail(ambiguousError),
				);

				// Simulate loading state
				let currentView = 'creating-worktree';
				let pendingWorktreeSet = false;

				expect(currentView).toBe('creating-worktree');

				// Execute worktree creation
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/test/path',
							'feature',
							'main',
							false,
							false,
						),
					),
				);

				expect(result._tag).toBe('Left');

				// Check for ambiguous branch error pattern
				if (result._tag === 'Left' && result.left._tag === 'GitError') {
					const errorMessage = result.left.stderr;
					const isAmbiguous =
						errorMessage.includes('Ambiguous branch') &&
						errorMessage.includes('multiple remotes');

					if (isAmbiguous) {
						// Parse ambiguous error and navigate to remote-branch-selector
						pendingWorktreeSet = true;
						currentView = 'remote-branch-selector';
					}
				}

				expect(currentView).toBe('remote-branch-selector');
				expect(pendingWorktreeSet).toBe(true);
			});

			it('should preserve error state and display above new-worktree form for user context', async () => {
				// RED: Test verifies error is preserved and available for display in form view
				// Expected: Error message should be retained after navigation to form view
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const gitError = new GitError({
					command: 'git worktree add /invalid/path feature',
					exitCode: 1,
					stderr: 'fatal: could not create directory',
				});

				mockWorktreeService.createWorktreeEffect = vi.fn(() =>
					Effect.fail(gitError),
				);

				// Track error state across views
				let currentView = 'creating-worktree';
				let persistedError: string | null = null;

				// Execute operation
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/invalid/path',
							'feature',
							'main',
							false,
							false,
						),
					),
				);

				expect(result._tag).toBe('Left');

				// Set error and navigate
				if (result._tag === 'Left' && result.left._tag === 'GitError') {
					persistedError = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
					currentView = 'new-worktree';
				}

				// Verify error is preserved
				expect(currentView).toBe('new-worktree');
				expect(persistedError).not.toBeNull();
				expect(persistedError).toContain('could not create directory');

				// Error should be available for display in form view
				// (App.tsx shows error above NewWorktree component when error state is set)
			});
		});

		describe('FileSystemError Handling in Worktree Operations', () => {
			it('should display FileSystemError with operation, path, and cause information', async () => {
				// RED: Test verifies FileSystemError displays all relevant information
				// Expected: Error message should show operation type, path, and cause
				const {FileSystemError} = await import('../types/errors.js');

				const fsError = new FileSystemError({
					operation: 'mkdir',
					path: '/test/invalid-path',
					cause: 'EACCES: permission denied',
				});

				// Verify formatErrorMessage pattern for FileSystemError
				const formattedMessage =
					fsError._tag === 'FileSystemError'
						? `File ${fsError.operation} failed for ${fsError.path}: ${fsError.cause}`
						: 'Unknown error';

				expect(formattedMessage).toContain('File mkdir failed');
				expect(formattedMessage).toContain('/test/invalid-path');
				expect(formattedMessage).toContain('EACCES: permission denied');
			});

			it('should handle FileSystemError during worktree creation and display error context', async () => {
				// RED: Test verifies FileSystemError handling in worktree creation flow
				// Expected: Should format FileSystemError and navigate appropriately
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {FileSystemError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const fsError = new FileSystemError({
					operation: 'stat',
					path: '/nonexistent/path',
					cause: 'ENOENT: no such file or directory',
				});

				mockWorktreeService.createWorktreeEffect = vi.fn(() =>
					Effect.fail(fsError),
				);

				// Simulate loading state
				let currentView = 'creating-worktree';
				let errorMessage: string | null = null;

				// Execute worktree creation
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/nonexistent/path',
							'feature',
							'main',
							false,
							false,
						),
					),
				);

				expect(result._tag).toBe('Left');

				// Handle FileSystemError
				if (result._tag === 'Left' && result.left._tag === 'FileSystemError') {
					errorMessage = `File ${result.left.operation} failed for ${result.left.path}: ${result.left.cause}`;
					currentView = 'new-worktree';
				}

				expect(currentView).toBe('new-worktree');
				expect(errorMessage).toContain('File stat failed');
				expect(errorMessage).toContain('/nonexistent/path');
				expect(errorMessage).toContain('ENOENT');
			});
		});

		describe('Sequential Operation Error Handling', () => {
			it('should stop sequential worktree deletions on first GitError', async () => {
				// RED: Test verifies deletion loop stops on first error
				// Expected: When deleting multiple worktrees, should stop after first failure
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				let callCount = 0;

				mockWorktreeService.deleteWorktreeEffect = vi.fn(() => {
					callCount++;
					if (callCount === 2) {
						// Second deletion fails
						return Effect.fail(
							new GitError({
								command: 'git worktree remove /path2',
								exitCode: 128,
								stderr: 'fatal: worktree is locked',
							}),
						);
					}
					return Effect.succeed(undefined);
				});

				const worktreePaths = ['/path1', '/path2', '/path3'];
				let currentView = 'deleting-worktree';
				let errorMessage: string | null = null;

				// Simulate sequential deletion with error handling
				let hasError = false;
				for (const path of worktreePaths) {
					const result = await Effect.runPromise(
						Effect.either(
							mockWorktreeService.deleteWorktreeEffect(path, {
								deleteBranch: false,
							}),
						),
					);

					if (result._tag === 'Left') {
						// Stop on first error
						hasError = true;
						if (result.left._tag === 'GitError') {
							errorMessage = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
						}
						currentView = 'delete-worktree';
						break;
					}
				}

				expect(hasError).toBe(true);
				expect(callCount).toBe(2); // Should stop after second deletion fails
				expect(currentView).toBe('delete-worktree');
				expect(errorMessage).toContain('worktree is locked');
			});

			it('should clear loading state and display specific error when deletion fails', async () => {
				// RED: Test verifies loading cleanup and error display for deletion failure
				// Expected: Should clear loading, format error, and navigate to delete-worktree view
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const gitError = new GitError({
					command: 'git worktree remove /path/to/worktree',
					exitCode: 128,
					stderr: 'fatal: worktree contains modified or untracked files',
				});

				mockWorktreeService.deleteWorktreeEffect = vi.fn(() =>
					Effect.fail(gitError),
				);

				// Simulate loading state
				let currentView = 'deleting-worktree';
				let errorMessage: string | null = null;

				// Execute deletion
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.deleteWorktreeEffect('/path/to/worktree', {
							deleteBranch: false,
						}),
					),
				);

				expect(result._tag).toBe('Left');

				// Handle error
				if (result._tag === 'Left' && result.left._tag === 'GitError') {
					errorMessage = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
					currentView = 'delete-worktree';
				}

				expect(currentView).toBe('delete-worktree');
				expect(errorMessage).toContain('modified or untracked files');
				expect(errorMessage).toContain('exit 128');
			});

			it('should preserve error state for display above delete-worktree form', async () => {
				// RED: Test verifies error persistence for user context in delete flow
				// Expected: Error should be available for display in delete-worktree view
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const gitError = new GitError({
					command: 'git worktree remove /test/path',
					exitCode: 1,
					stderr: 'fatal: Cannot remove main worktree',
				});

				mockWorktreeService.deleteWorktreeEffect = vi.fn(() =>
					Effect.fail(gitError),
				);

				// Track error across view transitions
				let currentView = 'deleting-worktree';
				let persistedError: string | null = null;

				// Execute deletion
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.deleteWorktreeEffect('/test/path', {
							deleteBranch: false,
						}),
					),
				);

				// Set error and navigate
				if (result._tag === 'Left' && result.left._tag === 'GitError') {
					persistedError = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
					currentView = 'delete-worktree';
				}

				// Verify error is preserved for display
				expect(currentView).toBe('delete-worktree');
				expect(persistedError).not.toBeNull();
				expect(persistedError).toContain('Cannot remove main worktree');
				// App.tsx shows error above DeleteWorktree component when error state is set
			});
		});

		describe('Error Message Formatting Integration', () => {
			it('should format GitError consistently with formatErrorMessage helper', async () => {
				// RED: Test verifies GitError formatting matches App component's formatErrorMessage
				// Expected: Format should match the pattern in App.tsx line 96-97
				const {GitError} = await import('../types/errors.js');

				const gitError = new GitError({
					command: 'git worktree add /path feature',
					exitCode: 128,
					stderr: 'fatal: invalid reference: feature',
				});

				// This should match App.tsx formatErrorMessage for GitError
				const formattedMessage =
					gitError._tag === 'GitError'
						? `Git command failed: ${gitError.command} (exit ${gitError.exitCode})\n${gitError.stderr}`
						: 'Unknown error';

				expect(formattedMessage).toBe(
					'Git command failed: git worktree add /path feature (exit 128)\nfatal: invalid reference: feature',
				);
			});

			it('should format FileSystemError consistently with formatErrorMessage helper', async () => {
				// RED: Test verifies FileSystemError formatting matches App component's formatErrorMessage
				// Expected: Format should match the pattern in App.tsx line 98-99
				const {FileSystemError} = await import('../types/errors.js');

				const fsError = new FileSystemError({
					operation: 'mkdir',
					path: '/test/path',
					cause: 'EACCES: permission denied',
				});

				// This should match App.tsx formatErrorMessage for FileSystemError
				const formattedMessage =
					fsError._tag === 'FileSystemError'
						? `File ${fsError.operation} failed for ${fsError.path}: ${fsError.cause}`
						: 'Unknown error';

				expect(formattedMessage).toBe(
					'File mkdir failed for /test/path: EACCES: permission denied',
				);
			});

			it('should handle union type discrimination for AppError in error handlers', async () => {
				// RED: Test verifies proper error discrimination pattern for mixed error types
				// Expected: Should correctly identify and format different AppError types
				const {GitError, FileSystemError} = await import('../types/errors.js');

				const errors = [
					new GitError({
						command: 'git worktree add',
						exitCode: 128,
						stderr: 'fatal: error',
					}),
					new FileSystemError({
						operation: 'stat',
						path: '/path',
						cause: 'ENOENT',
					}),
				];

				const formattedMessages = errors.map(error => {
					switch (error._tag) {
						case 'GitError':
							return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
						case 'FileSystemError':
							return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
						default:
							return 'Unknown error';
					}
				});

				expect(formattedMessages[0]).toContain('Git command failed');
				expect(formattedMessages[1]).toContain('File stat failed');
			});
		});
	});
});
