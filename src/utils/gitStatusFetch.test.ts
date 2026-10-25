import {deserialize, serialize} from 'node:v8';
import {describe, it, expect, vi} from 'vitest';
import {Effect} from 'effect';
import {fetchWorktreeStatuses} from './gitStatusFetch.js';
import {getGitStatusLimited} from './gitStatus.js';
import {GitError} from '../types/errors.js';

vi.mock('./gitStatus.js', () => ({
	getGitStatusLimited: vi.fn(),
}));

describe('fetchWorktreeStatuses', () => {
	const mockStatus = getGitStatusLimited as ReturnType<typeof vi.fn>;
	const status = {
		filesAdded: 1,
		filesDeleted: 2,
		aheadCount: 0,
		behindCount: 0,
		parentBranch: 'main',
	};

	it('returns plain, cloneable data for a successful fetch', async () => {
		mockStatus.mockReturnValue(Effect.succeed(status));

		const [result] = await fetchWorktreeStatuses(['/wt']);

		expect(result).toEqual({
			path: '/wt',
			status: {ok: true, value: status},
		});
		expect(deserialize(serialize(result))).toEqual(result);
	});

	it('formats a git failure', async () => {
		mockStatus.mockReturnValue(
			Effect.fail(
				new GitError({command: 'git diff', exitCode: 128, stderr: 'fatal: x'}),
			),
		);

		const [result] = await fetchWorktreeStatuses(['/wt']);

		expect(result).toEqual({
			path: '/wt',
			status: {
				ok: false,
				error: 'git command "git diff" failed (exit code 128): fatal: x',
			},
		});
	});

	it('reports an interrupted fetch as having no error to show', async () => {
		mockStatus.mockReturnValue(Effect.interrupt);

		const [result] = await fetchWorktreeStatuses(['/wt']);

		expect(result?.status).toEqual({ok: false, error: null});
	});
});
