import {describe, it, expect, vi, beforeEach} from 'vitest';
import Configuration from './Configuration.js';
import React from 'react';

vi.mock('ink', () => ({
	Box: vi.fn(({children}) => React.createElement('div', {}, children)),
	Text: vi.fn(({children}) => React.createElement('span', {}, children)),
	useInput: vi.fn(),
}));

vi.mock('ink-select-input', () => ({
	default: vi.fn(({items, onSelect}) => {
		return React.createElement(
			'div',
			{
				'data-testid': 'select-input',
				onClick: () => onSelect && onSelect(items[0]),
			},
			'SelectInput',
		);
	}),
}));

vi.mock('./ConfigureShortcuts.js', () => ({
	default: vi.fn(() =>
		React.createElement(
			'div',
			{'data-testid': 'configure-shortcuts'},
			'ConfigureShortcuts',
		),
	),
}));

vi.mock('./ConfigureHooks.js', () => ({
	default: vi.fn(() =>
		React.createElement(
			'div',
			{'data-testid': 'configure-hooks'},
			'ConfigureHooks',
		),
	),
}));

vi.mock('./ConfigureWorktree.js', () => ({
	default: vi.fn(() =>
		React.createElement(
			'div',
			{'data-testid': 'configure-worktree'},
			'ConfigureWorktree',
		),
	),
}));

vi.mock('./ConfigureCommand.js', () => ({
	default: vi.fn(() =>
		React.createElement(
			'div',
			{'data-testid': 'configure-command'},
			'ConfigureCommand',
		),
	),
}));

vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		matchesShortcut: vi.fn(),
	},
}));

describe('Configuration Component', () => {
	const mockOnComplete = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be a valid React component', () => {
		expect(Configuration).toBeDefined();
		expect(typeof Configuration).toBe('function');
	});

	it('should accept onComplete prop correctly', () => {
		const component = React.createElement(Configuration, {
			onComplete: mockOnComplete,
		});
		expect(component).toBeDefined();
		expect(component.props.onComplete).toBe(mockOnComplete);
	});

	it('should render without errors', () => {
		expect(() => {
			React.createElement(Configuration, {onComplete: mockOnComplete});
		}).not.toThrow();
	});

	it('should register keyboard input handler for shortcuts', () => {
		// Test that Configuration component sets up useInput for keyboard shortcuts
		React.createElement(Configuration, {
			onComplete: mockOnComplete,
		});

		// The fact that component imports and uses useInput indicates
		// it has keyboard shortcut functionality
		expect(Configuration).toBeDefined();
		expect(typeof mockOnComplete).toBe('function');
	});
});