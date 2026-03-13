import {describe, it, expect, beforeEach, vi, afterEach, Mock} from 'vitest';
import {Either} from 'effect';
import {SessionManager} from './sessionManager.js';
import {spawn, type IPty} from './bunTerminal.js';
import {EventEmitter} from 'events';
import {
	STATE_PERSISTENCE_DURATION_MS,
	STATE_CHECK_INTERVAL_MS,
	STATE_MINIMUM_DURATION_MS,
} from '../constants/statePersistence.js';

vi.mock('./bunTerminal.js', () => ({
	spawn: vi.fn(function () {
		return null;
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
		setWorktreeLastOpened: vi.fn(),
		getWorktreeLastOpenedTime: vi.fn(),
		getWorktreeLastOpened: vi.fn(() => ({})),
		isAutoApprovalEnabled: vi.fn(() => false),
		setAutoApprovalEnabled: vi.fn(),
		isClearHistoryOnClearEnabled: vi.fn(() => false),
	},
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

describe('SessionManager - State Persistence', () => {
	let sessionManager: SessionManager;
	let mockPtyInstances: Map<string, MockPty>;
	let eventEmitters: Map<string, EventEmitter>;

	beforeEach(() => {
		vi.useFakeTimers();
		sessionManager = new SessionManager();
		mockPtyInstances = new Map();
		eventEmitters = new Map();

		// Create mock PTY process factory
		(spawn as Mock).mockImplementation(
			(command: string, args: string[], options: {cwd: string}) => {
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
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('should not change state immediately when detected state changes', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Simulate output that would trigger idle state
		eventEmitter.emit('data', 'Some output without busy indicators');

		// Advance time less than persistence duration (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS * 2);

		// State should still be busy, but pending state should be set
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(session.stateMutex.getSnapshot().pendingState).toBe('idle');
		expect(session.stateMutex.getSnapshot().pendingStateStart).toBeDefined();
	});

	it('should change state after both persistence and minimum duration are met', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		const stateChangeHandler = vi.fn();
		sessionManager.on('sessionStateChanged', stateChangeHandler);

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Simulate output that would trigger idle state
		eventEmitter.emit('data', 'Some output without busy indicators');

		// Advance time less than persistence duration (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS * 2);
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(stateChangeHandler).not.toHaveBeenCalled();

		// Advance time past both persistence and minimum duration
		await vi.advanceTimersByTimeAsync(STATE_MINIMUM_DURATION_MS);

		// State should now be changed
		expect(session.stateMutex.getSnapshot().state).toBe('idle');
		expect(session.stateMutex.getSnapshot().pendingState).toBeUndefined();
		expect(session.stateMutex.getSnapshot().pendingStateStart).toBeUndefined();
		expect(stateChangeHandler).toHaveBeenCalledWith(session);
	});

	it('should cancel pending state if detected state changes again before persistence', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Simulate output that would trigger idle state
		eventEmitter.emit('data', 'Some output without busy indicators');

		// Advance time less than persistence duration (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS * 2);
		expect(session.stateMutex.getSnapshot().pendingState).toBe('idle');

		// Simulate output that would trigger waiting_input state
		eventEmitter.emit('data', 'Do you want to continue?\n❯ 1. Yes');

		// Advance time to trigger another check (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS);

		// Pending state should now be waiting_input, not idle
		expect(session.stateMutex.getSnapshot().state).toBe('busy'); // Still original state
		expect(session.stateMutex.getSnapshot().pendingState).toBe('waiting_input');
	});

	it('should clear pending state if detected state returns to current state', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Simulate output that would trigger idle state
		eventEmitter.emit('data', 'Some output without busy indicators');

		// Advance time less than persistence duration (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS * 2);
		expect(session.stateMutex.getSnapshot().pendingState).toBe('idle');
		expect(session.stateMutex.getSnapshot().pendingStateStart).toBeDefined();

		// Simulate output that would trigger busy state again (back to original)
		eventEmitter.emit('data', 'ESC to interrupt');

		// Advance time to trigger another check (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS);

		// Pending state should be cleared
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(session.stateMutex.getSnapshot().pendingState).toBeUndefined();
		expect(session.stateMutex.getSnapshot().pendingStateStart).toBeUndefined();
	});

	it('should not confirm state changes that do not persist long enough', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		const stateChangeHandler = vi.fn();
		sessionManager.on('sessionStateChanged', stateChangeHandler);

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Try to change to idle
		eventEmitter.emit('data', 'Some idle output\n');

		// Wait for detection but not full persistence (less than 200ms) (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS); // 100ms

		// Should have pending state but not confirmed
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(session.stateMutex.getSnapshot().pendingState).toBe('idle');

		// Now change to a different state before idle persists
		// Clear terminal first and add waiting prompt
		eventEmitter.emit(
			'data',
			'\x1b[2J\x1b[HDo you want to continue?\n❯ 1. Yes',
		);

		// Advance time to detect new state but still less than persistence duration from first change (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS); // Another 100ms, total 200ms exactly at threshold

		// Pending state should have changed to waiting_input
		expect(session.stateMutex.getSnapshot().state).toBe('busy'); // Still original state
		expect(session.stateMutex.getSnapshot().pendingState).toBe('waiting_input');

		// Since states kept changing before persisting, no state change should have been confirmed
		expect(stateChangeHandler).not.toHaveBeenCalled();
	});

	it('should properly clean up pending state when session is destroyed', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		// Simulate output that would trigger idle state
		eventEmitter.emit('data', 'Some output without busy indicators');

		// Advance time less than persistence duration (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS * 2);
		expect(session.stateMutex.getSnapshot().pendingState).toBe('idle');
		expect(session.stateMutex.getSnapshot().pendingStateStart).toBeDefined();

		// Destroy the session
		sessionManager.destroySession('/test/path');

		// Check that pending state is cleared
		const destroyedSession = sessionManager.getSession('/test/path');
		expect(destroyedSession).toBeUndefined();
	});

	it('should not transition state before minimum duration in current state has elapsed', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		const stateChangeHandler = vi.fn();
		sessionManager.on('sessionStateChanged', stateChangeHandler);

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Simulate output that would trigger idle state
		eventEmitter.emit('data', 'Some output without busy indicators');

		// Advance time enough for persistence duration but less than minimum duration
		// STATE_PERSISTENCE_DURATION_MS (200ms) < STATE_MINIMUM_DURATION_MS (500ms)
		await vi.advanceTimersByTimeAsync(
			STATE_PERSISTENCE_DURATION_MS + STATE_CHECK_INTERVAL_MS * 2,
		);

		// State should still be busy because minimum duration hasn't elapsed
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(stateChangeHandler).not.toHaveBeenCalled();
	});

	it('should transition state after both persistence and minimum duration are met', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		const stateChangeHandler = vi.fn();
		sessionManager.on('sessionStateChanged', stateChangeHandler);

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Simulate output that would trigger idle state
		eventEmitter.emit('data', 'Some output without busy indicators');

		// Advance time past STATE_MINIMUM_DURATION_MS (which is longer than STATE_PERSISTENCE_DURATION_MS)
		await vi.advanceTimersByTimeAsync(
			STATE_MINIMUM_DURATION_MS + STATE_CHECK_INTERVAL_MS,
		);

		// State should now be idle since both durations are satisfied
		expect(session.stateMutex.getSnapshot().state).toBe('idle');
		expect(stateChangeHandler).toHaveBeenCalledWith(session);
	});

	it('should not transition during brief screen redraw even after long time in current state', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		const stateChangeHandler = vi.fn();
		sessionManager.on('sessionStateChanged', stateChangeHandler);

		// Initial state should be busy
		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Keep busy state active for a long time (simulating normal operation)
		// Each check re-detects "busy" and updates stateConfirmedAt
		eventEmitter.emit('data', 'ESC to interrupt');
		await vi.advanceTimersByTimeAsync(2000); // 2 seconds of confirmed busy

		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		// Now simulate a brief screen redraw: busy indicators disappear temporarily
		eventEmitter.emit('data', '\x1b[2J\x1b[H'); // Clear screen
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS); // 100ms

		// Pending state should be set to idle
		expect(session.stateMutex.getSnapshot().pendingState).toBe('idle');

		// Advance past persistence duration (200ms) but NOT past minimum duration (500ms)
		// Since stateConfirmedAt was updated at ~2000ms, and now is ~2200ms,
		// timeInCurrentState = ~200ms which is < 500ms
		await vi.advanceTimersByTimeAsync(STATE_PERSISTENCE_DURATION_MS);

		// State should still be busy because minimum duration since last busy detection hasn't elapsed
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(stateChangeHandler).not.toHaveBeenCalled();

		// Simulate busy indicators coming back (screen redraw complete)
		eventEmitter.emit('data', 'ESC to interrupt');
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS);

		// State should still be busy and pending should be cleared
		expect(session.stateMutex.getSnapshot().state).toBe('busy');
		expect(session.stateMutex.getSnapshot().pendingState).toBeUndefined();
		expect(stateChangeHandler).not.toHaveBeenCalled();
	});

	it('should handle multiple sessions with independent state persistence', async () => {
		const {Effect} = await import('effect');
		const session1 = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path1'),
		);
		const session2 = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path2'),
		);
		const eventEmitter1 = eventEmitters.get('/test/path1')!;
		const eventEmitter2 = eventEmitters.get('/test/path2')!;

		// Both should start as busy
		expect(session1.stateMutex.getSnapshot().state).toBe('busy');
		expect(session2.stateMutex.getSnapshot().state).toBe('busy');

		// Simulate different outputs for each session
		// Session 1 goes to idle
		eventEmitter1.emit('data', 'Idle output for session 1');

		// Session 2 goes to waiting_input
		eventEmitter2.emit('data', 'Do you want to continue?\n❯ 1. Yes');

		// Advance time to check but not confirm (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS * 2);

		// Both should have pending states but not changed yet
		expect(session1.stateMutex.getSnapshot().state).toBe('busy');
		expect(session1.stateMutex.getSnapshot().pendingState).toBe('idle');
		expect(session2.stateMutex.getSnapshot().state).toBe('busy');
		expect(session2.stateMutex.getSnapshot().pendingState).toBe(
			'waiting_input',
		);

		// Advance time to confirm both - need to exceed STATE_MINIMUM_DURATION_MS (use async to process mutex updates)
		await vi.advanceTimersByTimeAsync(STATE_MINIMUM_DURATION_MS);

		// Both should now be in their new states
		expect(session1.stateMutex.getSnapshot().state).toBe('idle');
		expect(session1.stateMutex.getSnapshot().pendingState).toBeUndefined();
		expect(session2.stateMutex.getSnapshot().state).toBe('waiting_input');
		expect(session2.stateMutex.getSnapshot().pendingState).toBeUndefined();
	});
});
