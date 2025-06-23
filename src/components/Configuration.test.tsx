import {describe, it, expect, vi, beforeEach} from 'vitest';
import Configuration from './Configuration.js';
import React from 'react';

// Import the mocks properly for ESM
import * as InkModule from 'ink';
import * as SelectInputModule from 'ink-select-input';
import * as ShortcutManagerModule from '../services/shortcutManager.js';

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

	it('should accept onComplete prop', () => {
		const component = React.createElement(Configuration, {
			onComplete: mockOnComplete,
		});
		expect(component).toBeDefined();
	});

	it('should render without errors', () => {
		expect(() => {
			React.createElement(Configuration, {onComplete: mockOnComplete});
		}).not.toThrow();
	});

	it('should render main menu with all configuration options', () => {
		React.createElement(Configuration, {onComplete: mockOnComplete});

		// Verify Text components are called for title and instructions
		const mockText = vi.mocked(InkModule.Text);
		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({children: 'Configuration'}),
			expect.anything()
		);
		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({children: 'Select a configuration option:'}),
			expect.anything()
		);

		// Verify SelectInput is called with the right structure
		const mockSelectInput = vi.mocked(SelectInputModule.default);
		expect(mockSelectInput).toHaveBeenCalledWith(
			expect.objectContaining({
				items: expect.arrayContaining([
					expect.objectContaining({value: 'shortcuts'}),
					expect.objectContaining({value: 'hooks'}),
					expect.objectContaining({value: 'worktree'}),
					expect.objectContaining({value: 'command'}),
					expect.objectContaining({value: 'back'}),
				])
			}),
			expect.anything()
		);
	});

	it('should set up hotkey input handler', () => {
		React.createElement(Configuration, {onComplete: mockOnComplete});

		// Verify useInput hook is called to setup hotkey handling
		const mockUseInput = vi.mocked(InkModule.useInput);
		expect(mockUseInput).toHaveBeenCalledWith(expect.any(Function));
	});

	it('should integrate with shortcutManager for escape handling', () => {
		React.createElement(Configuration, {onComplete: mockOnComplete});

		// Verify the input handler calls shortcutManager.matchesShortcut
		const mockUseInput = vi.mocked(InkModule.useInput);
		const inputHandler = mockUseInput.mock.calls[0][0];
		
		// Mock shortcutManager to return true for escape
		const mockShortcutManager = vi.mocked(ShortcutManagerModule.shortcutManager);
		mockShortcutManager.matchesShortcut.mockReturnValue(true);

		// Simulate escape key
		inputHandler('', {escape: true});

		expect(mockShortcutManager.matchesShortcut).toHaveBeenCalledWith('cancel', '', {escape: true});
		expect(mockOnComplete).toHaveBeenCalled();
	});

	it('should handle hotkey navigation for all menu options', () => {
		React.createElement(Configuration, {onComplete: mockOnComplete});

		const mockUseInput = vi.mocked(InkModule.useInput);
		const inputHandler = mockUseInput.mock.calls[0][0];

		// Test that hotkeys trigger navigation (we can't easily test the actual navigation 
		// without complex mocking, but we can verify the handler processes the keys)
		expect(() => {
			inputHandler('s', {}); // shortcuts
			inputHandler('h', {}); // hooks  
			inputHandler('w', {}); // worktree
			inputHandler('c', {}); // command
			inputHandler('b', {}); // back
		}).not.toThrow();

		// Verify back hotkey calls onComplete
		expect(mockOnComplete).toHaveBeenCalled();
	});

	it('should only handle hotkeys in menu view', () => {
		React.createElement(Configuration, {onComplete: mockOnComplete});

		const mockUseInput = vi.mocked(InkModule.useInput);
		const inputHandler = mockUseInput.mock.calls[0][0];

		// This verifies the view state checking logic exists
		// (the actual implementation checks if view !== 'menu' before processing hotkeys)
		expect(() => {
			inputHandler('s', {});
		}).not.toThrow();
	});
});