import {existsSync} from 'node:fs';
import {fileURLToPath, URL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {
	fetchWorktreeStatuses,
	type WorktreeStatusResult,
} from './gitStatusFetch.js';
import type {
	WorkerRequest,
	WorkerResponse,
} from '../workers/gitStatusWorker.js';
import {logger} from './logger.js';

interface Pending {
	paths: string[];
	resolve: (results: WorktreeStatusResult[]) => void;
}

// `bun build --compile` embeds the worker as a separate entry point (see
// scripts/build-binaries.ts) under the bundle root, where it can only be
// addressed by this relative specifier, not by a file URL.
const BUNDLED_WORKER_SPECIFIER = './workers/gitStatusWorker.ts';

let worker: Worker | null = null;
let workerUnavailable = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function resolveWorkerSpecifier(): string | null {
	if (import.meta.url.includes('/$bunfs/')) {
		return BUNDLED_WORKER_SPECIFIER;
	}
	const file = fileURLToPath(
		new URL('../workers/gitStatusWorker.js', import.meta.url),
	);
	// Absent when running from TypeScript sources (e.g. under Vitest).
	return existsSync(file) ? file : null;
}

function getWorker(): Worker | null {
	if (worker || workerUnavailable) {
		return worker;
	}
	const specifier = resolveWorkerSpecifier();
	if (!specifier) {
		workerUnavailable = true;
		return null;
	}
	try {
		const created = new Worker(specifier);
		created.unref();
		created.on('message', (response: WorkerResponse) => {
			const entry = pending.get(response.id);
			if (entry) {
				pending.delete(response.id);
				entry.resolve(response.results);
			}
		});
		created.on('error', error => {
			logger.warn(
				`git status worker failed, falling back to the main thread: ${String(error)}`,
			);
			abandonWorker();
		});
		created.on('exit', () => abandonWorker());
		worker = created;
	} catch (error) {
		logger.warn(`git status worker could not start: ${String(error)}`);
		workerUnavailable = true;
	}
	return worker;
}

/**
 * Stop using the worker and re-run whatever it had not answered yet on this
 * thread, so a worker that dies never leaves a poll cycle hanging.
 */
function abandonWorker(): void {
	worker = null;
	workerUnavailable = true;
	const stranded = [...pending.values()];
	pending.clear();
	for (const entry of stranded) {
		fetchWorktreeStatuses(entry.paths).then(entry.resolve, () =>
			entry.resolve([]),
		);
	}
}

/**
 * Fetch git status for the given worktree paths, off the calling thread when a
 * worker is available. Aborting resolves with no results.
 */
export function fetchGitStatuses(
	paths: string[],
	signal: AbortSignal,
): Promise<WorktreeStatusResult[]> {
	const activeWorker = getWorker();
	if (!activeWorker) {
		return fetchWorktreeStatuses(paths, signal).catch(() => []);
	}

	const id = nextId++;
	return new Promise<WorktreeStatusResult[]>(resolve => {
		pending.set(id, {paths, resolve});
		signal.addEventListener(
			'abort',
			() => {
				if (pending.delete(id)) {
					const cancel: WorkerRequest = {type: 'cancel', id};
					worker?.postMessage(cancel);
					resolve([]);
				}
			},
			{once: true},
		);
		const request: WorkerRequest = {type: 'fetch', id, paths};
		activeWorker.postMessage(request);
	});
}
