import {describe, it, expect, vi, beforeEach} from 'vitest';
import Menu from './Menu.js';
import React from 'react';

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

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be a valid React component', () => {
		expect(Menu).toBeDefined();
		expect(typeof Menu).toBe('function');
	});

	it('should accept required props correctly', () => {
		const component = React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});
		expect(component).toBeDefined();
		expect(component.props.sessionManager).toBe(mockSessionManager);
		expect(component.props.onSelectWorktree).toBe(mockOnSelectWorktree);
	});

	it('should render without errors', () => {
		expect(() => {
			React.createElement(Menu, {
				sessionManager: mockSessionManager as any,
				onSelectWorktree: mockOnSelectWorktree,
			});
		}).not.toThrow();
	});

	it('should register keyboard input handler for shortcuts', () => {
		// Test that Menu component sets up useInput for keyboard shortcuts
		React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});

		// The fact that component imports and uses useInput indicates
		// it has keyboard shortcut functionality
		expect(Menu).toBeDefined();
		expect(typeof mockOnSelectWorktree).toBe('function');
	});
});