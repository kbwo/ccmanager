import {describe, it, expect, beforeEach, vi, afterEach, Mock} from 'vitest';
import {Either} from 'effect';
import {SessionManager} from './sessionManager.js';
import {spawn, type IPty} from './bunTerminal.js';
import {EventEmitter} from 'events';
import {IDLE_DEBOUNCE_MS} from './stateDetector/claude.js';

/** Must match `STATE_CHECK_INTERVAL_MS` in sessionManager.ts */
const STATE_CHECK_INTERVAL_MS = 100;

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
		isAutoApprovalEnabled: vi.fn(() => false),
		setAutoApprovalEnabled: vi.fn(),
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

describe('SessionManager - state detection', () => {
	let sessionManager: SessionManager;
	let mockPtyInstances: Map<string, MockPty>;
	let eventEmitters: Map<string, EventEmitter>;

	beforeEach(() => {
		vi.useFakeTimers();
		sessionManager = new SessionManager();
		mockPtyInstances = new Map();
		eventEmitters = new Map();

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

	it('transitions busy to idle after idle debounce and the next poll', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		expect(session.stateMutex.getSnapshot().state).toBe('busy');

		eventEmitter.emit('data', 'Some output without busy indicators');

		await vi.advanceTimersByTimeAsync(
			IDLE_DEBOUNCE_MS + STATE_CHECK_INTERVAL_MS,
		);

		expect(session.stateMutex.getSnapshot().state).toBe('idle');
	});

	it('transitions busy to waiting_input on the next poll without idle debounce', async () => {
		const {Effect} = await import('effect');
		const session = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path'),
		);
		const eventEmitter = eventEmitters.get('/test/path')!;

		eventEmitter.emit('data', 'Do you want to continue?\n❯ 1. Yes');

		await vi.advanceTimersByTimeAsync(STATE_CHECK_INTERVAL_MS);

		expect(session.stateMutex.getSnapshot().state).toBe('waiting_input');
	});

	it('handles multiple sessions independently', async () => {
		const {Effect} = await import('effect');
		const session1 = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path1'),
		);
		const session2 = await Effect.runPromise(
			sessionManager.createSessionWithPresetEffect('/test/path2'),
		);
		const eventEmitter1 = eventEmitters.get('/test/path1')!;
		const eventEmitter2 = eventEmitters.get('/test/path2')!;

		expect(session1.stateMutex.getSnapshot().state).toBe('busy');
		expect(session2.stateMutex.getSnapshot().state).toBe('busy');

		eventEmitter1.emit('data', 'Idle output for session 1');
		eventEmitter2.emit('data', 'Do you want to continue?\n❯ 1. Yes');

		await vi.advanceTimersByTimeAsync(
			IDLE_DEBOUNCE_MS + STATE_CHECK_INTERVAL_MS,
		);

		expect(session1.stateMutex.getSnapshot().state).toBe('idle');
		expect(session2.stateMutex.getSnapshot().state).toBe('waiting_input');
	});
});
