import React from 'react';
import {render} from 'ink-testing-library';
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest';
import type {Key} from 'ink';

// Hoist mocks to avoid top-level variable access in vi.mock factories
const {capturedHandlers} = vi.hoisted(() => {
	const capturedHandlers: {
		inputHandler: ((input: string, key: Key) => void) | null;
	} = {
		inputHandler: null,
	};
	return {capturedHandlers};
});

// Mock ink to avoid stdin issues and capture useInput callbacks
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn((handler: (input: string, key: Key) => void) => {
			capturedHandlers.inputHandler = handler;
		}),
	};
});

// Mock SelectInput
vi.mock('ink-select-input', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text, Box} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({
			items,
			onSelect: _onSelect,
			initialIndex = 0,
		}: {
			items: Array<{label: string; value: string}>;
			onSelect: (item: {label: string; value: string}) => void;
			initialIndex?: number;
		}) => {
			return React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item, index) =>
					React.createElement(
						Text,
						{key: index},
						`${index === initialIndex ? '❯ ' : '  '}${item.label}`,
					),
				),
			);
		},
	};
});

// Mock configReader
vi.mock('../services/config/configReader.js', () => ({
	configReader: {
		getCommandPresets: vi.fn().mockReturnValue({
			presets: [
				{id: 'preset-1', name: 'Claude', command: 'claude'},
				{id: 'preset-2', name: 'Gemini', command: 'gemini'},
				{id: 'preset-3', name: 'Cursor', command: 'cursor'},
			],
			defaultPresetId: 'preset-1',
			selectPresetOnStart: true,
		}),
	},
}));

import PresetSelector from './PresetSelector.js';

const makeKey = (overrides: Partial<Key> = {}): Key => ({
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

describe('PresetSelector component', () => {
	let onSelect: ReturnType<typeof vi.fn<(presetId: string) => void>>;
	let onCancel: ReturnType<typeof vi.fn<() => void>>;

	beforeEach(() => {
		onSelect = vi.fn<(presetId: string) => void>();
		onCancel = vi.fn<() => void>();
		capturedHandlers.inputHandler = null;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('renders preset list with number prefixes and default label', () => {
		const {lastFrame} = render(
			<PresetSelector onSelect={onSelect} onCancel={onCancel} />,
		);
		const output = lastFrame();
		expect(output).toContain('[1]');
		expect(output).toContain('[2]');
		expect(output).toContain('[3]');
		expect(output).toContain('(default)');
		expect(output).toContain('← Cancel');
	});

	it('pressing 1 calls onSelect with first preset id immediately', () => {
		render(<PresetSelector onSelect={onSelect} onCancel={onCancel} />);
		expect(capturedHandlers.inputHandler).not.toBeNull();
		capturedHandlers.inputHandler!('1', makeKey());
		expect(onSelect).toHaveBeenCalledWith('preset-1');
		expect(onCancel).not.toHaveBeenCalled();
	});

	it('pressing 2 calls onSelect with second preset id immediately', () => {
		render(<PresetSelector onSelect={onSelect} onCancel={onCancel} />);
		capturedHandlers.inputHandler!('2', makeKey());
		expect(onSelect).toHaveBeenCalledWith('preset-2');
	});

	it('pressing 3 calls onSelect with third preset id immediately', () => {
		render(<PresetSelector onSelect={onSelect} onCancel={onCancel} />);
		capturedHandlers.inputHandler!('3', makeKey());
		expect(onSelect).toHaveBeenCalledWith('preset-3');
	});

	it('pressing a number beyond preset count does nothing', () => {
		render(<PresetSelector onSelect={onSelect} onCancel={onCancel} />);
		capturedHandlers.inputHandler!('9', makeKey());
		expect(onSelect).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});

	it('pressing ESC calls onCancel', () => {
		render(<PresetSelector onSelect={onSelect} onCancel={onCancel} />);
		capturedHandlers.inputHandler!('', makeKey({escape: true}));
		expect(onCancel).toHaveBeenCalled();
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('displays title and subtitle', () => {
		const {lastFrame} = render(
			<PresetSelector onSelect={onSelect} onCancel={onCancel} />,
		);
		const output = lastFrame();
		expect(output).toContain('Select Command Preset');
		expect(output).toContain('Choose a preset to start the session with');
	});
});
