import {describe, it, expect, beforeEach, afterEach, vi, Mock} from 'vitest';
import {EventEmitter} from 'events';
import {spawn, IPty} from 'node-pty';
import {
	STATE_CHECK_INTERVAL_MS,
	STATE_PERSISTENCE_DURATION_MS,
} from '../constants/statePersistence.js';
import {Effect} from 'effect';

const detectStateMock = vi.fn();
const verifyNeedsPermissionMock = vi.fn(() => Effect.succeed(false));

vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));

vi.mock('./stateDetector.js', () => ({
	createStateDetector: () => ({detectState: detectStateMock}),
}));

vi.mock('./configurationManager.js', () => ({
	configurationManager: {
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
		getPresetById: vi.fn().mockReturnValue({
			id: 'test',
			name: 'Test',
			command: 'test',
			args: [],
		}),
		getDefaultPreset: vi.fn().mockReturnValue({
			id: 'test',
			name: 'Test',
			command: 'test',
			args: [],
		}),
		getHooks: vi.fn().mockReturnValue({}),
		getStatusHooks: vi.fn().mockReturnValue({}),
		setWorktreeLastOpened: vi.fn(),
		getWorktreeLastOpenedTime: vi.fn(),
		getWorktreeLastOpened: vi.fn(() => ({})),
		isAutoApprovalEnabled: vi.fn(() => true),
		setAutoApprovalEnabled: vi.fn(),
	},
}));

vi.mock('@xterm/headless', () => ({
	default: {
		Terminal: vi.fn().mockImplementation(() => ({
			buffer: {
				active: {
					length: 0,
					getLine: vi.fn(),
				},
			},
			write: vi.fn(),
		})),
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

		// Detection sequence: first prompt (no auto-approval), back to busy, second prompt (should auto-approve)
		const detectionStates = [
			'waiting_input',
			'waiting_input',
			'waiting_input',
			'busy',
			'busy',
			'busy',
			'waiting_input',
			'waiting_input',
			'waiting_input',
		] as const;
		let callIndex = 0;
		detectStateMock.mockImplementation(() => {
			const state =
				detectionStates[Math.min(callIndex, detectionStates.length - 1)];
			callIndex++;
			return state;
		});

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
		session.autoApprovalFailed = true;

		// First waiting_input cycle (auto-approval suppressed)
		vi.advanceTimersByTime(STATE_CHECK_INTERVAL_MS * 3);
		expect(session.state).toBe('waiting_input');
		expect(session.autoApprovalFailed).toBe(true);

		// Transition back to busy should reset the failure flag
		vi.advanceTimersByTime(STATE_CHECK_INTERVAL_MS * 3);
		expect(session.state).toBe('busy');
		expect(session.autoApprovalFailed).toBe(false);

		// Next waiting_input should trigger pending_auto_approval
		vi.advanceTimersByTime(
			STATE_CHECK_INTERVAL_MS * 3 + STATE_PERSISTENCE_DURATION_MS,
		);
		expect(session.state).toBe('pending_auto_approval');

		await Promise.resolve(); // allow handleAutoApproval promise to resolve
		expect(verifyNeedsPermissionMock).toHaveBeenCalled();
	});
});
