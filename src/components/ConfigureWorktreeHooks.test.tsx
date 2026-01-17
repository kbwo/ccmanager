import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ConfigureWorktreeHooks from './ConfigureWorktreeHooks.js';
import {ConfigEditorProvider} from '../contexts/ConfigEditorContext.js';

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

// Create mock functions that will be used by the mock class
const mockFns = {
	getWorktreeHooks: vi.fn(),
	setWorktreeHooks: vi.fn(),
	getEffectiveWorktreeHooks: vi.fn(),
	hasProjectOverride: vi.fn().mockReturnValue(false),
	getScope: vi.fn().mockReturnValue('global'),
};

vi.mock('../services/configEditor.js', () => {
	return {
		ConfigEditor: class {
			getWorktreeHooks = mockFns.getWorktreeHooks;
			setWorktreeHooks = mockFns.setWorktreeHooks;
			getEffectiveWorktreeHooks = mockFns.getEffectiveWorktreeHooks;
			hasProjectOverride = mockFns.hasProjectOverride;
			getScope = mockFns.getScope;
		},
	};
});

describe('ConfigureWorktreeHooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should render worktree hooks configuration screen', () => {
		mockFns.getWorktreeHooks.mockReturnValue({});
		mockFns.getEffectiveWorktreeHooks.mockReturnValue({});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigEditorProvider scope="global">
				<ConfigureWorktreeHooks onComplete={onComplete} />
			</ConfigEditorProvider>,
		);

		expect(lastFrame()).toContain('Configure Worktree Hooks');
		expect(lastFrame()).toContain('Set commands to run on worktree events');
		expect(lastFrame()).toContain('Post Creation:');
	});

	it('should display configured hooks', () => {
		mockFns.getWorktreeHooks.mockReturnValue({
			post_creation: {
				command: 'npm install',
				enabled: true,
			},
		});
		mockFns.getEffectiveWorktreeHooks.mockReturnValue({
			post_creation: {
				command: 'npm install',
				enabled: true,
			},
		});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigEditorProvider scope="global">
				<ConfigureWorktreeHooks onComplete={onComplete} />
			</ConfigEditorProvider>,
		);

		expect(lastFrame()).toContain('Post Creation: ✓ npm install');
	});

	it('should display not set when no hook configured', () => {
		mockFns.getWorktreeHooks.mockReturnValue({});
		mockFns.getEffectiveWorktreeHooks.mockReturnValue({});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigEditorProvider scope="global">
				<ConfigureWorktreeHooks onComplete={onComplete} />
			</ConfigEditorProvider>,
		);

		expect(lastFrame()).toContain('Post Creation: ✗ (not set)');
	});
});
