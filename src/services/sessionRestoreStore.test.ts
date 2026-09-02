import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {
	SessionRestoreStore,
	SESSION_RECORD_VERSION,
	type SessionRecord,
} from './sessionRestoreStore.js';

describe('SessionRestoreStore', () => {
	let directory: string;
	let filePath: string;
	let store: SessionRestoreStore;

	const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
		id: 'session-1',
		projectPath: '/repo',
		worktreePath: '/repo/worktrees/feature',
		presetId: 'preset-1',
		ownerPid: 1234,
		createdAt: 1,
		...overrides,
	});

	beforeEach(() => {
		directory = mkdtempSync(path.join(tmpdir(), 'ccmanager-records-'));
		filePath = path.join(directory, 'sessions.json');
		store = new SessionRestoreStore(filePath);
	});

	afterEach(() => {
		rmSync(directory, {recursive: true, force: true});
	});

	it('returns no sessions when nothing has been recorded yet', () => {
		expect(store.list()).toEqual([]);
	});

	it('writes each recorded session to disk immediately', () => {
		store.record(record());

		const contents = JSON.parse(readFileSync(filePath, 'utf-8'));
		expect(contents.version).toBe(SESSION_RECORD_VERSION);
		expect(contents.sessions).toHaveLength(1);
		expect(contents.sessions[0].worktreePath).toBe('/repo/worktrees/feature');
	});

	it('replaces an existing record with the same id instead of duplicating it', () => {
		store.record(record());
		store.record(record({presetId: 'preset-2'}));

		expect(store.list()).toHaveLength(1);
		expect(store.list()[0]?.presetId).toBe('preset-2');
	});

	it('forgets the requested sessions and keeps the others', () => {
		store.record(record({id: 'session-1'}));
		store.record(record({id: 'session-2'}));
		store.record(record({id: 'session-3'}));

		store.forget('session-1', 'session-3');

		expect(store.list().map(session => session.id)).toEqual(['session-2']);
	});

	it('keeps a renamed session name, and clears it when the name is removed', () => {
		store.record(record());

		store.rename('session-1', 'review');
		expect(store.list()[0]?.sessionName).toBe('review');

		store.rename('session-1', undefined);
		expect(store.list()[0]?.sessionName).toBeUndefined();
	});

	it('keeps records while tracking is suspended, so a shutdown does not erase them', () => {
		store.record(record());

		store.suspendTracking();
		store.forget('session-1');
		store.record(record({id: 'session-2'}));

		expect(store.list().map(session => session.id)).toEqual(['session-1']);

		store.resumeTracking();
		store.forget('session-1');
		expect(store.list()).toEqual([]);
	});

	it('picks up records another process wrote instead of overwriting them', () => {
		// Stands in for a second ccmanager writing to the shared file between
		// this store's own writes.
		store.record(record({id: 'session-1'}));
		const other = new SessionRestoreStore(filePath);
		other.record(record({id: 'other-session'}));

		store.record(record({id: 'session-2'}));

		expect(
			store
				.list()
				.map(session => session.id)
				.sort(),
		).toEqual(['other-session', 'session-1', 'session-2']);
	});

	it('ignores a corrupted file rather than failing', () => {
		writeFileSync(filePath, '{not json');

		expect(store.list()).toEqual([]);

		store.record(record());
		expect(store.list()).toHaveLength(1);
	});

	it('ignores entries that are missing the fields needed to launch them', () => {
		writeFileSync(
			filePath,
			JSON.stringify({
				version: SESSION_RECORD_VERSION,
				sessions: [record(), {id: 'broken'}],
			}),
		);

		expect(store.list().map(session => session.id)).toEqual(['session-1']);
	});
});
