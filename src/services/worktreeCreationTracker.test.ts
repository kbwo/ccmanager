import {describe, it, expect, vi} from 'vitest';
import {
	WorktreeCreationTracker,
	describeWorktreeCreationStage,
	type WorktreeCreationJob,
} from './worktreeCreationTracker.js';

const manualJob = {
	projectKey: '/repo',
	branch: 'feature',
	stage: 'creating',
	copySessionData: false,
	isPromptFlow: false,
} as const;

describe('WorktreeCreationTracker', () => {
	it('lists running jobs in start order and filters them by project', () => {
		const tracker = new WorktreeCreationTracker();
		const first = tracker.start(manualJob);
		const second = tracker.start({...manualJob, projectKey: '/other'});

		expect(tracker.getJobs().map(job => job.id)).toEqual([first, second]);
		expect(tracker.getJobs('/other').map(job => job.id)).toEqual([second]);
	});

	it('applies progress updates and emits changed', () => {
		const tracker = new WorktreeCreationTracker();
		const id = tracker.start({
			...manualJob,
			branch: undefined,
			stage: 'naming',
			isPromptFlow: true,
		});
		const onChanged = vi.fn();
		tracker.on('changed', onChanged);

		tracker.update(id, {branch: 'fix/generated', stage: 'creating'});

		expect(onChanged).toHaveBeenCalledTimes(1);
		expect(tracker.getJob(id)).toMatchObject({
			branch: 'fix/generated',
			stage: 'creating',
		});
	});

	it('removes a finished job and emits finished with it', () => {
		const tracker = new WorktreeCreationTracker();
		const id = tracker.start(manualJob);
		const onFinished = vi.fn<(job: WorktreeCreationJob) => void>();
		tracker.on('finished', onFinished);

		tracker.finish(id);

		expect(tracker.getJobs()).toEqual([]);
		expect(onFinished).toHaveBeenCalledWith({...manualJob, id});
	});

	it('ignores updates and finishes for unknown jobs', () => {
		const tracker = new WorktreeCreationTracker();
		const onChanged = vi.fn();
		tracker.on('changed', onChanged);

		tracker.update('missing', {stage: 'creating'});
		tracker.finish('missing');

		expect(onChanged).not.toHaveBeenCalled();
	});
});

describe('describeWorktreeCreationStage', () => {
	it.each([
		[
			{stage: 'naming', copySessionData: false, isPromptFlow: true},
			'Generating branch name with Claude...',
		],
		[
			{stage: 'creating', copySessionData: false, isPromptFlow: true},
			'Creating worktree from generated branch name...',
		],
		[
			{stage: 'creating', copySessionData: true, isPromptFlow: false},
			'Creating worktree and copying session data...',
		],
		[
			{stage: 'creating', copySessionData: false, isPromptFlow: false},
			'Creating worktree...',
		],
	] as const)('describes %o as %s', (job, message) => {
		expect(describeWorktreeCreationStage(job)).toBe(message);
	});
});
