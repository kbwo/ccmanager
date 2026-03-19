import {describe, it, expect, beforeEach, afterEach, vi, Mock} from 'vitest';
import {EventEmitter} from 'events';
import {spawn, type IPty} from './bunTerminal.js';
import {
	STATE_PERSISTENCE_DURATION_MS,
	STATE_MINIMUM_DURATION_MS,
} from '../constants/statePersistence.js';
import {Effect, Either} from 'effect';

const detectStateMock = vi.fn();
// Create a deferred promise pattern for controllable mock
let verifyResolve:
	| ((result: {needsPermission: boolean; reason?: string}) => void)
	| null = null;
const verifyNeedsPermissionMock = vi.fn(() =>
	Effect.promise(
		() =>
			new Promise<{needsPermission: boolean; reason?: string}>(resolve => {
				verifyResolve = resolve;
			}),
	),
);

vi.mock('./bunTerminal.js', () => ({
	spawn: vi.fn(function () {
		return null;
	}),
}));

vi.mock('./stateDetector/index.js', () => ({
	createStateDetector: () => ({
		detectState: detectStateMock,
		detectBackgroundTask: () => false,
		detectTeamMembers: () => 0,
	}),
}));

vi.mock('./config/configReader.js', () => ({
	configReader: {
		getConfig: vi.fn().mockReturnValue({
			commands: [
				{
					id: 'test',
					name: 'Test',
					command: 'test',
					args: [],
				},
			],
			defaultCommandId: 'test',
		}),
		getPresetByIdEffect: vi.fn().mockReturnValue(
			Either.right({
				id: 'test',
				name: 'Test',
				command: 'test',
				args: [],
			}),
		),
		getDefaultPreset: vi.fn().mockReturnValue({
			id: 'test',
			name: 'Test',
			command: 'test',
			args: [],
		}),
		getHooks: vi.fn().mockReturnValue({}),
		getStatusHooks: vi.fn().mockReturnValue({}),
		isAutoApprovalEnabled: vi.fn(() => true),
		setAutoApprovalEnabled: vi.fn(),
	},
}));

vi.mock('@xterm/headless', () => ({
	default: {
		Terminal: vi.fn().mockImplementation(function () {
			return {
				buffer: {
					active: {
						length: 0,
						getLine: vi.fn(),
					},
				},
				write: vi.fn(),
			};
		}),
	},
}));

vi.mock('./autoApprovalVerifier.js', () => ({
	autoApprovalVerifier: {verifyNeedsPermission: verifyNeedsPermissionMock},
}));

interface MockPty {
	onData: Mock;
	onExit: Mock;
	write: Mock;
	resize: Mock;
	kill: Mock;
	process: string;
	pid: number;
}

