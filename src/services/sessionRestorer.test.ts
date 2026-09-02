import {describe, it, expect, beforeEach, vi} from 'vitest';
import {Effect, Either} from 'effect';
import {mkdtempSync, mkdirSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import type {Session} from '../types/index.js';
import {ProcessError, ValidationError} from '../types/errors.js';
import type {SessionRecord} from './sessionRestoreStore.js';

const storedRecords: SessionRecord[] = [];
const forgetMock = vi.fn((...ids: string[]) => {
	for (const id of ids) {
		const index = storedRecords.findIndex(record => record.id === id);
		if (index !== -1) {
			storedRecords.splice(index, 1);
		}
	}
});

vi.mock('./sessionRestoreStore.js', () => ({
	sessionRestoreStore: {
		list: () => [...storedRecords],
		forget: (...ids: string[]) => forgetMock(...ids),
	},
}));

class MockSessionManager {
	createSessionWithPresetEffect = vi.fn(
		(_worktreePath: string, _presetId?: string) =>
			Effect.succeed({id: 'new-session'} as Session),
	);
	createSessionWithDevcontainerEffect = vi.fn(
		(_worktreePath: string, _devcontainerConfig: unknown, _presetId?: string) =>
			Effect.succeed({id: 'new-session'} as Session),
	);
	renameSession = vi.fn((_id: string, _name?: string) => {});
}

const managersByProject = new Map<string | undefined, MockSessionManager>();
const getManagerForProjectMock = vi.fn((projectPath?: string) => {
	let manager = managersByProject.get(projectPath);
	if (!manager) {
		manager = new MockSessionManager();
		managersByProject.set(projectPath, manager);
	}
	return manager;
});

vi.mock('./globalSessionOrchestrator.js', () => ({
	globalSessionOrchestrator: {
		getManagerForProject: (projectPath?: string) =>
			getManagerForProjectMock(projectPath),
	},
}));

vi.mock('./config/configReader.js', () => ({
	configReader: {
		getPresetByIdEffect: (id: string) =>
			id === 'preset-1'
				? Either.right({id: 'preset-1', name: 'Main'})
				: Either.left(
						new ValidationError({
							field: 'presetId',
							constraint: 'Preset not found',
							receivedValue: id,
						}),
					),
		getDefaultPreset: () => ({id: 'default', name: 'Default'}),
	},
}));

const {
	listRestorableSessions,
	restoreSessions,
	discardRestorableSessions,
	describeRecordPreset,
} = await import('./sessionRestorer.js');

describe('sessionRestorer', () => {
	let existingWorktree: string;

	const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
		id: 'session-1',
		projectPath: '/repo',
		worktreePath: existingWorktree,
		presetId: 'preset-1',
		// A process id that is not running, so the record counts as restorable.
		ownerPid: 999999,
		createdAt: 1,
		...overrides,
	});

	beforeEach(() => {
		const directory = mkdtempSync(path.join(tmpdir(), 'ccmanager-restore-'));
		existingWorktree = path.join(directory, 'feature');
		mkdirSync(existingWorktree);

		storedRecords.length = 0;
		forgetMock.mockClear();
		managersByProject.clear();
		getManagerForProjectMock.mockClear();
	});

	describe('listRestorableSessions', () => {
		it('offers a recorded session whose worktree still exists', () => {
			storedRecords.push(record());

			expect(listRestorableSessions().map(r => r.id)).toEqual(['session-1']);
		});

		it('skips a session whose worktree has been deleted', () => {
			storedRecords.push(record({worktreePath: '/gone/worktree'}));

			expect(listRestorableSessions()).toEqual([]);
		});

		it('skips a session still owned by a running ccmanager', () => {
			storedRecords.push(record({ownerPid: process.pid}));

			expect(listRestorableSessions()).toEqual([]);
		});

		it('only offers the requested project when a project path is given', () => {
			storedRecords.push(record({id: 'mine', projectPath: '/repo'}));
			storedRecords.push(record({id: 'other', projectPath: '/elsewhere'}));

			expect(
				listRestorableSessions({projectPath: '/repo'}).map(r => r.id),
			).toEqual(['mine']);
		});

		it('returns oldest first so sessions come back in the order they were opened', () => {
			storedRecords.push(record({id: 'second', createdAt: 20}));
			storedRecords.push(record({id: 'first', createdAt: 10}));

			expect(listRestorableSessions().map(r => r.id)).toEqual([
				'first',
				'second',
			]);
		});
	});

	describe('restoreSessions', () => {
		it('launches the recorded preset in the recorded worktree', async () => {
			const target = record();

			const outcome = await restoreSessions([target], {multiProject: false});

			const manager = managersByProject.get(undefined)!;
			expect(manager.createSessionWithPresetEffect).toHaveBeenCalledWith(
				existingWorktree,
				'preset-1',
			);
			expect(outcome).toEqual({restored: 1, failures: []});
		});

		it('drops the old record so the same session is not offered twice', async () => {
			storedRecords.push(record());

			await restoreSessions([record()], {multiProject: false});

			expect(forgetMock).toHaveBeenCalledWith('session-1');
			expect(storedRecords).toEqual([]);
		});

		it('restores the session name the user had given', async () => {
			await restoreSessions([record({sessionName: 'review'})], {
				multiProject: false,
			});

			const manager = managersByProject.get(undefined)!;
			expect(manager.renameSession).toHaveBeenCalledWith(
				'new-session',
				'review',
			);
		});

		it('uses the manager of the recorded project in multi-project mode', async () => {
			await restoreSessions([record()], {multiProject: true});

			expect(getManagerForProjectMock).toHaveBeenCalledWith('/repo');
		});

		it('relaunches through the devcontainer when the session used one', async () => {
			const devcontainerConfig = {
				upCommand: 'devcontainer up',
				execCommand: 'devcontainer exec',
			};

			await restoreSessions([record({devcontainerConfig})], {
				multiProject: false,
			});

			const manager = managersByProject.get(undefined)!;
			expect(manager.createSessionWithDevcontainerEffect).toHaveBeenCalledWith(
				existingWorktree,
				devcontainerConfig,
				'preset-1',
			);
		});

		it('reports a failed session and carries on with the rest', async () => {
			const failing = record({id: 'failing'});
			const succeeding = record({id: 'succeeding'});
			const manager = getManagerForProjectMock(undefined);
			manager.createSessionWithPresetEffect.mockImplementationOnce(
				() =>
					Effect.fail(
						new ProcessError({command: 'claude', message: 'spawn failed'}),
					) as unknown as ReturnType<
						MockSessionManager['createSessionWithPresetEffect']
					>,
			);

			const outcome = await restoreSessions([failing, succeeding], {
				multiProject: false,
			});

			expect(outcome.restored).toBe(1);
			expect(outcome.failures).toHaveLength(1);
			expect(outcome.failures[0]?.record.id).toBe('failing');
			expect(outcome.failures[0]?.message).toContain('spawn failed');
		});
	});

	it('describes a record by its current preset name, falling back to the default', () => {
		expect(describeRecordPreset(record())).toBe('Main');
		expect(describeRecordPreset(record({presetId: 'removed'}))).toBe('Default');
		expect(describeRecordPreset(record({presetId: undefined}))).toBe('Default');
	});

	it('forgets the sessions the user declined to restore', () => {
		storedRecords.push(record({id: 'a'}), record({id: 'b'}));

		discardRestorableSessions([record({id: 'a'}), record({id: 'b'})]);

		expect(forgetMock).toHaveBeenCalledWith('a', 'b');
		expect(storedRecords).toEqual([]);
	});
});
