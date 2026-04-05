import React from 'react';
import {render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {EventEmitter} from 'events';
import type {Session as SessionType} from '../types/index.js';

const testState = vi.hoisted(() => ({
	stdout: null as MockStdout | null,
}));

class MockStdout extends EventEmitter {
	write = vi.fn();
}

vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useStdout: vi.fn(() => ({stdout: testState.stdout})),
	};
});

import Session from './Session.js';

describe('Session', () => {
	const originalColumns = process.stdout.columns;
	const originalRows = process.stdout.rows;
	const originalIsTTY = process.stdin.isTTY;

	beforeEach(() => {
		testState.stdout = new MockStdout();
		Object.defineProperty(process.stdout, 'columns', {
			value: 120,
			configurable: true,
		});
		Object.defineProperty(process.stdout, 'rows', {
			value: 40,
			configurable: true,
		});
		Object.defineProperty(process.stdin, 'isTTY', {
			value: false,
			configurable: true,
		});
	});

	afterEach(() => {
		testState.stdout = null;
		Object.defineProperty(process.stdout, 'columns', {
			value: originalColumns,
			configurable: true,
		});
		Object.defineProperty(process.stdout, 'rows', {
			value: originalRows,
			configurable: true,
		});
		Object.defineProperty(process.stdin, 'isTTY', {
			value: originalIsTTY,
			configurable: true,
		});
		vi.restoreAllMocks();
	});

	it('resizes before activating and writes restore snapshots verbatim', async () => {
		const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
		const processResize = vi.fn();
		const processWrite = vi.fn();
		const terminalResize = vi.fn();
		const setSessionActive = vi.fn((sessionId: string, active: boolean) => {
			if (sessionId === session.id && active) {
				for (const handler of listeners.get('sessionRestore') ?? []) {
					handler(session, '\nrestored');
				}
			}
		});
		const session = {
			id: 'session-1',
			process: {
				write: processWrite,
				resize: processResize,
			},
			terminal: {
				resize: terminalResize,
			},
			stateMutex: {
				getSnapshot: () => ({state: 'idle'}),
			},
		} as unknown as SessionType;

		const sessionManager = {
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				const handlers = listeners.get(event) ?? new Set();
				handlers.add(handler);
				listeners.set(event, handlers);
				return sessionManager;
			}),
			off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				listeners.get(event)?.delete(handler);
				return sessionManager;
			}),
			setSessionActive,
			cancelAutoApproval: vi.fn(),
		};

		render(
			<Session
				session={session}
				sessionManager={sessionManager as never}
				onReturnToMenu={vi.fn()}
			/>,
		);

		await new Promise(resolve => setTimeout(resolve, 0));

		expect(processResize).toHaveBeenCalledWith(120, 40);
		expect(terminalResize).toHaveBeenCalledWith(120, 40);
		expect(processResize.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
			setSessionActive.mock.invocationCallOrder[0] ?? 0,
		);
		expect(terminalResize.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
			setSessionActive.mock.invocationCallOrder[0] ?? 0,
		);
		expect(testState.stdout?.write).toHaveBeenNthCalledWith(3, '\nrestored');
	});
});
