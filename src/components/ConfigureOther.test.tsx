import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ConfigureOther from './ConfigureOther.js';
import {ConfigEditorProvider} from '../contexts/ConfigEditorContext.js';

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

// Create mock functions that will be used by the mock class
const mockFns = {
	getAutoApprovalConfig: vi.fn(),
	setAutoApprovalConfig: vi.fn(),
	hasProjectOverride: vi.fn().mockReturnValue(false),
	getScope: vi.fn().mockReturnValue('global'),
};

vi.mock('../services/config/configEditor.js', () => {
	return {
		ConfigEditor: class {
			getAutoApprovalConfig = mockFns.getAutoApprovalConfig;
			setAutoApprovalConfig = mockFns.setAutoApprovalConfig;
			hasProjectOverride = mockFns.hasProjectOverride;
			getScope = mockFns.getScope;
		},
	};
});

vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		matchesShortcut: vi.fn().mockReturnValue(false),
		getShortcutDisplay: vi.fn().mockReturnValue('Esc'),
	},
}));

vi.mock('./TextInputWrapper.js', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	return {
		default: ({value}: {value: string}) =>
			React.createElement('input', {value, 'data-testid': 'text-input'}),
	};
});

vi.mock('./ConfigureCustomCommand.js', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	return {
		default: () =>
			React.createElement('div', {'data-testid': 'custom-command-editor'}),
	};
});

vi.mock('./CustomCommandSummary.js', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text} = await vi.importActual<typeof import('ink')>('ink');
	return {
		default: ({command}: {command: string}) =>
			React.createElement(
				Text,
				null,
				`Custom auto-approval command: ${command || 'Empty'}`,
			),
	};
});

describe('ConfigureOther', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders experimental settings with auto-approval status', () => {
		mockFns.getAutoApprovalConfig.mockReturnValue({
			enabled: true,
			customCommand: '',
			timeout: 30,
		});

		const {lastFrame} = render(
			<ConfigEditorProvider scope="global">
				<ConfigureOther onComplete={vi.fn()} />
			</ConfigEditorProvider>,
		);

		expect(lastFrame()).toContain('Other & Experimental Settings');
		expect(lastFrame()).toContain('Auto Approval (experimental): ✅ Enabled');
		expect(lastFrame()).toContain('Custom auto-approval command: Empty');
		expect(lastFrame()).toContain('Edit Custom Command');
		expect(lastFrame()).toContain('Save Changes');
	});

	it('shows current custom command summary', () => {
		mockFns.getAutoApprovalConfig.mockReturnValue({
			enabled: false,
			customCommand: 'jq -n \'{"needsPermission":true}\'',
			timeout: 30,
		});

		const {lastFrame} = render(
			<ConfigEditorProvider scope="global">
				<ConfigureOther onComplete={vi.fn()} />
			</ConfigEditorProvider>,
		);

		expect(lastFrame()).toContain('Custom auto-approval command:');
		expect(lastFrame()).toContain('jq -n');
		expect(lastFrame()).toContain('Edit Custom Command');
	});
});
