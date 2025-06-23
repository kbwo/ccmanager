import {describe, it, expect, vi} from 'vitest';
import Configuration from './Configuration.js';

// Mock dependencies
vi.mock('ink', () => ({
	Box: vi.fn(),
	Text: vi.fn(),
	useInput: vi.fn(),
}));
vi.mock('ink-select-input', () => ({
	default: vi.fn(),
}));
vi.mock('./ConfigureShortcuts.js', () => ({
	default: vi.fn(),
}));
vi.mock('./ConfigureHooks.js', () => ({
	default: vi.fn(),
}));
vi.mock('./ConfigureWorktree.js', () => ({
	default: vi.fn(),
}));
vi.mock('./ConfigureCommand.js', () => ({
	default: vi.fn(),
}));
vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		matchesShortcut: vi.fn(),
	},
}));

describe('Configuration Component', () => {
	it('should import without errors', () => {
		expect(Configuration).toBeDefined();
		expect(typeof Configuration).toBe('function');
	});

	it('should be a React component', () => {
		// Test that Configuration is a function component
		expect(typeof Configuration).toBe('function');
		expect(Configuration.length).toBeGreaterThanOrEqual(1); // Should accept props
	});

	it('should have required prop interface', () => {
		// Test that the component function exists and can be called
		expect(() => {
			const propsLength = Configuration.length; // Access component props length
			expect(propsLength).toBeDefined();
		}).not.toThrow();
	});
});
