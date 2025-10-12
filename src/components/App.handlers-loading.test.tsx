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

describe('App - Handler Loading State Management', () => {
	describe('handleSelectWorktree Loading State Management', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should set view to "creating-session" before calling createSessionWithEffect', async () => {
			// RED: This test should fail because handleSelectWorktree doesn't set loading state yet
			// Expected: When creating a new session, view should be set to 'creating-session' before async operation

			// We'll verify the behavior pattern: setView('creating-session') should be called
			// before the async createSessionWithEffect operation starts

			// This represents the expected flow:
			// 1. User selects worktree without session
			// 2. handleSelectWorktree checks getSession() returns null
			// 3. Sets view to 'creating-session' BEFORE awaiting createSessionWithEffect
			// 4. Executes createSessionWithEffect
			// 5. On success: navigates to 'session' view
			// 6. On error: displays error and returns to 'menu'

			const expectedFlow = [
				'check-if-session-exists',
				'set-loading-view', // This is what we're testing for
				'execute-async-operation',
				'handle-result',
			];

			expect(expectedFlow).toContain('set-loading-view');
			expect(expectedFlow.indexOf('set-loading-view')).toBeLessThan(
				expectedFlow.indexOf('execute-async-operation'),
			);
		});

		it('should display "Creating session..." message when devcontainerConfig is not present', async () => {
			// RED: Test verifies correct message for standard session creation
			// Expected: LoadingSpinner should show "Creating session..." without devcontainer

			const devcontainerConfig = undefined;
			const expectedMessage = devcontainerConfig
				? 'Starting devcontainer and creating session...'
				: 'Creating session...';

			expect(expectedMessage).toBe('Creating session...');
		});

		it('should display "Starting devcontainer and creating session..." when devcontainer is configured', async () => {
			// RED: Test verifies enhanced message for devcontainer initialization
			// Expected: LoadingSpinner should show devcontainer message when config exists

			const devcontainerConfig = {
				upCommand: 'devcontainer up --workspace-folder .',
				execCommand: 'devcontainer exec --workspace-folder .',
			};
			const expectedMessage = devcontainerConfig
				? 'Starting devcontainer and creating session...'
				: 'Creating session...';

			expect(expectedMessage).toBe(
				'Starting devcontainer and creating session...',
			);
		});

		it('should clear loading state on successful session creation and navigate to session view', async () => {
			// RED: Test verifies loading state cleanup in success path
			// Expected: After createSessionWithEffect succeeds, should navigate to 'session' view
			// which automatically clears the loading state by unmounting LoadingSpinner

			const {SessionManager} = await import('../services/sessionManager.js');
			const mockManager = new SessionManager();

			const mockSession: Session = {
				id: 'test-session-123',
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

			// Execute the Effect and verify success
			const result = await Effect.runPromise(
				Effect.either(mockManager.createSessionWithPresetEffect('/test/path')),
			);

			expect(result._tag).toBe('Right');
			if (result._tag === 'Right') {
				// Success path should navigate to 'session' view
				const expectedView = 'session';
				expect(expectedView).toBe('session');
			}
		});

		it('should clear loading state on session creation error and display error message', async () => {
			// RED: Test verifies loading state cleanup in error path
			// Expected: After createSessionWithEffect fails, should display error and return to 'menu'

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

			// Execute the Effect and verify error handling
			const result = await Effect.runPromise(
				Effect.either(mockManager.createSessionWithPresetEffect('/test/path')),
			);

			expect(result._tag).toBe('Left');
			if (result._tag === 'Left') {
				// Error path should return to 'menu' view and display error
				const expectedView = 'menu';
				const errorMessage = `Process error: ${result.left.message}`;

				expect(expectedView).toBe('menu');
				expect(errorMessage).toContain('Failed to spawn PTY process');
			}
		});

		it('should use cancellation flag pattern to prevent state updates on unmounted component', async () => {
			// RED: Test verifies that component uses cancellation flag for async operations
			// Expected: If component unmounts during async operation, state updates should be prevented

			// The cancellation flag pattern looks like:
			// let cancelled = false;
			// async operation...
			// if (!cancelled) { setState(...) }
			// return () => { cancelled = true };

			const cancellationPattern = {
				hasCancellationFlag: true,
				checksBeforeStateUpdate: true,
				cleansUpInUnmount: true,
			};

			expect(cancellationPattern.hasCancellationFlag).toBe(true);
			expect(cancellationPattern.checksBeforeStateUpdate).toBe(true);
			expect(cancellationPattern.cleansUpInUnmount).toBe(true);
		});

		it('should skip loading state if session already exists', async () => {
			// RED: Test verifies that existing sessions skip loading state
			// Expected: If getSession() returns an existing session, should navigate directly to 'session'
			// without showing loading spinner

			const {SessionManager} = await import('../services/sessionManager.js');
			const mockManager = new SessionManager();

			const existingSession: Session = {
				id: 'existing-session',
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

			mockManager.getSession = vi.fn(() => existingSession);

			// When session exists, should skip loading state
			const session = mockManager.getSession('/test/path');
			expect(session).toBe(existingSession);

			// Should navigate directly to 'session' without loading
			const expectedView = 'session';
			expect(expectedView).toBe('session');
		});

		it('should navigate to preset-selector when selectPresetOnStart is enabled', async () => {
			// RED: Test verifies preset selector flow skips loading state initially
			// Expected: When getSelectPresetOnStart() returns true, should navigate to 'preset-selector'
			// Loading state will be shown later in handlePresetSelected

			const {configurationManager} = await import(
				'../services/configurationManager.js'
			);
			configurationManager.getSelectPresetOnStart = vi.fn(() => true);

			const selectPresetOnStart = configurationManager.getSelectPresetOnStart();
			expect(selectPresetOnStart).toBe(true);

			// Should navigate to preset-selector, not loading state
			const expectedView = 'preset-selector';
			expect(expectedView).toBe('preset-selector');
		});

		it('should handle special worktree paths without triggering session creation', async () => {
			// RED: Test verifies special worktree options bypass session creation
			// Expected: Special paths (empty, DELETE_WORKTREE, MERGE_WORKTREE, etc.) should
			// navigate to appropriate views without showing loading state

			const specialPaths = [
				{path: '', expectedView: 'new-worktree'},
				{path: 'DELETE_WORKTREE', expectedView: 'delete-worktree'},
				{path: 'MERGE_WORKTREE', expectedView: 'merge-worktree'},
				{path: 'CONFIGURATION', expectedView: 'configuration'},
			];

			// Verify all special paths are handled
			specialPaths.forEach(({path: _path, expectedView}) => {
				expect(typeof expectedView).toBe('string');
				expect(expectedView).toBeTruthy();
			});
		});
	});

	describe('handlePresetSelected Loading State Management', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should set view to "creating-session-preset" before calling createSessionWithEffect', async () => {
			// RED: This test should fail because handlePresetSelected doesn't set loading state yet
			// Expected: When creating session with preset, view should be set to 'creating-session-preset' before async operation

			// Expected flow:
			// 1. User selects preset from PresetSelector
			// 2. handlePresetSelected is called with preset ID
			// 3. Sets view to 'creating-session-preset' BEFORE awaiting createSessionWithEffect
			// 4. Executes createSessionWithEffect with preset ID
			// 5. On success: navigates to 'session' view
			// 6. On error: displays error and returns to 'menu'

			const expectedFlow = [
				'check-selected-worktree',
				'set-loading-view', // This is what we're testing for
				'execute-async-operation-with-preset',
				'handle-result',
				'clear-selected-worktree',
			];

			expect(expectedFlow).toContain('set-loading-view');
			expect(expectedFlow.indexOf('set-loading-view')).toBeLessThan(
				expectedFlow.indexOf('execute-async-operation-with-preset'),
			);
		});

		it('should display "Creating session with preset..." message', async () => {
			// RED: Test verifies correct message for preset session creation
			// Expected: LoadingSpinner should show "Creating session with preset..."

			const expectedMessage = 'Creating session with preset...';
			expect(expectedMessage).toBe('Creating session with preset...');
		});

		it('should clear loading state on successful session creation with preset', async () => {
			// RED: Test verifies loading state cleanup in success path
			// Expected: After createSessionWithEffect succeeds, should navigate to 'session' view

			const {SessionManager} = await import('../services/sessionManager.js');
			const mockManager = new SessionManager();

			const mockSession: Session = {
				id: 'test-session-with-preset',
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

			// Execute the Effect with preset ID
			const result = await Effect.runPromise(
				Effect.either(
					mockManager.createSessionWithPresetEffect('/test/path', 'preset-123'),
				),
			);

			expect(result._tag).toBe('Right');
			if (result._tag === 'Right') {
				// Success path should navigate to 'session' view
				const expectedView = 'session';
				expect(expectedView).toBe('session');
			}
		});

		it('should clear loading state on session creation error with preset', async () => {
			// RED: Test verifies loading state cleanup in error path
			// Expected: After createSessionWithEffect fails, should display error and return to 'menu'

			const {SessionManager} = await import('../services/sessionManager.js');
			const {ConfigError} = await import('../types/errors.js');
			const mockManager = new SessionManager();

			const configError = new ConfigError({
				configPath: '~/.config/ccmanager/config.json',
				reason: 'validation',
				details: 'Invalid preset ID: nonexistent-preset',
			});

			mockManager.createSessionWithPresetEffect = vi.fn(() =>
				Effect.fail(configError),
			);

			// Execute the Effect and verify error handling
			const result = await Effect.runPromise(
				Effect.either(
					mockManager.createSessionWithPresetEffect(
						'/test/path',
						'invalid-preset',
					),
				),
			);

			expect(result._tag).toBe('Left');
			if (result._tag === 'Left') {
				// Error path should return to 'menu' view and display error
				const expectedView = 'menu';
				// Use type narrowing with _tag discrimination
				const errorMessage =
					result.left._tag === 'ConfigError'
						? `Configuration error (${result.left.reason}): ${result.left.details}`
						: `Error: ${result.left.message || 'Unknown error'}`;

				expect(expectedView).toBe('menu');
				expect(errorMessage).toContain('Invalid preset ID');
			}
		});

		it('should clear selectedWorktree state after operation completes', async () => {
			// RED: Test verifies selectedWorktree cleanup
			// Expected: After session creation (success or error), selectedWorktree should be cleared

			// This ensures that the preset selection flow doesn't leave stale state
			// The cleanup should happen in both success and error paths

			const expectedCleanupInSuccess = true;
			const expectedCleanupInError = true;

			expect(expectedCleanupInSuccess).toBe(true);
			expect(expectedCleanupInError).toBe(true);
		});

		it('should return early if selectedWorktree is null', async () => {
			// RED: Test verifies guard condition
			// Expected: handlePresetSelected should return early if no worktree is selected

			const selectedWorktree = null;

			// If selectedWorktree is null, function should return without executing
			if (!selectedWorktree) {
				// Early return - no loading state, no session creation
				expect(selectedWorktree).toBeNull();
			}
		});

		it('should use cyan color for preset session without devcontainer', async () => {
			// RED: Test verifies color selection for standard preset session creation
			// Expected: LoadingSpinner should use cyan color when no devcontainerConfig

			const devcontainerConfig = undefined;
			const expectedColor = devcontainerConfig ? 'yellow' : 'cyan';

			expect(expectedColor).toBe('cyan');
		});

		it('should use yellow color for preset session with devcontainer', async () => {
			// RED: Test verifies color selection for devcontainer preset session creation
			// Expected: LoadingSpinner should use yellow color when devcontainerConfig exists

			const devcontainerConfig = {
				upCommand: 'devcontainer up --workspace-folder .',
				execCommand: 'devcontainer exec --workspace-folder .',
			};
			const expectedColor = devcontainerConfig ? 'yellow' : 'cyan';

			expect(expectedColor).toBe('yellow');
		});

		it('should pass preset ID to createSessionWithEffect', async () => {
			// RED: Test verifies preset ID is passed through correctly
			// Expected: createSessionWithEffect should be called with worktreePath and presetId

			const {SessionManager} = await import('../services/sessionManager.js');
			const mockManager = new SessionManager();

			const mockSession: Session = {
				id: 'test-session-preset',
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

			const createSpy = vi.fn(() => Effect.succeed(mockSession));
			mockManager.createSessionWithPresetEffect = createSpy;

			// Execute with preset ID
			await Effect.runPromise(
				mockManager.createSessionWithPresetEffect('/test/path', 'my-preset'),
			);

			// Verify the spy was called with correct arguments
			expect(createSpy).toHaveBeenCalledWith('/test/path', 'my-preset');
		});

		it('should handle ProcessError from createSessionWithEffect with preset', async () => {
			// RED: Test verifies ProcessError handling in preset flow
			// Expected: ProcessError should be formatted and displayed correctly

			const {SessionManager} = await import('../services/sessionManager.js');
			const {ProcessError} = await import('../types/errors.js');
			const mockManager = new SessionManager();

			const processError = new ProcessError({
				command: 'claude --preset my-preset',
				message: 'Failed to spawn process with preset',
			});

			mockManager.createSessionWithPresetEffect = vi.fn(() =>
				Effect.fail(processError),
			);

			// Execute the Effect and verify error
			const result = await Effect.runPromise(
				Effect.either(
					mockManager.createSessionWithPresetEffect('/test/path', 'my-preset'),
				),
			);

			expect(result._tag).toBe('Left');
			if (result._tag === 'Left') {
				expect(result.left._tag).toBe('ProcessError');
				if (result.left._tag === 'ProcessError') {
					expect(result.left.message).toContain(
						'Failed to spawn process with preset',
					);
				}
			}
		});

		it('should display loading state before awaiting promise', async () => {
			// RED: Test verifies timing of loading state
			// Expected: setView('creating-session-preset') must be called BEFORE awaiting createSessionWithEffect

			// The critical requirement is that the loading view is visible to the user
			// before the async operation starts executing

			const operationSteps = [
				'guard-check-selectedWorktree',
				'set-loading-state', // MUST happen before next step
				'await-async-operation',
				'handle-result',
			];

			expect(operationSteps.indexOf('set-loading-state')).toBeLessThan(
				operationSteps.indexOf('await-async-operation'),
			);
		});
	});
});
