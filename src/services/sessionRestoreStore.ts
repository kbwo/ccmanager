/**
 * @fileoverview Durable record of the sessions ccmanager currently has open,
 * so that a later ccmanager run can offer to start them again.
 *
 * Only what is needed to launch the same command again is stored (which
 * worktree, which command preset, the user-assigned session name). The
 * terminal output and the conversation held inside the launched CLI are
 * deliberately not stored: restoring means "run the launch command in that
 * worktree again", not "bring back what was on screen".
 *
 * Every mutation is written to disk immediately and synchronously rather than
 * on shutdown, so a crash, a `kill -9`, or a closed terminal still leaves an
 * accurate record behind.
 *
 * Each mutation also re-reads the file before rewriting it. Two ccmanager
 * processes share this one file, and a read-modify-write keeps one process's
 * write from discarding sessions the other process recorded in the meantime.
 */
import path from 'path';
import {existsSync, readFileSync, renameSync, writeFileSync} from 'fs';
import {DevcontainerConfig} from '../types/index.js';
import {ensureConfigDir} from '../utils/configDir.js';
import {logger} from '../utils/logger.js';

/** Format version of the on-disk file, so future changes can be detected. */
export const SESSION_RECORD_VERSION = 1;

export const SESSION_RECORD_FILE_NAME = 'sessions.json';

/** A single session, described well enough to launch it again. */
export interface SessionRecord {
	/** Id of the in-memory session this record was written for. */
	id: string;
	/**
	 * Git repository root the session belongs to. Used to only offer sessions
	 * of the repository the user is actually opening.
	 */
	projectPath: string;
	worktreePath: string;
	/**
	 * Id of the command preset the session was launched with. Absent when the
	 * preset could not be determined; the default preset is then used on
	 * restore. Only the id is stored — the command itself stays owned by the
	 * preset configuration.
	 */
	presetId?: string;
	/** User-assigned session name, if the user renamed the session. */
	sessionName?: string;
	/** Devcontainer commands the session was launched through, if any. */
	devcontainerConfig?: DevcontainerConfig;
	/**
	 * Process id of the ccmanager run that owns this session. A record whose
	 * owner process is still running belongs to another live ccmanager and must
	 * not be restored, or the same session would end up running twice.
	 */
	ownerPid: number;
	createdAt: number;
}

interface SessionRecordFile {
	version: number;
	sessions: SessionRecord[];
}

export class SessionRestoreStore {
	private explicitFilePath?: string;
	/**
	 * While true, mutations are ignored. Set just before ccmanager tears its
	 * sessions down on exit: those sessions are exactly the ones the next run
	 * should offer to restore, so their records must survive the teardown.
	 */
	private trackingSuspended = false;

	constructor(filePath?: string) {
		this.explicitFilePath = filePath;
	}

	/**
	 * Resolved lazily rather than in the constructor so that merely importing
	 * this module does not create the configuration directory.
	 */
	private get filePath(): string {
		return (
			this.explicitFilePath ??
			path.join(ensureConfigDir(), SESSION_RECORD_FILE_NAME)
		);
	}

	/** All recorded sessions, including ones owned by other ccmanager runs. */
	list(): SessionRecord[] {
		return this.read();
	}

	/** Add a session to the record, replacing any earlier record with the same id. */
	record(session: SessionRecord): void {
		if (this.trackingSuspended) {
			return;
		}

		this.write([...this.read().filter(s => s.id !== session.id), session]);
	}

	/**
	 * Drop sessions from the record, so they are not offered on the next run.
	 * Called when a session ends for a reason that means it should stay ended:
	 * the user killed it, or the launched command exited by itself.
	 */
	forget(...ids: string[]): void {
		if (this.trackingSuspended || ids.length === 0) {
			return;
		}

		const dropped = new Set(ids);
		const remaining = this.read().filter(session => !dropped.has(session.id));
		this.write(remaining);
	}

	/**
	 * Keep a renamed session's name in the record. An absent name means the
	 * user cleared it.
	 */
	rename(id: string, sessionName?: string): void {
		if (this.trackingSuspended) {
			return;
		}

		const sessions = this.read();
		const target = sessions.find(session => session.id === id);
		if (!target) {
			return;
		}

		target.sessionName = sessionName;
		this.write(sessions);
	}

	/**
	 * Stop applying further mutations. Used when ccmanager is shutting down and
	 * destroys its sessions: without this the teardown would erase precisely the
	 * records the next run needs.
	 */
	suspendTracking(): void {
		this.trackingSuspended = true;
	}

	/** Resume applying mutations. Counterpart of {@link suspendTracking}. */
	resumeTracking(): void {
		this.trackingSuspended = false;
	}

	isTrackingSuspended(): boolean {
		return this.trackingSuspended;
	}

	private read(): SessionRecord[] {
		if (!existsSync(this.filePath)) {
			return [];
		}

		try {
			const parsed = JSON.parse(
				readFileSync(this.filePath, 'utf-8'),
			) as Partial<SessionRecordFile>;

			if (!Array.isArray(parsed.sessions)) {
				return [];
			}

			return parsed.sessions.filter(
				session =>
					typeof session?.id === 'string' &&
					typeof session?.projectPath === 'string' &&
					typeof session?.worktreePath === 'string',
			);
		} catch (error) {
			// A truncated or hand-edited file must not stop ccmanager from
			// starting; the worst outcome of ignoring it is no restore offer.
			logger.warn(
				`Failed to read session records from ${this.filePath}: ${String(error)}`,
			);
			return [];
		}
	}

	private write(sessions: SessionRecord[]): void {
		const contents: SessionRecordFile = {
			version: SESSION_RECORD_VERSION,
			sessions,
		};

		try {
			// Write to a sibling file and rename over the target: a crash midway
			// through then leaves the previous complete file rather than a
			// half-written one.
			const tempPath = `${this.filePath}.${process.pid}.tmp`;
			writeFileSync(tempPath, JSON.stringify(contents, null, 2));
			renameSync(tempPath, this.filePath);
		} catch (error) {
			logger.warn(
				`Failed to write session records to ${this.filePath}: ${String(error)}`,
			);
		}
	}
}

export const sessionRestoreStore = new SessionRestoreStore();
