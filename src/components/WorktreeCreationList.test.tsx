import React from 'react';
import {performance} from 'perf_hooks';
import {render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import WorktreeCreationList, {formatElapsed} from './WorktreeCreationList.js';
import type {WorktreeCreationJob} from '../services/worktreeCreationTracker.js';

const NOW = new Date('2026-09-26T12:00:00Z').getTime();

const job = (overrides: Partial<WorktreeCreationJob>): WorktreeCreationJob => ({
	id: 'job-1',
	projectKey: '/repo',
	branch: 'feature/x',
	stage: 'creating',
	copySessionData: false,
	isPromptFlow: false,
	startedAt: NOW,
	...overrides,
});

describe('formatElapsed', () => {
	it.each([
		[0, '0s'],
		[12_900, '12s'],
		[65_000, '1m 05s'],
		[-500, '0s'],
	])('formats %i ms as %s', (elapsedMs, expected) => {
		expect(formatElapsed(elapsedMs)).toBe(expected);
	});
});

describe('WorktreeCreationList', () => {
	beforeEach(() => {
		// Fake only the clock and the list's ticker. React applies re-renders on
		// later event-loop turns, which must keep running on real timers.
		vi.useFakeTimers({toFake: ['Date', 'setInterval', 'clearInterval']});
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('shows each creation with its progress and elapsed time', () => {
		const {lastFrame} = render(
			<WorktreeCreationList
				jobs={[
					job({startedAt: NOW - 65_000}),
					job({
						id: 'job-2',
						branch: undefined,
						stage: 'naming',
						isPromptFlow: true,
					}),
				]}
			/>,
		);

		expect(lastFrame()).toContain('Creating worktrees in the background:');
		expect(lastFrame()).toContain('feature/x: Creating worktree... (1m 05s)');
		expect(lastFrame()).toContain(
			'(branch name pending): Generating branch name with Claude... (0s)',
		);
	});

	it('refreshes the elapsed time once a second', async () => {
		const {lastFrame} = render(<WorktreeCreationList jobs={[job({})]} />);
		expect(lastFrame()).toContain('(0s)');

		vi.advanceTimersByTime(1000);

		// Date is faked, so bound the wait with the real performance clock.
		const deadline = performance.now() + 2000;
		while (!lastFrame()?.includes('(1s)') && performance.now() < deadline) {
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		expect(lastFrame()).toContain('(1s)');
	});
});