describe('SessionManager - Auto Approval Recovery', () => {
	let SessionManager: typeof import('./sessionManager.js').SessionManager;
	let sessionManager: import('./sessionManager.js').SessionManager;
	let mockPtyInstances: Map<string, MockPty>;
	let eventEmitters: Map<string, EventEmitter>;

	beforeEach(async () => {
		vi.useFakeTimers();
		detectStateMock.mockReset();
		verifyNeedsPermissionMock.mockClear();
		verifyResolve = null;
		mockPtyInstances = new Map();
		eventEmitters = new Map();

		(spawn as Mock).mockImplementation(
			(_command: string, _args: string[], options: {cwd: string}) => {
				const path = options.cwd;
				const eventEmitter = new EventEmitter();
				eventEmitters.set(path, eventEmitter);

				const mockPty: MockPty = {
					onData: vi.fn((callback: (data: string) => void) => {
						eventEmitter.on('data', callback);
						return {dispose: vi.fn()};
					}),
					onExit: vi.fn((callback: (code: number) => void) => {
						eventEmitter.on('exit', callback);
						return {dispose: vi.fn()};
					}),
					write: vi.fn(),
					resize: vi.fn(),
					kill: vi.fn(),
					process: 'test',
					pid: 12345 + mockPtyInstances.size,
				};

				mockPtyInstances.set(path, mockPty);
				return mockPty as unknown as IPty;
			},
		);

		// Start with waiting_input; tests will change the mock return value between phases
		detectStateMock.mockReturnValue('waiting_input');

		const sessionManagerModule = await import('./sessionManager.js');
		SessionManager = sessionManagerModule.SessionManager;
		sessionManager = new SessionManager();
	});

	afterEach(() => {
		sessionManager.destroy();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('re-enables auto approval after leaving waiting_input', async () => {
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);

		// Simulate a prior auto-approval failure
		await session.stateMutex.update(data => ({
			...data,
			autoApprovalFailed: true,
		}));

		// Phase 1: waiting_input (auto-approval suppressed due to prior failure)
		detectStateMock.mockReturnValue('waiting_input');
		await vi.advanceTimersByTimeAsync(
			STATE_MINIMUM_DURATION_MS + STATE_PERSISTENCE_DURATION_MS,
		);
		expect(session.stateMutex.getSnapshot().state).toBe('waiting_input');
		expect(session.stateMutex.getSnapshot().autoApprovalFailed).toBe(true);

		// Phase 2: busy - should reset the failure flag
		detectStateMock.mockReturnValue('busy');
		await vi.advanceTimersByTimeAsync(
			STATE_MINIMUM_DURATION_MS + STATE_PERSISTENCE_DURATION_MS,
		);
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(session.stateMutex.getSnapshot().autoApprovalFailed).toBe(false);

		// Phase 3: waiting_input again - should trigger pending_auto_approval
		detectStateMock.mockReturnValue('waiting_input');
		await vi.advanceTimersByTimeAsync(
			STATE_MINIMUM_DURATION_MS + STATE_PERSISTENCE_DURATION_MS,
		);
		// State should now be pending_auto_approval (waiting for verification)
		expect(session.stateMutex.getSnapshot().state).toBe(
			'pending_auto_approval',
		);
		expect(verifyNeedsPermissionMock).toHaveBeenCalled();

		// Resolve the verification (needsPermission: false means auto-approve)
		expect(verifyResolve).not.toBeNull();
		verifyResolve!({needsPermission: false});
		await Promise.resolve(); // allow handleAutoApproval promise to resolve
	});

	it('cancels auto approval when user input is detected', async () => {
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);

		const abortController = new AbortController();
		await session.stateMutex.update(data => ({
			...data,
			state: 'pending_auto_approval',
			autoApprovalAbortController: abortController,
			pendingState: 'pending_auto_approval',
			pendingStateStart: Date.now(),
		}));

		const handler = vi.fn();
		sessionManager.on('sessionStateChanged', handler);

		sessionManager.cancelAutoApproval(session.id, 'User pressed a key');

		// Wait for async mutex update to complete (use vi.waitFor for proper async handling)
		await vi.waitFor(() => {
			const stateData = session.stateMutex.getSnapshot();
			expect(stateData.autoApprovalAbortController).toBeUndefined();
		});

		const stateData = session.stateMutex.getSnapshot();
		expect(abortController.signal.aborted).toBe(true);
		expect(stateData.autoApprovalAbortController).toBeUndefined();
		expect(stateData.autoApprovalFailed).toBe(true);
		expect(stateData.state).toBe('waiting_input');
		expect(stateData.pendingState).toBeUndefined();
		expect(handler).toHaveBeenCalledWith(session);

		sessionManager.off('sessionStateChanged', handler);
	});

	it('forces state to busy after auto-approval to prevent endless loop', async () => {
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);

		const mockPty = mockPtyInstances.get('/test/path');
		expect(mockPty).toBeDefined();

		const handler = vi.fn();
		sessionManager.on('sessionStateChanged', handler);

		// Phase 1: waiting_input → pending_auto_approval
		detectStateMock.mockReturnValue('waiting_input');
		await vi.advanceTimersByTimeAsync(
			STATE_MINIMUM_DURATION_MS + STATE_PERSISTENCE_DURATION_MS,
		);
		// State should be pending_auto_approval (waiting for verification)
		expect(session.stateMutex.getSnapshot().state).toBe(
			'pending_auto_approval',
		);
		expect(verifyNeedsPermissionMock).toHaveBeenCalled();

		// Resolve the verification (needsPermission: false means auto-approve)
		expect(verifyResolve).not.toBeNull();
		verifyResolve!({needsPermission: false});

		// Wait for handleAutoApproval promise chain to fully resolve
		await vi.waitFor(() => {
			expect(session.stateMutex.getSnapshot().state).toBe('busy');
		});
		expect(session.stateMutex.getSnapshot().pendingState).toBeUndefined();
		expect(session.stateMutex.getSnapshot().pendingStateStart).toBeUndefined();

		// Verify Enter key was sent to approve
		expect(mockPty!.write).toHaveBeenCalledWith('\r');

		// Verify sessionStateChanged was emitted with session containing state=busy
		const lastCall = handler.mock.calls[handler.mock.calls.length - 1];
		expect(lastCall).toBeDefined();
		expect(lastCall![0].stateMutex.getSnapshot().state).toBe('busy');

		sessionManager.off('sessionStateChanged', handler);
	});
});
