/**
 * @fileoverview Turns the durable session record written by
 * {@link SessionRestoreStore} back into running sessions.
 *
 * Restoring a session means launching its command preset in its worktree
 * again — nothing of the previous run's terminal output or conversation is
 * brought back. An initial prompt, if the session was originally started with
 * one, is deliberately not replayed: it was a one-off instruction, not part of
 * the session's identity.
 */
import {existsSync} from 'fs';
import {Effect, Either} from 'effect';
import {globalSessionOrchestrator} from './globalSessionOrchestrator.js';
import {sessionRestoreStore, SessionRecord} from './sessionRestoreStore.js';
import {configReader} from './config/configReader.js';
import {formatErrorMessage} from '../utils/errorMessage.js';
import {logger} from '../utils/logger.js';

export interface RestoreFailure {
	record: SessionRecord;
	message: string;
}

export interface RestoreOutcome {
	restored: number;
	failures: RestoreFailure[];
}

/**
 * Whether a process with this id is currently running. Used to leave alone the
 * sessions of another ccmanager that is still open.
 *
 * A process id can be reused after a reboot, in which case an unrelated live
 * process makes a record look owned and its session is silently not offered.
 * That is the cheaper mistake: the opposite error would start a second copy of
 * a session that is already running in another ccmanager window.
 */
function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}

	try {
		// Signal 0 performs the permission and existence checks without
		// delivering a signal.
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process exists but belongs to another user.
		return (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as {code?: string}).code === 'EPERM'
		);
	}
}

/**
 * Recorded sessions that this ccmanager run may offer to launch again.
 *
 * @param options.projectPath - When given, only sessions of that repository are
 * returned (single-project mode). Omit it to consider every recorded project,
 * which is what multi-project mode does.
 */
export function listRestorableSessions(
	options: {projectPath?: string} = {},
): SessionRecord[] {
	return sessionRestoreStore
		.list()
		.filter(record => {
			if (options.projectPath && record.projectPath !== options.projectPath) {
				return false;
			}

			// The worktree may have been deleted while ccmanager was not running.
			if (!existsSync(record.worktreePath)) {
				logger.info(
					`Skipping session restore for missing worktree: ${record.worktreePath}`,
				);
				return false;
			}

			return !isProcessAlive(record.ownerPid);
		})
		.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Name of the command preset a record will be launched with, for display.
 * Resolved from the current configuration rather than stored alongside the
 * record, so a renamed preset shows its current name. Records whose preset no
 * longer exists fall back to the default preset, as launching does.
 */
export function describeRecordPreset(record: SessionRecord): string {
	const preset = record.presetId
		? Either.getOrElse(
				configReader.getPresetByIdEffect(record.presetId),
				() => undefined,
			)
		: undefined;

	return preset?.name ?? configReader.getDefaultPreset()?.name ?? 'default';
}

/**
 * Launch each recorded session again, in the session manager the running
 * ccmanager will look at for its project.
 *
 * Sessions are started one at a time: each one is numbered relative to the
 * sessions already present in its worktree, which only holds if they are not
 * created concurrently.
 *
 * Every record is dropped from the durable store as it is processed — a
 * successfully restored session records itself anew under its new id, and a
 * failed one must not keep being offered on every subsequent start.
 */
export async function restoreSessions(
	records: SessionRecord[],
	options: {multiProject: boolean},
): Promise<RestoreOutcome> {
	const failures: RestoreFailure[] = [];
	let restored = 0;

	for (const record of records) {
		sessionRestoreStore.forget(record.id);

		// Single-project mode keeps every session in the one global manager;
		// multi-project mode keeps a manager per project.
		const manager = globalSessionOrchestrator.getManagerForProject(
			options.multiProject ? record.projectPath : undefined,
		);

		const sessionEffect = record.devcontainerConfig
			? manager.createSessionWithDevcontainerEffect(
					record.worktreePath,
					record.devcontainerConfig,
					record.presetId,
				)
			: manager.createSessionWithPresetEffect(
					record.worktreePath,
					record.presetId,
				);

		const result = await Effect.runPromise(Effect.either(sessionEffect));

		if (result._tag === 'Left') {
			const message = formatErrorMessage(result.left);
			logger.error(
				`Failed to restore session in ${record.worktreePath}: ${message}`,
			);
			failures.push({record, message});
			continue;
		}

		if (record.sessionName) {
			manager.renameSession(result.right.id, record.sessionName);
		}

		restored++;
	}

	return {restored, failures};
}

/**
 * Forget the offered sessions without launching them, so declining the offer
 * does not make it come back on the next start.
 */
export function discardRestorableSessions(records: SessionRecord[]): void {
	sessionRestoreStore.forget(...records.map(record => record.id));
}
