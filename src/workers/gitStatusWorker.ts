import {parentPort} from 'node:worker_threads';
import {worktreeConfigManager} from '../services/worktreeConfigManager.js';
import {
	fetchWorktreeStatuses,
	type WorktreeStatusResult,
} from '../utils/gitStatusFetch.js';

/**
 * Runs git status polling off the UI thread. Starting a git subprocess blocks
 * the thread that starts it, and one poll cycle starts hundreds of them, so
 * doing it on the thread that renders the menu froze keyboard navigation.
 */

export type WorkerRequest =
	{type: 'fetch'; id: number; paths: string[]} | {type: 'cancel'; id: number};

export interface WorkerResponse {
	id: number;
	results: WorktreeStatusResult[];
}

// A worker has its own module instances, so the singleton cli.tsx initializes on
// the main thread is still uninitialized here, and every fetch would throw.
worktreeConfigManager.initialize();

const controllers = new Map<number, AbortController>();

parentPort?.on('message', (request: WorkerRequest) => {
	if (request.type === 'cancel') {
		controllers.get(request.id)?.abort();
		return;
	}

	const controller = new AbortController();
	controllers.set(request.id, controller);
	fetchWorktreeStatuses(request.paths, controller.signal)
		.then(results => {
			const response: WorkerResponse = {id: request.id, results};
			parentPort?.postMessage(response);
		})
		.catch(() => {
			// Interrupted or failed as a whole: the caller treats an empty result
			// as "nothing to update" and retries next cycle.
			const response: WorkerResponse = {id: request.id, results: []};
			parentPort?.postMessage(response);
		})
		.finally(() => controllers.delete(request.id));
});
