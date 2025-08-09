import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ConfigureWorktreeHooks from './ConfigureWorktreeHooks.js';
import {configurationManager} from '../services/configurationManager.js';

// Mock ink to avoid stdin issues
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
		default: ({items}: {items: Array<{label: string; value: string}>}) => {
			return React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item: {label: string}, index: number) =>
					React.createElement(Text, {key: index}, item.label),
				),
			);
		},
	};
});

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getWorktreeHooks: vi.fn(),
		setWorktreeHooks: vi.fn(),
	},
}));

const mockedConfigurationManager = configurationManager as unknown as {
	getWorktreeHooks: ReturnType<typeof vi.fn>;
	setWorktreeHooks: ReturnType<typeof vi.fn>;
};

describe('ConfigureWorktreeHooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should render worktree hooks configuration screen', () => {
		mockedConfigurationManager.getWorktreeHooks.mockReturnValue({});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigureWorktreeHooks onComplete={onComplete} />,
		);

		expect(lastFrame()).toContain('Configure Worktree Hooks');
		expect(lastFrame()).toContain('Set commands to run on worktree events');
		expect(lastFrame()).toContain('Post Creation:');
	});

	it('should display configured hooks', () => {
		mockedConfigurationManager.getWorktreeHooks.mockReturnValue({
			post_creation: {
				command: 'npm install',
				enabled: true,
			},
		});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigureWorktreeHooks onComplete={onComplete} />,
		);

		expect(lastFrame()).toContain('Post Creation: ✓ npm install');
	});

	it('should display not set when no hook configured', () => {
		mockedConfigurationManager.getWorktreeHooks.mockReturnValue({});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigureWorktreeHooks onComplete={onComplete} />,
		);

		expect(lastFrame()).toContain('Post Creation: ✗ (not set)');
	});
});
