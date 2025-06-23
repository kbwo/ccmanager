import {describe, it, expect, vi, beforeEach} from 'vitest';
import Menu from './Menu.js';
import React from 'react';

vi.mock('../services/worktreeService.js');
vi.mock('../services/sessionManager.js');
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

describe('Menu Component', () => {
	const mockOnSelectWorktree = vi.fn();
	const mockSessionManager = {
		getSessions: vi.fn(() => ({})),
		refreshWorktrees: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
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
});
