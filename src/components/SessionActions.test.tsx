import React from 'react';
import {render} from 'ink-testing-library';
import {useInput} from 'ink';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import SessionActions from './SessionActions.js';

const makeKey = (
	overrides: Record<string, boolean> = {},
): Record<string, boolean> => ({
	upArrow: false,
	downArrow: false,
	leftArrow: false,
	rightArrow: false,
	pageDown: false,
	pageUp: false,
	home: false,
	end: false,
	return: false,
	escape: false,
	ctrl: false,
	shift: false,
	tab: false,
	backspace: false,
	delete: false,
	meta: false,
	...overrides,
});

// Mock ink to avoid stdin issues and to capture the hotkey handler
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn(),
	};
});

// Mock SelectInput to render items as simple text
vi.mock('ink-select-input', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text, Box} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({items}: {items: Array<{label: string; value: string}>}) =>
			React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item: {label: string}, index: number) =>
					React.createElement(Text, {key: index}, item.label),
				),
			),
	};
});

const getLastInputHandler = () => {
	const calls = vi.mocked(useInput).mock.calls;
	const handler = calls[calls.length - 1]?.[0];
	expect(handler).toBeDefined();
	return handler!;
};

describe('SessionActions', () => {
	beforeEach(() => {
		vi.mocked(useInput).mockClear();
	});

	it('should show session actions and the delete entry for a deletable worktree', () => {
		const {lastFrame} = render(
			<SessionActions
				sessionLabel="Session #1"
				worktreePath="/repo/worktrees/feature"
				hasSession
				canDeleteWorktree
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);

		const frame = lastFrame();
		expect(frame).toContain('Session Actions');
		expect(frame).toContain('New session in this worktree');
		expect(frame).toContain('Rename this session');
		expect(frame).toContain('Close session');
		expect(frame).toContain('Delete this worktree');
	});

	it('should hide session-specific actions for a worktree without a session', () => {
		const {lastFrame} = render(
			<SessionActions
				worktreePath="/repo/worktrees/feature"
				hasSession={false}
				canDeleteWorktree
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);

		const frame = lastFrame();
		expect(frame).toContain('Worktree Actions');
		expect(frame).toContain('New session in this worktree');
		expect(frame).toContain('Delete this worktree');
		expect(frame).not.toContain('Rename this session');
		expect(frame).not.toContain('Close session');
	});

	it('should hide the delete entry when the worktree cannot be deleted', () => {
		const {lastFrame} = render(
			<SessionActions
				sessionLabel="Session #1"
				worktreePath="/repo"
				hasSession
				canDeleteWorktree={false}
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);

		expect(lastFrame()).not.toContain('Delete this worktree');
	});

	it('should dispatch deleteWorktree on the D hotkey when deletion is offered', () => {
		const onSelect = vi.fn();
		render(
			<SessionActions
				worktreePath="/repo/worktrees/feature"
				hasSession={false}
				canDeleteWorktree
				onSelect={onSelect}
				onCancel={vi.fn()}
			/>,
		);

		getLastInputHandler()('d', makeKey() as never);

		expect(onSelect).toHaveBeenCalledWith('deleteWorktree');
	});

	it('should ignore hotkeys of actions that are not offered', () => {
		const onSelect = vi.fn();
		render(
			<SessionActions
				sessionLabel="Session #1"
				worktreePath="/repo"
				hasSession
				canDeleteWorktree={false}
				onSelect={onSelect}
				onCancel={vi.fn()}
			/>,
		);

		const handler = getLastInputHandler();
		handler('d', makeKey() as never);
		expect(onSelect).not.toHaveBeenCalled();

		handler('x', makeKey() as never);
		expect(onSelect).toHaveBeenCalledWith('kill');
	});

	it('should cancel on Escape', () => {
		const onCancel = vi.fn();
		render(
			<SessionActions
				sessionLabel="Session #1"
				worktreePath="/repo"
				hasSession
				canDeleteWorktree
				onSelect={vi.fn()}
				onCancel={onCancel}
			/>,
		);

		getLastInputHandler()('', makeKey({escape: true}) as never);

		expect(onCancel).toHaveBeenCalled();
	});
});
