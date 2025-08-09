import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ConfigureStatusHooks from './ConfigureStatusHooks.js';
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
		getStatusHooks: vi.fn(),
		setStatusHooks: vi.fn(),
	},
}));

const mockedConfigurationManager = configurationManager as unknown as {
	getStatusHooks: ReturnType<typeof vi.fn>;
	setStatusHooks: ReturnType<typeof vi.fn>;
};

describe('ConfigureStatusHooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should render status hooks configuration screen', () => {
		mockedConfigurationManager.getStatusHooks.mockReturnValue({});

		const onComplete = vi.fn();
		const {lastFrame} = render(
			<ConfigureStatusHooks onComplete={onComplete} />,
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
		mockedConfigurationManager.getStatusHooks.mockReturnValue({
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
			<ConfigureStatusHooks onComplete={onComplete} />,
		);

		expect(lastFrame()).toContain('Idle: ✓ notify-send "Idle"');
		expect(lastFrame()).toContain('Busy: ✗ echo "Busy"');
		expect(lastFrame()).toContain('Waiting for Input: ✗ (not set)');
	});
});
