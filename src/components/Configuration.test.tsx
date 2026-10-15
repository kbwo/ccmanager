import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import Configuration from './Configuration.js';
import {configReader} from '../services/config/configReader.js';

vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {...actual, useInput: vi.fn()};
});

type Item = {label: string; value: string};
let onSelect: ((item: Item) => void) | undefined;

vi.mock('ink-select-input', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text} = await vi.importActual<typeof import('ink')>('ink');
	return {
		default: (props: {items: Item[]; onSelect: (item: Item) => void}) => {
			onSelect = props.onSelect;
			return React.createElement(
				Text,
				null,
				props.items.map(item => item.label).join('\n'),
			);
		},
	};
});

describe('Configuration', () => {
	it('reloads config from disk and returns to the menu', () => {
		const reload = vi
			.spyOn(configReader, 'reload')
			.mockImplementation(() => {});
		const onComplete = vi.fn();

		const {lastFrame} = render(
			<Configuration scope="global" onComplete={onComplete} />,
		);
		expect(lastFrame()).toContain('Reload Config from Disk');

		onSelect!({label: 'Reload Config from Disk', value: 'reload'});

		expect(reload).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});
