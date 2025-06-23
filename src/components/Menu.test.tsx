import {describe, it, expect, vi} from 'vitest';
import Menu from './Menu.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';

// Mock dependencies
vi.mock('../services/worktreeService.js');
vi.mock('../services/sessionManager.js');
vi.mock('ink', () => ({
	Box: vi.fn(),
	Text: vi.fn(),
	useInput: vi.fn(),
}));
vi.mock('ink-select-input', () => ({
	default: vi.fn(),
}));

describe('Menu Component', () => {
	it('should import without errors', () => {
		expect(Menu).toBeDefined();
		expect(typeof Menu).toBe('function');
	});

	it('should have correct dependencies', () => {
		expect(SessionManager).toBeDefined();
		expect(WorktreeService).toBeDefined();
	});

	it('should be a React component', () => {
		// Test that Menu is a function component
		expect(typeof Menu).toBe('function');
		expect(Menu.length).toBeGreaterThanOrEqual(1); // Should accept props
	});
});
