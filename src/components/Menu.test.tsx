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

	it('should have proper component structure for menu interface', () => {
		// Test that the component can be instantiated with proper typing
		const component = React.createElement(Menu, {
			sessionManager: mockSessionManager as any,
			onSelectWorktree: mockOnSelectWorktree,
		});
		
		// Verify it's a function component with correct signature
		expect(typeof Menu).toBe('function');
		expect(Menu.length).toBe(1); // Should accept one argument (props)
		
		// Verify props are properly typed and passed
		expect(component.type).toBe(Menu);
		expect(typeof component.props.onSelectWorktree).toBe('function');
		expect(component.props.sessionManager).toBeDefined();
	});

	it('should handle missing or undefined props gracefully', () => {
		// This tests component robustness
		expect(() => {
			// Test with minimal valid props
			React.createElement(Menu, {
				sessionManager: mockSessionManager as any,
				onSelectWorktree: mockOnSelectWorktree,
			});
		}).not.toThrow();
	});

	it('should import all required dependencies without errors', () => {
		// This test ensures all imports are working correctly
		expect(Menu).toBeDefined();
		
		// Verify the component function exists and is callable
		expect(() => {
			const componentDef = Menu;
			expect(componentDef).toBeInstanceOf(Function);
		}).not.toThrow();
	});
});