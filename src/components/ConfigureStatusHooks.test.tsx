import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ConfigureStatusHooks from './ConfigureStatusHooks.js';
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
	getStatusHooks: vi.fn(),
	setStatusHooks: vi.fn(),
	getEffectiveStatusHooks: vi.fn(),
	hasProjectOverride: vi.fn().mockReturnValue(false),
	getScope: vi.fn().mockReturnValue('global'),
};

vi.mock('../services/configEditor.js', () => {
	return {
		ConfigEditor: class {
			getStatusHooks = mockFns.getStatusHooks;
			setStatusHooks = mockFns.setStatusHooks;
			getEffectiveStatusHooks = mockFns.getEffectiveStatusHooks;
			hasProjectOverride = mockFns.hasProjectOverride;
			getScope = mockFns.getScope;
		},
	};
});

describe('ConfigureStatusHooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should render status hooks configuration screen', () => {
		mockFns.getStatusHooks.mockReturnValue({});
		mockFns.getEffectiveStatusHooks.mockReturnValue({});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigEditorProvider scope="global">
				<ConfigureStatusHooks onComplete={onComplete} />
			</ConfigEditorProvider>,
		);

		expect(lastFrame()).toContain('Configure Status Hooks');
		expect(lastFrame()).toContain(
			'Set commands to run when session status changes',
		);
		expect(lastFrame()).toContain('Idle:');
		expect(lastFrame()).toContain('Busy:');
		expect(lastFrame()).toContain('Waiting for Input:');
	});

	it('should display configured hooks', () => {
		mockFns.getStatusHooks.mockReturnValue({
			idle: {
				command: 'notify-send "Idle"',
				enabled: true,
			},
			busy: {
				command: 'echo "Busy"',
				enabled: false,
			},
		});
		mockFns.getEffectiveStatusHooks.mockReturnValue({
			idle: {
				command: 'notify-send "Idle"',
				enabled: true,
			},
			busy: {
				command: 'echo "Busy"',
				enabled: false,
			},
		});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigEditorProvider scope="global">
				<ConfigureStatusHooks onComplete={onComplete} />
			</ConfigEditorProvider>,
		);

		expect(lastFrame()).toContain('Idle: ✓ notify-send "Idle"');
		expect(lastFrame()).toContain('Busy: ✗ echo "Busy"');
		expect(lastFrame()).toContain('Waiting for Input: ✗ (not set)');
	});
});
