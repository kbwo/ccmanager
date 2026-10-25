import {deserialize, serialize} from 'node:v8';
import {describe, it, expect, vi} from 'vitest';
import {Effect} from 'effect';
import {fetchWorktreeStatuses} from './gitStatusFetch.js';
import {getGitStatusLimited, getLastCommitDateLimited} from './gitStatus.js';
import {GitError} from '../types/errors.js';

vi.mock('./gitStatus.js', () => ({
	getGitStatusLimited: vi.fn(),
	getLastCommitDateLimited: vi.fn(),
}));

describe('fetchWorktreeStatuses', () => {
	const mockStatus = getGitStatusLimited as ReturnType<typeof vi.fn>;
	const mockDate = getLastCommitDateLimited as ReturnType<typeof vi.fn>;
	const status = {
		filesAdded: 1,
		filesDeleted: 2,
		aheadCount: 0,
		behindCount: 0,
		parentBranch: 'main',
	};

	it('returns plain, cloneable data for a successful fetch', async () => {
		mockStatus.mockReturnValue(Effect.succeed(status));
		mockDate.mockReturnValue(Effect.succeed(new Date('2026-01-02T03:04:05Z')));

		const [result] = await fetchWorktreeStatuses(['/wt']);

		expect(result).toEqual({
			path: '/wt',
			status: {ok: true, value: status},
			lastCommitDate: '2026-01-02T03:04:05.000Z',
		});
		expect(deserialize(serialize(result))).toEqual(result);
	});

	it('formats a git failure and drops a failed commit date', async () => {
		mockStatus.mockReturnValue(
			Effect.fail(
				new GitError({command: 'git diff', exitCode: 128, stderr: 'fatal: x'}),
			),
		);
		mockDate.mockReturnValue(
			Effect.fail(
				new GitError({command: 'git log', exitCode: 128, stderr: ''}),
			),
		);

		const [result] = await fetchWorktreeStatuses(['/wt']);

		expect(result).toEqual({
			path: '/wt',
			status: {
				ok: false,
				error: 'git command "git diff" failed (exit code 128): fatal: x',
			},
			lastCommitDate: null,
		});
	});

	it('reports an interrupted fetch as having no error to show', async () => {
		mockStatus.mockReturnValue(Effect.interrupt);
		mockDate.mockReturnValue(Effect.interrupt);

		const [result] = await fetchWorktreeStatuses(['/wt']);

		expect(result?.status).toEqual({ok: false, error: null});
		expect(result?.lastCommitDate).toBeNull();
	});
});
