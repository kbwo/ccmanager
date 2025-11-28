import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ConfigureOther from './ConfigureOther.js';
import {configurationManager} from '../services/configurationManager.js';

// Mock ink to avoid stdin issues during tests
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn(),
	};
});

// Mock SelectInput to render labels directly
vi.mock('ink-select-input', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text, Box} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({items}: {items: Array<{label: string; value: string}>}) =>
			React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item, index) =>
					React.createElement(Text, {key: index}, item.label),
				),
			),
	};
});

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getAutoApprovalConfig: vi.fn(),
		setAutoApprovalConfig: vi.fn(),
	},
}));

vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		matchesShortcut: vi.fn().mockReturnValue(false),
		getShortcutDisplay: vi.fn().mockReturnValue('Esc'),
	},
}));

const mockedConfigurationManager = configurationManager as unknown as {
	getAutoApprovalConfig: ReturnType<typeof vi.fn>;
	setAutoApprovalConfig: ReturnType<typeof vi.fn>;
};

describe('ConfigureOther', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders experimental settings with auto-approval status', () => {
		mockedConfigurationManager.getAutoApprovalConfig.mockReturnValue({
			enabled: true,
		});

		const {lastFrame} = render(<ConfigureOther onComplete={vi.fn()} />);

		expect(lastFrame()).toContain('Other & Experimental Settings');
		expect(lastFrame()).toContain('Auto Approval (experimental): ✅ Enabled');
		expect(lastFrame()).toContain('Save Changes');
	});
});
