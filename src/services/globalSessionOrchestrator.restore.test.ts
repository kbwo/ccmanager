import {describe, it, expect, beforeEach, vi} from 'vitest';
import {EventEmitter} from 'events';
import type {Session} from '../types/index.js';

const recordMock = vi.fn();
const forgetMock = vi.fn();
const renameMock = vi.fn();
const suspendTrackingMock = vi.fn();

vi.mock('./sessionRestoreStore.js', () => ({
	sessionRestoreStore: {
		record: (...args: unknown[]) => recordMock(...args),
		forget: (...args: unknown[]) => forgetMock(...args),
		rename: (...args: unknown[]) => renameMock(...args),
		suspendTracking: () => suspendTrackingMock(),
	},
}));

vi.mock('../utils/gitUtils.js', () => ({
	getCurrentRepositoryRoot: () => '/current/repo',
}));

class MockSessionManager extends EventEmitter {
	getAllSessions() {
		return [];
	}

	destroy() {}
}

vi.mock('./sessionManager.js', () => ({
	SessionManager: MockSessionManager,
}));

const {globalSessionOrchestrator} =
	await import('./globalSessionOrchestrator.js');

const session = (overrides: Partial<Session> = {}): Session =>
	({
		id: 'session-1',
		worktreePath: '/repo/worktrees/feature',
		presetId: 'preset-1',
		sessionName: undefined,
		devcontainerConfig: undefined,
		...overrides,
	}) as Session;

describe('GlobalSessionOrchestrator session record', () => {
	beforeEach(() => {
		recordMock.mockClear();
		forgetMock.mockClear();
		renameMock.mockClear();
		suspendTrackingMock.mockClear();
	});

	it('records a session of the current repository when there is no project path', () => {
		const manager = globalSessionOrchestrator.getManagerForProject();

		manager.emit('sessionCreated', session());

		expect(recordMock).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'session-1',
				projectPath: '/current/repo',
				worktreePath: '/repo/worktrees/feature',
				presetId: 'preset-1',
				ownerPid: process.pid,
			}),
		);
	});

	it('records a session under the project its manager belongs to', () => {
		const manager =
			globalSessionOrchestrator.getManagerForProject('/other/project');

		manager.emit('sessionCreated', session({id: 'session-2'}));

		expect(recordMock).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'session-2',
				projectPath: '/other/project',
			}),
		);
	});

	it('forgets a session that was killed or exited', () => {
		const manager = globalSessionOrchestrator.getManagerForProject();

		manager.emit('sessionDestroyed', session());

		expect(forgetMock).toHaveBeenCalledWith('session-1');
	});

	it('keeps the record in step with a rename', () => {
		const manager = globalSessionOrchestrator.getManagerForProject();

		manager.emit('sessionRenamed', session({sessionName: 'review'}));

		expect(renameMock).toHaveBeenCalledWith('session-1', 'review');
	});

	it('stops tracking before quitting, so the sessions stay restorable', () => {
		globalSessionOrchestrator.destroyAllSessions();

		expect(suspendTrackingMock).toHaveBeenCalled();
	});
});
