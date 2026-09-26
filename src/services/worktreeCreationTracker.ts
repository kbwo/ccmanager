import {EventEmitter} from 'events';

/**
 * - `naming`: Claude is generating the branch name (prompt-first flow only)
 * - `creating`: the worktree itself is being created (git, file copies, hooks)
 */
export type WorktreeCreationStage = 'naming' | 'creating';

export interface WorktreeCreationJob {
	id: string;
	/** Identifies the project the worktree belongs to (its root path). */
	projectKey: string;
	/** Undefined while the branch name is still being generated. */
	branch?: string;
	stage: WorktreeCreationStage;
	copySessionData: boolean;
	isPromptFlow: boolean;
}

/**
 * Human-readable progress message for a creation job, shared by the waiting
 * screen and the menu's list of creations running in the background.
 */
export const describeWorktreeCreationStage = (
	job: Pick<WorktreeCreationJob, 'stage' | 'copySessionData' | 'isPromptFlow'>,
): string => {
	if (job.isPromptFlow) {
		return job.stage === 'naming'
			? 'Generating branch name with Claude...'
			: 'Creating worktree from generated branch name...';
	}
	return job.copySessionData
		? 'Creating worktree and copying session data...'
		: 'Creating worktree...';
};

/**
 * Keeps track of worktree creations that are still running, so a creation can
 * continue after the user leaves the waiting screen and the menu can show it.
 *
 * Emits `changed` whenever the set of jobs or a job's progress changes, and
 * `finished` (with the job) when a job ends, whatever its outcome.
 */
export class WorktreeCreationTracker extends EventEmitter {
	private jobs = new Map<string, WorktreeCreationJob>();
	private nextId = 1;

	start(job: Omit<WorktreeCreationJob, 'id'>): string {
		const id = `worktree-creation-${this.nextId++}`;
		this.jobs.set(id, {...job, id});
		this.emit('changed');
		return id;
	}

	update(
		id: string,
		patch: Partial<Pick<WorktreeCreationJob, 'branch' | 'stage'>>,
	): void {
		const job = this.jobs.get(id);
		if (!job) {
			return;
		}
		this.jobs.set(id, {...job, ...patch});
		this.emit('changed');
	}

	finish(id: string): void {
		const job = this.jobs.get(id);
		if (!job) {
			return;
		}
		this.jobs.delete(id);
		this.emit('changed');
		this.emit('finished', job);
	}

	getJob(id: string): WorktreeCreationJob | undefined {
		return this.jobs.get(id);
	}

	/** Running jobs in start order, optionally limited to one project. */
	getJobs(projectKey?: string): WorktreeCreationJob[] {
		const jobs = [...this.jobs.values()];
		return projectKey === undefined
			? jobs
			: jobs.filter(job => job.projectKey === projectKey);
	}
}

export const worktreeCreationTracker = new WorktreeCreationTracker();
