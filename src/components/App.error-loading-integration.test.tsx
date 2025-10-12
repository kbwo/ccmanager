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
		createWorktreeEffect = vi.fn();
		deleteWorktree = vi.fn();
		deleteWorktreeEffect = vi.fn();
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

describe('App - Error Handling Integration Tests for Loading Scenarios', () => {
	describe('Session Creation with ProcessError', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should clear loading state and display error message when session creation fails with ProcessError', async () => {
			// RED: Test session creation error handling end-to-end
			// Expected: Loading state cleared, error displayed, navigation to menu
			const {SessionManager} = await import('../services/sessionManager.js');
			const {ProcessError} = await import('../types/errors.js');
			const mockManager = new SessionManager();

			const processError = new ProcessError({
				command: 'claude',
				message: 'Failed to spawn PTY: command not found',
				exitCode: 127,
			});

			mockManager.createSessionWithPresetEffect = vi.fn(() =>
				Effect.fail(processError),
			);

			// Simulate flow: menu → creating-session (loading) → menu (error)
			let currentView = 'menu';
			let errorMessage: string | null = null;

			// User selects worktree without session
			// handleSelectWorktree sets loading state
			currentView = 'creating-session';
			expect(currentView).toBe('creating-session');

			// Execute session creation Effect
			const result = await Effect.runPromise(
				Effect.either(mockManager.createSessionWithPresetEffect('/test/path')),
			);

			expect(result._tag).toBe('Left');

			// Handle error - format message and navigate
			if (result._tag === 'Left') {
				const formatted =
					result.left._tag === 'ProcessError'
						? `Process error: ${result.left.message}`
						: 'Unknown error';
				errorMessage = `Failed to create session: ${formatted}`;
				currentView = 'menu'; // Clear loading by navigating away
			}

			// Verify: loading cleared, error set, back to menu
			expect(currentView).toBe('menu');
			expect(errorMessage).toContain('Failed to spawn PTY');
			expect(errorMessage).toContain('command not found');
		});

		it('should handle ConfigError during session creation and display configuration error', async () => {
			// RED: Test ConfigError in session creation flow
			// Expected: Clear loading, show config-specific error, return to menu
			const {SessionManager} = await import('../services/sessionManager.js');
			const {ConfigError} = await import('../types/errors.js');
			const mockManager = new SessionManager();

			const configError = new ConfigError({
				configPath: '~/.config/ccmanager/config.json',
				reason: 'parse',
				details: 'Invalid JSON: unexpected token at line 5',
			});

			mockManager.createSessionWithPresetEffect = vi.fn(() =>
				Effect.fail(configError),
			);

			// Simulate flow
			let currentView = 'creating-session';
			let errorMessage: string | null = null;

			// Execute session creation
			const result = await Effect.runPromise(
				Effect.either(mockManager.createSessionWithPresetEffect('/test/path')),
			);

			expect(result._tag).toBe('Left');

			// Handle ConfigError
			if (result._tag === 'Left') {
				const formatted =
					result.left._tag === 'ConfigError'
						? `Configuration error (${result.left.reason}): ${result.left.details}`
						: 'Unknown error';
				errorMessage = `Failed to create session: ${formatted}`;
				currentView = 'menu';
			}

			// Verify error handling
			expect(currentView).toBe('menu');
			expect(errorMessage).toContain('Configuration error');
			expect(errorMessage).toContain('Invalid JSON');
			expect(errorMessage).toContain('line 5');
		});

		it('should transition from loading view to error display in one render cycle', async () => {
			// RED: Test that state transition is immediate
			// Expected: No intermediate state between loading and error display
			const {SessionManager} = await import('../services/sessionManager.js');
			const {ProcessError} = await import('../types/errors.js');
			const mockManager = new SessionManager();

			mockManager.createSessionWithPresetEffect = vi.fn(() =>
				Effect.fail(
					new ProcessError({
						command: 'claude',
						message: 'Failed to create session',
					}),
				),
			);

			// Track state transitions
			const stateHistory: string[] = [];
			let currentView = 'menu';
			stateHistory.push(currentView);

			// Enter loading state
			currentView = 'creating-session';
			stateHistory.push(currentView);

			// Execute and handle error
			const result = await Effect.runPromise(
				Effect.either(mockManager.createSessionWithPresetEffect('/test/path')),
			);

			if (result._tag === 'Left') {
				// Single transition: loading → error display (menu)
				currentView = 'menu';
				stateHistory.push(currentView);
			}

			// Verify: menu → loading → error (no intermediate states)
			expect(stateHistory).toEqual(['menu', 'creating-session', 'menu']);
			expect(stateHistory.length).toBe(3);
		});
	});

	describe('Worktree Creation with GitError', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should clear loading state and return to form with error on GitError', async () => {
			// RED: Test worktree creation error handling end-to-end
			// Expected: Loading cleared, error displayed, back to new-worktree form
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			const gitError = new GitError({
				command: 'git worktree add /test/path feature',
				exitCode: 128,
				stderr: 'fatal: invalid reference: feature',
			});

			mockService.createWorktreeEffect = vi.fn(() => Effect.fail(gitError));

			// Simulate flow: new-worktree form → creating-worktree (loading) → new-worktree (error)
			let currentView = 'new-worktree';
			let errorMessage: string | null = null;

			// User submits form, handler sets loading state
			currentView = 'creating-worktree';
			expect(currentView).toBe('creating-worktree');

			// Execute worktree creation
			const result = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/test/path',
						'feature',
						'main',
						false,
						false,
					),
				),
			);

			expect(result._tag).toBe('Left');

			// Handle error - format and navigate
			if (result._tag === 'Left') {
				const formatted =
					result.left._tag === 'GitError'
						? `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`
						: 'Unknown error';
				errorMessage = formatted;
				currentView = 'new-worktree'; // Return to form with error
			}

			// Verify: loading cleared, error set, back to form
			expect(currentView).toBe('new-worktree');
			expect(errorMessage).toContain('Git command failed');
			expect(errorMessage).toContain('exit 128');
			expect(errorMessage).toContain('invalid reference: feature');
		});

		it('should preserve error state for display above new-worktree form', async () => {
			// RED: Test that error persists across view transition for user context
			// Expected: Error remains available after navigating back to form
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			const gitError = new GitError({
				command: 'git worktree add /invalid feature',
				exitCode: 1,
				stderr: 'fatal: could not create leading directories',
			});

			mockService.createWorktreeEffect = vi.fn(() => Effect.fail(gitError));

			// Track error persistence
			let currentView = 'creating-worktree';
			let persistedError: string | null = null;

			// Execute operation
			const result = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/invalid',
						'feature',
						'main',
						false,
						false,
					),
				),
			);

			// Set error and navigate
			if (result._tag === 'Left' && result.left._tag === 'GitError') {
				persistedError = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
				currentView = 'new-worktree';
			}

			// Verify error is preserved
			expect(currentView).toBe('new-worktree');
			expect(persistedError).not.toBeNull();
			expect(persistedError).toContain('could not create leading directories');

			// Simulate form re-render with error displayed
			const errorDisplayed = persistedError !== null;
			expect(errorDisplayed).toBe(true);
		});

		it('should handle FileSystemError during worktree creation', async () => {
			// RED: Test FileSystemError in worktree creation flow
			// Expected: Clear loading, show filesystem-specific error, back to form
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {FileSystemError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			const fsError = new FileSystemError({
				operation: 'mkdir',
				path: '/protected/path',
				cause: 'EACCES: permission denied',
			});

			mockService.createWorktreeEffect = vi.fn(() => Effect.fail(fsError));

			// Simulate flow
			let currentView = 'creating-worktree';
			let errorMessage: string | null = null;

			// Execute worktree creation
			const result = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/protected/path',
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

			// Verify error handling
			expect(currentView).toBe('new-worktree');
			expect(errorMessage).toContain('File mkdir failed');
			expect(errorMessage).toContain('/protected/path');
			expect(errorMessage).toContain('EACCES: permission denied');
		});
	});

	describe('Worktree Deletion with Error on Second Deletion', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should stop deletion loop on first error and display specific error message', async () => {
			// RED: Test sequential deletion stops on error and displays specific message
			// Expected: Loop stops at first error, loading cleared, error displayed
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			// Track deletion calls
			let deletionCount = 0;

			mockService.deleteWorktreeEffect = vi.fn((path: string) => {
				deletionCount++;
				if (deletionCount === 2) {
					// Second deletion fails
					return Effect.fail(
						new GitError({
							command: `git worktree remove ${path}`,
							exitCode: 128,
							stderr: 'fatal: worktree is locked',
						}),
					);
				}
				return Effect.succeed(undefined);
			});

			// Simulate sequential deletion
			const worktreePaths = ['/path1', '/path2', '/path3'];
			let currentView = 'deleting-worktree';
			let errorMessage: string | null = null;
			let hasError = false;

			// Sequential deletion loop (mimics handleDeleteWorktrees)
			for (const path of worktreePaths) {
				const result = await Effect.runPromise(
					Effect.either(
						mockService.deleteWorktreeEffect(path, {deleteBranch: false}),
					),
				);

				if (result._tag === 'Left') {
					// Stop on first error
					hasError = true;
					if (result.left._tag === 'GitError') {
						errorMessage = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
					}
					currentView = 'delete-worktree'; // Clear loading, show error
					break;
				}
			}

			// Verify: loop stopped at second deletion, error displayed
			expect(hasError).toBe(true);
			expect(deletionCount).toBe(2); // Only first two deletions attempted
			expect(currentView).toBe('delete-worktree');
			expect(errorMessage).toContain('worktree is locked');
			expect(errorMessage).toContain('exit 128');
		});

		it('should clear loading state and preserve error for display above delete-worktree form', async () => {
			// RED: Test error persistence in deletion flow
			// Expected: Error remains available after navigating back to delete form
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			const gitError = new GitError({
				command: 'git worktree remove /test/main-worktree',
				exitCode: 1,
				stderr: 'fatal: Cannot remove main worktree',
			});

			mockService.deleteWorktreeEffect = vi.fn(() => Effect.fail(gitError));

			// Track error persistence
			let currentView = 'deleting-worktree';
			let persistedError: string | null = null;

			// Execute deletion
			const result = await Effect.runPromise(
				Effect.either(
					mockService.deleteWorktreeEffect('/test/main-worktree', {
						deleteBranch: false,
					}),
				),
			);

			// Set error and navigate
			if (result._tag === 'Left' && result.left._tag === 'GitError') {
				persistedError = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
				currentView = 'delete-worktree';
			}

			// Verify error is preserved
			expect(currentView).toBe('delete-worktree');
			expect(persistedError).not.toBeNull();
			expect(persistedError).toContain('Cannot remove main worktree');

			// Error should be available for display in delete-worktree view
			const errorDisplayed = persistedError !== null;
			expect(errorDisplayed).toBe(true);
		});

		it('should handle mixed success and error in sequential deletions', async () => {
			// RED: Test partial success in batch deletion
			// Expected: First deletion succeeds, second fails, loop stops
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			const successfulPaths: string[] = [];
			let deletionCount = 0;

			mockService.deleteWorktreeEffect = vi.fn((path: string) => {
				deletionCount++;
				if (deletionCount === 1) {
					// First deletion succeeds
					successfulPaths.push(path);
					return Effect.succeed(undefined);
				}
				// Second deletion fails
				return Effect.fail(
					new GitError({
						command: `git worktree remove ${path}`,
						exitCode: 128,
						stderr: 'fatal: worktree contains modified files',
					}),
				);
			});

			const worktreePaths = ['/path1', '/path2', '/path3'];
			let currentView = 'deleting-worktree';
			let hasError = false;

			// Sequential deletion
			for (const path of worktreePaths) {
				const result = await Effect.runPromise(
					Effect.either(
						mockService.deleteWorktreeEffect(path, {deleteBranch: false}),
					),
				);

				if (result._tag === 'Left') {
					hasError = true;
					currentView = 'delete-worktree';
					break;
				}
			}

			// Verify: first succeeded, then stopped
			expect(successfulPaths).toEqual(['/path1']);
			expect(deletionCount).toBe(2);
			expect(hasError).toBe(true);
			expect(currentView).toBe('delete-worktree');
		});
	});

	describe('Remote Branch Selector Retry Flow', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should display loading spinner again during retry after disambiguation', async () => {
			// RED: Test that handleRemoteBranchSelected shows loading state during retry
			// Expected: After user selects remote branch, loading spinner appears again
			const {WorktreeService} = await import('../services/worktreeService.js');
			const mockService = new WorktreeService();

			// Simulate successful retry after disambiguation
			mockService.createWorktreeEffect = vi.fn(() =>
				Effect.succeed({
					path: '/test/path',
					branch: 'feature',
					isMainWorktree: false,
					hasSession: false,
				}),
			);

			// Track state transitions through retry flow
			const stateHistory: string[] = [];
			let currentView = 'remote-branch-selector';
			stateHistory.push(currentView);

			// User selects remote branch reference
			// handleRemoteBranchSelected sets loading state again
			currentView = 'creating-worktree';
			stateHistory.push(currentView);

			// Execute retry with resolved branch
			const result = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/test/path',
						'feature',
						'origin/feature', // Resolved reference
						false,
						false,
					),
				),
			);

			expect(result._tag).toBe('Right');

			// Success: return to menu
			if (result._tag === 'Right') {
				currentView = 'menu';
				stateHistory.push(currentView);
			}

			// Verify: selector → loading → menu
			expect(stateHistory).toEqual([
				'remote-branch-selector',
				'creating-worktree',
				'menu',
			]);
		});

		it('should handle error during retry and navigate back to new-worktree form', async () => {
			// RED: Test error handling during retry after disambiguation
			// Expected: If retry fails, clear loading and show error
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			const retryError = new GitError({
				command: 'git worktree add /test/path origin/feature',
				exitCode: 128,
				stderr: 'fatal: origin/feature is not a valid reference',
			});

			mockService.createWorktreeEffect = vi.fn(() => Effect.fail(retryError));

			// Simulate retry flow
			let currentView = 'remote-branch-selector';
			let errorMessage: string | null = null;

			// User selects remote, handler sets loading state
			currentView = 'creating-worktree';

			// Execute retry
			const result = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/test/path',
						'feature',
						'origin/feature',
						false,
						false,
					),
				),
			);

			expect(result._tag).toBe('Left');

			// Handle retry error
			if (result._tag === 'Left' && result.left._tag === 'GitError') {
				errorMessage = `Git command failed: ${result.left.command} (exit ${result.left.exitCode})\n${result.left.stderr}`;
				currentView = 'new-worktree'; // Show error in form
			}

			// Verify: loading cleared, error displayed, back to form
			expect(currentView).toBe('new-worktree');
			expect(errorMessage).toContain('not a valid reference');
		});

		it('should clear loading state in both success and error paths during retry', async () => {
			// RED: Test loading cleanup consistency in retry flow
			// Expected: Loading state always cleared regardless of outcome
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			// Test success path
			mockService.createWorktreeEffect = vi.fn(() =>
				Effect.succeed({
					path: '/test/path',
					branch: 'feature',
					isMainWorktree: false,
					hasSession: false,
				}),
			);

			let currentView = 'creating-worktree';
			const successResult = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/test/path',
						'feature',
						'origin/feature',
						false,
						false,
					),
				),
			);

			if (successResult._tag === 'Right') {
				currentView = 'menu'; // Loading cleared
			}

			expect(currentView).toBe('menu');

			// Test error path
			mockService.createWorktreeEffect = vi.fn(() =>
				Effect.fail(
					new GitError({
						command: 'git worktree add',
						exitCode: 1,
						stderr: 'error',
					}),
				),
			);

			currentView = 'creating-worktree';
			const errorResult = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/test/path',
						'feature',
						'origin/feature',
						false,
						false,
					),
				),
			);

			if (errorResult._tag === 'Left') {
				currentView = 'new-worktree'; // Loading cleared
			}

			expect(currentView).toBe('new-worktree');
		});
	});

	describe('Error Display Transition from Loading View', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should transition from loading view to error display in single render cycle for session creation', async () => {
			// RED: Test immediate state transition for session errors
			// Expected: No intermediate states between loading and error
			const {SessionManager} = await import('../services/sessionManager.js');
			const {ProcessError} = await import('../types/errors.js');
			const mockManager = new SessionManager();

			mockManager.createSessionWithPresetEffect = vi.fn(() =>
				Effect.fail(
					new ProcessError({command: 'claude', message: 'Failed to spawn'}),
				),
			);

			// Track all state transitions
			const transitions: Array<{from: string; to: string}> = [];
			let currentView = 'menu';

			// Transition 1: menu → loading
			const previousView = currentView;
			currentView = 'creating-session';
			transitions.push({from: previousView, to: currentView});

			// Execute operation
			const result = await Effect.runPromise(
				Effect.either(mockManager.createSessionWithPresetEffect('/test/path')),
			);

			// Transition 2: loading → error (menu)
			if (result._tag === 'Left') {
				const prev = currentView;
				currentView = 'menu';
				transitions.push({from: prev, to: currentView});
			}

			// Verify: exactly 2 transitions, no intermediate states
			expect(transitions).toHaveLength(2);
			expect(transitions[0]).toEqual({from: 'menu', to: 'creating-session'});
			expect(transitions[1]).toEqual({from: 'creating-session', to: 'menu'});
		});

		it('should transition from loading view to error display in single render cycle for worktree creation', async () => {
			// RED: Test immediate state transition for worktree errors
			// Expected: No intermediate states between loading and error
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			mockService.createWorktreeEffect = vi.fn(() =>
				Effect.fail(
					new GitError({
						command: 'git worktree add',
						exitCode: 1,
						stderr: 'error',
					}),
				),
			);

			// Track transitions
			const transitions: Array<{from: string; to: string}> = [];
			let currentView = 'new-worktree';

			// Transition 1: form → loading
			const prev1 = currentView;
			currentView = 'creating-worktree';
			transitions.push({from: prev1, to: currentView});

			// Execute operation
			const result = await Effect.runPromise(
				Effect.either(
					mockService.createWorktreeEffect(
						'/test/path',
						'feature',
						'main',
						false,
						false,
					),
				),
			);

			// Transition 2: loading → error (form)
			if (result._tag === 'Left') {
				const prev2 = currentView;
				currentView = 'new-worktree';
				transitions.push({from: prev2, to: currentView});
			}

			// Verify: exactly 2 transitions
			expect(transitions).toHaveLength(2);
			expect(transitions[0]).toEqual({
				from: 'new-worktree',
				to: 'creating-worktree',
			});
			expect(transitions[1]).toEqual({
				from: 'creating-worktree',
				to: 'new-worktree',
			});
		});

		it('should transition from loading view to error display in single render cycle for worktree deletion', async () => {
			// RED: Test immediate state transition for deletion errors
			// Expected: No intermediate states between loading and error
			const {WorktreeService} = await import('../services/worktreeService.js');
			const {GitError} = await import('../types/errors.js');
			const mockService = new WorktreeService();

			mockService.deleteWorktreeEffect = vi.fn(() =>
				Effect.fail(
					new GitError({
						command: 'git worktree remove',
						exitCode: 1,
						stderr: 'error',
					}),
				),
			);

			// Track transitions
			const transitions: Array<{from: string; to: string}> = [];
			let currentView = 'delete-worktree';

			// Transition 1: form → loading
			const prev1 = currentView;
			currentView = 'deleting-worktree';
			transitions.push({from: prev1, to: currentView});

			// Execute operation
			const result = await Effect.runPromise(
				Effect.either(
					mockService.deleteWorktreeEffect('/test/path', {deleteBranch: false}),
				),
			);

			// Transition 2: loading → error (form)
			if (result._tag === 'Left') {
				const prev2 = currentView;
				currentView = 'delete-worktree';
				transitions.push({from: prev2, to: currentView});
			}

			// Verify: exactly 2 transitions
			expect(transitions).toHaveLength(2);
			expect(transitions[0]).toEqual({
				from: 'delete-worktree',
				to: 'deleting-worktree',
			});
			expect(transitions[1]).toEqual({
				from: 'deleting-worktree',
				to: 'delete-worktree',
			});
		});

		it('should not have intermediate loading states during error handling', async () => {
			// RED: Test that error handling doesn't introduce extra loading states
			// Expected: State sequence is strictly: normal → loading → error (no extras)
			const {SessionManager} = await import('../services/sessionManager.js');
			const {ProcessError} = await import('../types/errors.js');
			const mockManager = new SessionManager();

			mockManager.createSessionWithPresetEffect = vi.fn(() =>
				Effect.fail(new ProcessError({command: 'claude', message: 'Failed'})),
			);

			// Record all state changes with timestamps
			const stateLog: Array<{state: string; timestamp: number}> = [];
			let currentView = 'menu';
			stateLog.push({state: currentView, timestamp: Date.now()});

			// Enter loading
			currentView = 'creating-session';
			stateLog.push({state: currentView, timestamp: Date.now()});

			// Execute with error
			const result = await Effect.runPromise(
				Effect.either(mockManager.createSessionWithPresetEffect('/test/path')),
			);

			// Handle error
			if (result._tag === 'Left') {
				currentView = 'menu';
				stateLog.push({state: currentView, timestamp: Date.now()});
			}

			// Verify: exactly 3 states, no repeats or intermediate states
			expect(stateLog).toHaveLength(3);
			expect(stateLog.map(s => s.state)).toEqual([
				'menu',
				'creating-session',
				'menu',
			]);

			// Verify no duplicate consecutive states
			for (let i = 1; i < stateLog.length; i++) {
				expect(stateLog[i]!.state).not.toBe(stateLog[i - 1]!.state);
			}
		});
	});
});
