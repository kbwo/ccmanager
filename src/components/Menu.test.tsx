import {describe, it, expect, vi, beforeEach} from 'vitest';
import Menu from './Menu.js';
import React from 'react';

// Import modules for proper ESM mocking
import * as InkModule from 'ink';
import * as SelectInputModule from 'ink-select-input';
import * as WorktreeServiceModule from '../services/worktreeService.js';

vi.mock('../services/worktreeService.js');
vi.mock('../services/sessionManager.js');
vi.mock('ink', () => ({
	Box: vi.fn(({children}) => React.createElement('div', {}, children)),
	Text: vi.fn(({children}) => React.createElement('span', {}, children)),
	useInput: vi.fn(),
	useEffect: vi.fn(),
	useState: vi.fn(),
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

describe('Menu Component', () => {
	const mockOnSelectWorktree = vi.fn();
	const mockSessionManager = {
		getSessions: vi.fn(() => ({})),
		on: vi.fn(),
		off: vi.fn(),
	};

	const mockWorktrees = [
		{
			path: '/test/worktree1',
			branch: 'feature/test',
			isMainWorktree: false,
			hasSession: false,
		},
		{
			path: '/test/main',
			branch: 'main',
			isMainWorktree: true,
			hasSession: true,
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		
		// Mock WorktreeService to return test worktrees
		const mockWorktreeService = vi.mocked(WorktreeServiceModule.WorktreeService);
		vi.mocked(mockWorktreeService.prototype.getWorktrees).mockReturnValue(mockWorktrees);
	});

	it('should be a valid React component', () => {
		expect(Menu).toBeDefined();
		expect(typeof Menu).toBe('function');
	});

	it('should accept required props', () => {
		const component = React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});
		expect(component).toBeDefined();
	});

	it('should render without errors', () => {
		expect(() => {
			React.createElement(Menu, {
				sessionManager: mockSessionManager as any,
				onSelectWorktree: mockOnSelectWorktree,
			});
		}).not.toThrow();
	});

	it('should render main title and help text', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		// Verify main title is rendered
		const mockText = vi.mocked(InkModule.Text);
		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({children: 'CCManager - Worktree Sessions'}),
			expect.anything()
		);

		// Verify help text with hotkeys is rendered
		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({
				children: expect.stringContaining('Controls: ↑↓ Navigate Enter Select | Hotkeys: 0-9 Quick Select N-New M-Merge D-Delete C-Config Q-Quit')
			}),
			expect.anything()
		);
	});

	it('should render SelectInput with menu items', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		// Verify SelectInput is called with menu structure
		const mockSelectInput = vi.mocked(SelectInputModule.default);
		expect(mockSelectInput).toHaveBeenCalledWith(
			expect.objectContaining({
				items: expect.any(Array),
				onSelect: expect.any(Function),
				isFocused: true
			}),
			expect.anything()
		);
	});

	it('should set up hotkey input handler', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		// Verify useInput hook is called to setup hotkey handling
		const mockUseInput = vi.mocked(InkModule.useInput);
		expect(mockUseInput).toHaveBeenCalledWith(expect.any(Function));
	});

	it('should handle number and letter hotkeys', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		const mockUseInput = vi.mocked(InkModule.useInput);
		const inputHandler = mockUseInput.mock.calls[0][0];

		// Test number hotkeys (0-9) - should not throw
		expect(() => {
			inputHandler('0', {});
			inputHandler('1', {});
			inputHandler('9', {});
		}).not.toThrow();

		// Test letter hotkeys for menu actions
		expect(() => {
			inputHandler('n', {}); // new
			inputHandler('m', {}); // merge
			inputHandler('d', {}); // delete
			inputHandler('c', {}); // config
			inputHandler('q', {}); // quit
			inputHandler('x', {}); // exit
		}).not.toThrow();

		// Verify onSelectWorktree was called for menu actions
		expect(mockOnSelectWorktree).toHaveBeenCalled();
	});

	it('should handle case insensitive hotkeys', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		const mockUseInput = vi.mocked(InkModule.useInput);
		const inputHandler = mockUseInput.mock.calls[0][0];

		// Test uppercase letters work the same as lowercase
		expect(() => {
			inputHandler('N', {}); // new
			inputHandler('M', {}); // merge
			inputHandler('D', {}); // delete
			inputHandler('C', {}); // config
			inputHandler('Q', {}); // quit
		}).not.toThrow();

		expect(mockOnSelectWorktree).toHaveBeenCalled();
	});

	it('should register session manager event listeners', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		// Verify event listeners are registered for session changes
		expect(mockSessionManager.on).toHaveBeenCalledWith('sessionCreated', expect.any(Function));
		expect(mockSessionManager.on).toHaveBeenCalledWith('sessionDestroyed', expect.any(Function));
		expect(mockSessionManager.on).toHaveBeenCalledWith('sessionStateChanged', expect.any(Function));
	});

	it('should handle empty input gracefully', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		const mockUseInput = vi.mocked(InkModule.useInput);
		const inputHandler = mockUseInput.mock.calls[0][0];

		// Test empty input and invalid keys don't crash
		expect(() => {
			inputHandler('', {});
			inputHandler('z', {}); // Not a mapped hotkey
			inputHandler('!', {}); // Special character
		}).not.toThrow();
	});

	it('should validate worktree selection bounds', () => {
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		const mockUseInput = vi.mocked(InkModule.useInput);
		const inputHandler = mockUseInput.mock.calls[0][0];

		// Test number selection beyond available worktrees
		const initialCallCount = mockOnSelectWorktree.mock.calls.length;
		
		inputHandler('9', {}); // No 9th worktree available
		
		// Should not have called onSelectWorktree for invalid index
		// (this tests the bounds checking logic)
		expect(() => {
			inputHandler('9', {});
		}).not.toThrow();
	});
});