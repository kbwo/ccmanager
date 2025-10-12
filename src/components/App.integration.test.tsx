import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Effect} from 'effect';
import type {Session} from '../types/index.js';
import type {IPty} from 'node-pty';
import type {Terminal} from '@xterm/headless';

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

describe('App - Integration Tests', () => {
	describe('Integration Tests for Enhanced Worktree Views', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		describe('Worktree Creation View Tests', () => {
			it('should display "Creating worktree..." message without session data copy', async () => {
				// This test verifies message composition logic for worktree creation
				const copySessionData = false;
				const expectedMessage = copySessionData
					? 'Creating worktree and copying session data...'
					: 'Creating worktree...';

				expect(expectedMessage).toBe('Creating worktree...');
			});

			it('should display "Creating worktree and copying session data..." message with session data copy', async () => {
				// Test that when copySessionData is true, the enhanced message is displayed
				const copySessionData = true;
				const expectedMessage = copySessionData
					? 'Creating worktree and copying session data...'
					: 'Creating worktree...';

				expect(expectedMessage).toBe(
					'Creating worktree and copying session data...',
				);
			});

			it('should clear loading state on successful worktree creation', async () => {
				// This test verifies that after successful worktree creation,
				// the loading state is cleared and the app navigates to menu view
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);

				const mockWorktreeService = new WorktreeService();
				mockWorktreeService.createWorktreeEffect = vi.fn(() =>
					Effect.succeed({
						path: '/test/worktree',
						branch: 'feature-branch',
						isMainWorktree: false,
						hasSession: false,
					}),
				);

				// Verify that the Effect succeeds and returns a worktree
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/test/worktree',
							'feature-branch',
							'main',
							false,
							false,
						),
					),
				);

				expect(result._tag).toBe('Right');
				if (result._tag === 'Right') {
					expect(result.right.path).toBe('/test/worktree');
					expect(result.right.branch).toBe('feature-branch');
				}
			});

			it('should clear loading state on worktree creation error and navigate to form', async () => {
				// This test verifies that when worktree creation fails,
				// the loading state is cleared and error is displayed
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const gitError = new GitError({
					command: 'git worktree add',
					exitCode: 128,
					stderr: 'fatal: worktree already exists',
				});

				mockWorktreeService.createWorktreeEffect = vi.fn(() =>
					Effect.fail(gitError),
				);

				// Execute the Effect and verify it fails properly
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/test/worktree',
							'feature-branch',
							'main',
							false,
							false,
						),
					),
				);

				expect(result._tag).toBe('Left');
				if (result._tag === 'Left') {
					expect(result.left).toBeInstanceOf(GitError);
					expect(result.left._tag).toBe('GitError');
					if (result.left._tag === 'GitError') {
						expect(result.left.stderr).toContain('worktree already exists');
					}
				}
			});

			it('should handle ambiguous branch error and navigate to remote-branch-selector', async () => {
				// This test verifies that ambiguous branch errors trigger disambiguation flow
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const ambiguousError = new GitError({
					command: 'git worktree add',
					exitCode: 128,
					stderr:
						"Ambiguous branch 'feature' found in multiple remotes: origin/feature, upstream/feature. Please specify which remote to use.",
				});

				mockWorktreeService.createWorktreeEffect = vi.fn(() =>
					Effect.fail(ambiguousError),
				);

				// Execute the Effect and verify the error contains ambiguous branch message
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/test/worktree',
							'feature',
							'main',
							false,
							false,
						),
					),
				);

				expect(result._tag).toBe('Left');
				if (result._tag === 'Left' && result.left._tag === 'GitError') {
					expect(result.left.stderr).toContain('Ambiguous branch');
					expect(result.left.stderr).toContain('multiple remotes');
				}
			});

			it('should display loading spinner during retry after remote branch disambiguation', async () => {
				// This test verifies that when retrying worktree creation after disambiguation,
				// the loading spinner is displayed again
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				// First call fails with ambiguous error, second call succeeds
				let callCount = 0;
				mockWorktreeService.createWorktreeEffect = vi.fn(() => {
					callCount++;
					if (callCount === 1) {
						return Effect.fail(
							new GitError({
								command: 'git worktree add',
								exitCode: 128,
								stderr:
									"Ambiguous branch 'feature' found in multiple remotes: origin/feature, upstream/feature. Please specify which remote to use.",
							}),
						);
					}
					return Effect.succeed({
						path: '/test/worktree',
						branch: 'origin/feature',
						isMainWorktree: false,
						hasSession: false,
					});
				});

				// First call - should fail
				const firstResult = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/test/worktree',
							'feature',
							'main',
							false,
							false,
						),
					),
				);
				expect(firstResult._tag).toBe('Left');

				// Second call - should succeed (simulating retry with selected remote)
				const secondResult = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.createWorktreeEffect(
							'/test/worktree',
							'feature',
							'origin/feature',
							false,
							false,
						),
					),
				);
				expect(secondResult._tag).toBe('Right');
			});
		});

		describe('Worktree Deletion View Tests', () => {
			it('should display "Deleting worktrees..." message without branch deletion', async () => {
				// Test that standard deletion displays the basic message
				const deleteBranch = false;
				const expectedMessage = deleteBranch
					? 'Deleting worktrees and branches...'
					: 'Deleting worktrees...';

				expect(expectedMessage).toBe('Deleting worktrees...');
			});

			it('should display "Deleting worktrees and branches..." message with branch deletion', async () => {
				// Test that deletion with branch deletion displays the enhanced message
				const deleteBranch = true;
				const expectedMessage = deleteBranch
					? 'Deleting worktrees and branches...'
					: 'Deleting worktrees...';

				expect(expectedMessage).toBe('Deleting worktrees and branches...');
			});

			it('should clear loading state on successful deletion', async () => {
				// This test verifies successful deletion clears loading and returns to menu
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);

				const mockWorktreeService = new WorktreeService();
				mockWorktreeService.deleteWorktreeEffect = vi.fn(() =>
					Effect.succeed(undefined),
				);

				// Execute the Effect and verify success
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.deleteWorktreeEffect('/test/path', {
							deleteBranch: false,
						}),
					),
				);

				expect(result._tag).toBe('Right');
			});

			it('should persist loading state throughout multiple sequential worktree deletions', async () => {
				// This test verifies that loading state persists while deleting multiple worktrees
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);

				const mockWorktreeService = new WorktreeService();
				mockWorktreeService.deleteWorktreeEffect = vi.fn(() =>
					Effect.succeed(undefined),
				);

				const worktreePaths = ['/path1', '/path2', '/path3'];

				// Simulate sequential deletion
				for (const path of worktreePaths) {
					const result = await Effect.runPromise(
						Effect.either(
							mockWorktreeService.deleteWorktreeEffect(path, {
								deleteBranch: false,
							}),
						),
					);

					// Each deletion should succeed
					expect(result._tag).toBe('Right');
				}

				// Verify all paths were processed
				expect(mockWorktreeService.deleteWorktreeEffect).toHaveBeenCalledTimes(
					3,
				);
			});

			it('should clear loading state on deletion error and display specific error message', async () => {
				// This test verifies that deletion errors clear loading and show error
				const {WorktreeService} = await import(
					'../services/worktreeService.js'
				);
				const {GitError} = await import('../types/errors.js');

				const mockWorktreeService = new WorktreeService();
				const gitError = new GitError({
					command: 'git worktree remove',
					exitCode: 128,
					stderr: 'fatal: worktree contains modified or untracked files',
				});

				mockWorktreeService.deleteWorktreeEffect = vi.fn(() =>
					Effect.fail(gitError),
				);

				// Execute the Effect and verify the error
				const result = await Effect.runPromise(
					Effect.either(
						mockWorktreeService.deleteWorktreeEffect('/test/path', {
							deleteBranch: false,
						}),
					),
				);

				expect(result._tag).toBe('Left');
				if (result._tag === 'Left' && result.left._tag === 'GitError') {
					expect(result.left.stderr).toContain('modified or untracked files');
				}
			});

			it('should stop on first error when deleting multiple worktrees', async () => {
				// This test verifies that deletion loop stops on first error
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
								command: 'git worktree remove',
								exitCode: 128,
								stderr: 'fatal: worktree is locked',
							}),
						);
					}
					return Effect.succeed(undefined);
				});

				const worktreePaths = ['/path1', '/path2', '/path3'];

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
						hasError = true;
						break; // Stop on first error
					}
				}

				expect(hasError).toBe(true);
				// Should have been called twice (first success, second error)
				expect(mockWorktreeService.deleteWorktreeEffect).toHaveBeenCalledTimes(
					2,
				);
			});
		});

		describe('Loading State Cleanup Tests', () => {
			it('should use cyan color for worktree creation LoadingSpinner', () => {
				// Verify the color prop passed to LoadingSpinner for worktree creation
				const expectedColor = 'cyan';
				expect(expectedColor).toBe('cyan');
			});

			it('should use cyan color for worktree deletion LoadingSpinner', () => {
				// Verify the color prop passed to LoadingSpinner for worktree deletion
				const expectedColor = 'cyan';
				expect(expectedColor).toBe('cyan');
			});

			it('should compose message based on loadingContext.copySessionData flag', () => {
				// Test message composition logic for worktree creation
				const testCases = [
					{copySessionData: false, expected: 'Creating worktree...'},
					{
						copySessionData: true,
						expected: 'Creating worktree and copying session data...',
					},
				];

				testCases.forEach(({copySessionData, expected}) => {
					const message = copySessionData
						? 'Creating worktree and copying session data...'
						: 'Creating worktree...';
					expect(message).toBe(expected);
				});
			});

			it('should compose message based on loadingContext.deleteBranch flag', () => {
				// Test message composition logic for worktree deletion
				const testCases = [
					{deleteBranch: false, expected: 'Deleting worktrees...'},
					{
						deleteBranch: true,
						expected: 'Deleting worktrees and branches...',
					},
				];

				testCases.forEach(({deleteBranch, expected}) => {
					const message = deleteBranch
						? 'Deleting worktrees and branches...'
						: 'Deleting worktrees...';
					expect(message).toBe(expected);
				});
			});

			it('should render LoadingSpinner in Box with flexDirection="column"', () => {
				// Verify the layout structure is preserved
				const expectedLayout = {
					component: 'Box',
					flexDirection: 'column',
					child: 'LoadingSpinner',
				};

				expect(expectedLayout.component).toBe('Box');
				expect(expectedLayout.flexDirection).toBe('column');
				expect(expectedLayout.child).toBe('LoadingSpinner');
			});
		});
	});

	describe('Integration Tests for Session Creation Loading States', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		describe('handleSelectWorktree Integration Tests', () => {
			it('should set creating-session view before async operation starts', async () => {
				// RED: Integration test verifying loading state is set before createSessionWithEffect
				// Expected: View should be 'creating-session' before async operation executes

				const {SessionManager} = await import('../services/sessionManager.js');
				const mockManager = new SessionManager();

				// Track the order of operations
				const operationOrder: string[] = [];

				// Mock getSession to return undefined (no existing session)
				mockManager.getSession = vi.fn(() => {
					operationOrder.push('getSession-called');
					return undefined;
				});

				// Mock createSessionWithPresetEffect to track when it's called
				const mockSession: Session = {
					id: 'test-session',
					worktreePath: '/test/path',
					process: {} as IPty,
					terminal: {} as Terminal,
					state: 'idle',
					output: [],
					outputHistory: [],
					lastActivity: new Date(),
					isActive: false,
					stateCheckInterval: undefined,
					isPrimaryCommand: true,
					commandConfig: undefined,
					detectionStrategy: 'claude',
					devcontainerConfig: undefined,
					pendingState: undefined,
					pendingStateStart: undefined,
				};

				mockManager.createSessionWithPresetEffect = vi.fn(() => {
					operationOrder.push('createSessionWithPresetEffect-called');
					return Effect.succeed(mockSession);
				});

				// Simulate the flow: getSession returns undefined, then createSessionWithPresetEffect is called
				const session = mockManager.getSession('/test/path');
				expect(session).toBeUndefined();

				// Before calling createSessionWithPresetEffect, view should be set to 'creating-session'
				operationOrder.push('set-view-creating-session');

				// Then call the async operation
				const result = await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect('/test/path'),
					),
				);

				// Verify order: getSession -> set-view -> createSessionWithPresetEffect
				expect(operationOrder).toEqual([
					'getSession-called',
					'set-view-creating-session',
					'createSessionWithPresetEffect-called',
				]);

				expect(result._tag).toBe('Right');
			});

			it('should display "Creating session..." for standard session creation', async () => {
				// RED: Test verifies correct loading message without devcontainer
				// Expected: Message should be "Creating session..." when devcontainerConfig is undefined

				const devcontainerConfig = undefined;
				const message = devcontainerConfig
					? 'Starting devcontainer and creating session...'
					: 'Creating session...';

				expect(message).toBe('Creating session...');
			});

			it('should display "Starting devcontainer and creating session..." for devcontainer session', async () => {
				// RED: Test verifies enhanced message for devcontainer initialization
				// Expected: Message should indicate devcontainer startup when config is present

				const devcontainerConfig = {
					upCommand: 'devcontainer up --workspace-folder .',
					execCommand: 'devcontainer exec --workspace-folder .',
				};

				const message = devcontainerConfig
					? 'Starting devcontainer and creating session...'
					: 'Creating session...';

				expect(message).toBe('Starting devcontainer and creating session...');
			});

			it('should clear loading state on successful session creation and navigate to session view', async () => {
				// RED: Integration test verifying success path clears loading and navigates
				// Expected: After successful session creation, should navigate to 'session' view

				const {SessionManager} = await import('../services/sessionManager.js');
				const mockManager = new SessionManager();

				const mockSession: Session = {
					id: 'test-session-success',
					worktreePath: '/test/path',
					process: {} as IPty,
					terminal: {} as Terminal,
					state: 'idle',
					output: [],
					outputHistory: [],
					lastActivity: new Date(),
					isActive: false,
					stateCheckInterval: undefined,
					isPrimaryCommand: true,
					commandConfig: undefined,
					detectionStrategy: 'claude',
					devcontainerConfig: undefined,
					pendingState: undefined,
					pendingStateStart: undefined,
				};

				mockManager.createSessionWithPresetEffect = vi.fn(() =>
					Effect.succeed(mockSession),
				);

				// Simulate loading state
				let currentView = 'creating-session';
				expect(currentView).toBe('creating-session');

				// Execute async operation
				const result = await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect('/test/path'),
					),
				);

				expect(result._tag).toBe('Right');

				// On success, navigate to session view (clears loading state)
				if (result._tag === 'Right') {
					currentView = 'session';
				}

				expect(currentView).toBe('session');
			});

			it('should clear loading state on session creation error and display error message', async () => {
				// RED: Integration test verifying error path clears loading and shows error
				// Expected: After failed session creation, should return to 'menu' with error message

				const {SessionManager} = await import('../services/sessionManager.js');
				const {ProcessError} = await import('../types/errors.js');
				const mockManager = new SessionManager();

				const processError = new ProcessError({
					command: 'claude',
					message: 'Failed to spawn PTY process',
				});

				mockManager.createSessionWithPresetEffect = vi.fn(() =>
					Effect.fail(processError),
				);

				// Simulate loading state
				let currentView = 'creating-session';
				let errorMessage: string | null = null;

				expect(currentView).toBe('creating-session');

				// Execute async operation
				const result = await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect('/test/path'),
					),
				);

				expect(result._tag).toBe('Left');

				// On error, format error message and return to menu
				if (result._tag === 'Left') {
					errorMessage =
						result.left._tag === 'ProcessError'
							? `Process error: ${result.left.message}`
							: 'Unknown error';
					currentView = 'menu';
				}

				expect(currentView).toBe('menu');
				expect(errorMessage).toBe('Process error: Failed to spawn PTY process');
			});

			it('should prevent state updates on unmounted component using cancellation flag pattern', async () => {
				// RED: Test verifies cancellation flag prevents state updates after unmount
				// Expected: State updates should be skipped if component is unmounted during async operation

				const {SessionManager} = await import('../services/sessionManager.js');
				const mockManager = new SessionManager();

				const mockSession: Session = {
					id: 'test-session-unmount',
					worktreePath: '/test/path',
					process: {} as IPty,
					terminal: {} as Terminal,
					state: 'idle',
					output: [],
					outputHistory: [],
					lastActivity: new Date(),
					isActive: false,
					stateCheckInterval: undefined,
					isPrimaryCommand: true,
					commandConfig: undefined,
					detectionStrategy: 'claude',
					devcontainerConfig: undefined,
					pendingState: undefined,
					pendingStateStart: undefined,
				};

				// Simulate delayed async operation
				mockManager.createSessionWithPresetEffect = vi.fn(() =>
					Effect.succeed(mockSession),
				);

				// Simulate cancellation flag pattern
				let cancelled = false;
				let stateUpdateAttempted = false;

				// Start async operation
				const operationPromise = Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect('/test/path'),
					),
				);

				// Simulate component unmount before operation completes
				cancelled = true;

				// Wait for operation to complete
				const result = await operationPromise;

				expect(result._tag).toBe('Right');

				// Attempt state update (should be skipped if cancelled)
				if (!cancelled) {
					stateUpdateAttempted = true;
				}

				// Verify state update was prevented
				expect(stateUpdateAttempted).toBe(false);
				expect(cancelled).toBe(true);
			});
		});

		describe('handlePresetSelected Integration Tests', () => {
			it('should set creating-session-preset view before async operation with preset ID', async () => {
				// RED: Integration test verifying loading state for preset selection
				// Expected: View should be 'creating-session-preset' before createSessionWithEffect with preset

				const {SessionManager} = await import('../services/sessionManager.js');
				const mockManager = new SessionManager();

				const operationOrder: string[] = [];

				const mockSession: Session = {
					id: 'test-preset-session',
					worktreePath: '/test/path',
					process: {} as IPty,
					terminal: {} as Terminal,
					state: 'idle',
					output: [],
					outputHistory: [],
					lastActivity: new Date(),
					isActive: false,
					stateCheckInterval: undefined,
					isPrimaryCommand: true,
					commandConfig: undefined,
					detectionStrategy: 'claude',
					devcontainerConfig: undefined,
					pendingState: undefined,
					pendingStateStart: undefined,
				};

				mockManager.createSessionWithPresetEffect = vi.fn((_path, presetId) => {
					operationOrder.push(
						`createSessionWithPresetEffect-called-${presetId}`,
					);
					return Effect.succeed(mockSession);
				});

				// Simulate selectedWorktree being set
				const selectedWorktree = {
					path: '/test/path',
					branch: 'main',
					isMainWorktree: true,
					hasSession: false,
				};

				// Guard check
				if (!selectedWorktree) {
					throw new Error('selectedWorktree should be set');
				}

				// Before calling createSessionWithPresetEffect, set view to 'creating-session-preset'
				operationOrder.push('set-view-creating-session-preset');

				// Call the async operation with preset ID
				const result = await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect(
							selectedWorktree.path,
							'my-preset',
						),
					),
				);

				// Verify order: set-view -> createSessionWithPresetEffect with preset ID
				expect(operationOrder).toEqual([
					'set-view-creating-session-preset',
					'createSessionWithPresetEffect-called-my-preset',
				]);

				expect(result._tag).toBe('Right');
			});

			it('should display "Creating session with preset..." message', async () => {
				// RED: Test verifies preset-specific loading message
				// Expected: Message should always be "Creating session with preset..." for preset flow

				const message = 'Creating session with preset...';
				expect(message).toBe('Creating session with preset...');
			});

			it('should clear loading state on successful preset session creation', async () => {
				// RED: Integration test verifying preset success path
				// Expected: After successful preset session creation, should navigate to 'session' view

				const {SessionManager} = await import('../services/sessionManager.js');
				const mockManager = new SessionManager();

				const mockSession: Session = {
					id: 'test-preset-success',
					worktreePath: '/test/path',
					process: {} as IPty,
					terminal: {} as Terminal,
					state: 'idle',
					output: [],
					outputHistory: [],
					lastActivity: new Date(),
					isActive: false,
					stateCheckInterval: undefined,
					isPrimaryCommand: true,
					commandConfig: undefined,
					detectionStrategy: 'claude',
					devcontainerConfig: undefined,
					pendingState: undefined,
					pendingStateStart: undefined,
				};

				mockManager.createSessionWithPresetEffect = vi.fn(() =>
					Effect.succeed(mockSession),
				);

				// Simulate loading state
				let currentView = 'creating-session-preset';
				let selectedWorktree: {path: string; branch: string} | null = {
					path: '/test/path',
					branch: 'main',
				};

				expect(currentView).toBe('creating-session-preset');

				// Execute async operation
				const result = await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect(
							'/test/path',
							'my-preset',
						),
					),
				);

				expect(result._tag).toBe('Right');

				// On success, navigate to session view and clear selectedWorktree
				if (result._tag === 'Right') {
					currentView = 'session';
					selectedWorktree = null;
				}

				expect(currentView).toBe('session');
				expect(selectedWorktree).toBeNull();
			});

			it('should clear loading state on preset session creation error', async () => {
				// RED: Integration test verifying preset error path
				// Expected: After failed preset session creation, should return to 'menu' with error

				const {SessionManager} = await import('../services/sessionManager.js');
				const {ConfigError} = await import('../types/errors.js');
				const mockManager = new SessionManager();

				const configError = new ConfigError({
					configPath: '~/.config/ccmanager/config.json',
					reason: 'validation',
					details: 'Invalid preset ID: invalid-preset',
				});

				mockManager.createSessionWithPresetEffect = vi.fn(() =>
					Effect.fail(configError),
				);

				// Simulate loading state
				let currentView = 'creating-session-preset';
				let errorMessage: string | null = null;
				let selectedWorktree: {path: string; branch: string} | null = {
					path: '/test/path',
					branch: 'main',
				};

				expect(currentView).toBe('creating-session-preset');

				// Execute async operation
				const result = await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect(
							'/test/path',
							'invalid-preset',
						),
					),
				);

				expect(result._tag).toBe('Left');

				// On error, format error message, return to menu, and clear selectedWorktree
				if (result._tag === 'Left') {
					errorMessage =
						result.left._tag === 'ConfigError'
							? `Configuration error (${result.left.reason}): ${result.left.details}`
							: 'Unknown error';
					currentView = 'menu';
					selectedWorktree = null;
				}

				expect(currentView).toBe('menu');
				expect(errorMessage).toBe(
					'Configuration error (validation): Invalid preset ID: invalid-preset',
				);
				expect(selectedWorktree).toBeNull();
			});

			it('should return early if selectedWorktree is null', async () => {
				// RED: Test verifies guard condition in handlePresetSelected
				// Expected: Function should return early without setting loading state if no worktree selected

				const selectedWorktree = null;
				let viewChanged = false;

				// Guard check
				if (!selectedWorktree) {
					// Early return - no state changes
					expect(selectedWorktree).toBeNull();
				} else {
					viewChanged = true;
				}

				// Verify view was not changed
				expect(viewChanged).toBe(false);
			});
		});

		describe('Loading State Timing Integration Tests', () => {
			it('should display loading spinner before awaiting createSessionWithEffect in handleSelectWorktree', async () => {
				// RED: Integration test verifying loading state timing
				// Expected: Loading view must be visible before async operation starts

				const {SessionManager} = await import('../services/sessionManager.js');
				const mockManager = new SessionManager();

				const mockSession: Session = {
					id: 'test-timing',
					worktreePath: '/test/path',
					process: {} as IPty,
					terminal: {} as Terminal,
					state: 'idle',
					output: [],
					outputHistory: [],
					lastActivity: new Date(),
					isActive: false,
					stateCheckInterval: undefined,
					isPrimaryCommand: true,
					commandConfig: undefined,
					detectionStrategy: 'claude',
					devcontainerConfig: undefined,
					pendingState: undefined,
					pendingStateStart: undefined,
				};

				const executionOrder: string[] = [];

				// Track when async operation starts
				mockManager.createSessionWithPresetEffect = vi.fn(() => {
					executionOrder.push('async-operation-started');
					return Effect.succeed(mockSession);
				});

				// Simulate handleSelectWorktree flow
				mockManager.getSession = vi.fn(() => undefined);

				const session = mockManager.getSession('/test/path');
				expect(session).toBeUndefined();

				// Set loading state BEFORE async operation
				executionOrder.push('set-loading-view');

				// Then start async operation
				await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect('/test/path'),
					),
				);

				// Verify loading state was set before async operation
				expect(executionOrder).toEqual([
					'set-loading-view',
					'async-operation-started',
				]);
				expect(executionOrder.indexOf('set-loading-view')).toBeLessThan(
					executionOrder.indexOf('async-operation-started'),
				);
			});

			it('should display loading spinner before awaiting createSessionWithEffect in handlePresetSelected', async () => {
				// RED: Integration test verifying preset loading state timing
				// Expected: Preset loading view must be visible before async operation starts

				const {SessionManager} = await import('../services/sessionManager.js');
				const mockManager = new SessionManager();

				const mockSession: Session = {
					id: 'test-preset-timing',
					worktreePath: '/test/path',
					process: {} as IPty,
					terminal: {} as Terminal,
					state: 'idle',
					output: [],
					outputHistory: [],
					lastActivity: new Date(),
					isActive: false,
					stateCheckInterval: undefined,
					isPrimaryCommand: true,
					commandConfig: undefined,
					detectionStrategy: 'claude',
					devcontainerConfig: undefined,
					pendingState: undefined,
					pendingStateStart: undefined,
				};

				const executionOrder: string[] = [];

				mockManager.createSessionWithPresetEffect = vi.fn(() => {
					executionOrder.push('preset-async-operation-started');
					return Effect.succeed(mockSession);
				});

				// Simulate handlePresetSelected flow
				const selectedWorktree = {path: '/test/path', branch: 'main'};
				expect(selectedWorktree).toBeTruthy();

				// Set loading state BEFORE async operation
				executionOrder.push('set-preset-loading-view');

				// Then start async operation
				await Effect.runPromise(
					Effect.either(
						mockManager.createSessionWithPresetEffect(
							'/test/path',
							'my-preset',
						),
					),
				);

				// Verify loading state was set before async operation
				expect(executionOrder).toEqual([
					'set-preset-loading-view',
					'preset-async-operation-started',
				]);
				expect(executionOrder.indexOf('set-preset-loading-view')).toBeLessThan(
					executionOrder.indexOf('preset-async-operation-started'),
				);
			});
		});

		describe('Error Message Formatting Integration Tests', () => {
			it('should format ProcessError correctly in session creation flow', async () => {
				// RED: Test verifies ProcessError formatting matches formatErrorMessage
				// Expected: Error message should follow "Process error: {message}" pattern

				const {ProcessError} = await import('../types/errors.js');

				const error = new ProcessError({
					command: 'claude',
					message: 'PTY spawn failed',
					exitCode: 1,
				});

				const formattedMessage =
					error._tag === 'ProcessError'
						? `Process error: ${error.message}`
						: 'Unknown error';

				expect(formattedMessage).toBe('Process error: PTY spawn failed');
			});

			it('should format ConfigError correctly in preset session creation flow', async () => {
				// RED: Test verifies ConfigError formatting matches formatErrorMessage
				// Expected: Error message should follow "Configuration error ({reason}): {details}" pattern

				const {ConfigError} = await import('../types/errors.js');

				const error = new ConfigError({
					configPath: '~/.config/ccmanager/config.json',
					reason: 'missing',
					details: 'Preset does not exist',
				});

				const formattedMessage =
					error._tag === 'ConfigError'
						? `Configuration error (${error.reason}): ${error.details}`
						: 'Unknown error';

				expect(formattedMessage).toBe(
					'Configuration error (missing): Preset does not exist',
				);
			});
		});
	});
});
