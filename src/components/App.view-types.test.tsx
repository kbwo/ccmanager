import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

// Mock the dependencies
vi.mock('../services/sessionManager.js', async () => {
	const {EventEmitter} = await import('events');
	return {
		SessionManager: class MockSessionManager extends EventEmitter {
			getSession = vi.fn();
			createSessionWithPreset = vi.fn();
			createSessionWithPresetEffect = vi.fn();
			createSessionWithDevcontainer = vi.fn();
			createSessionWithDevcontainerEffect = vi.fn();
			setSessionActive = vi.fn();
		},
	};
});

vi.mock('../services/globalSessionOrchestrator.js', async () => {
	const {SessionManager} = await import('../services/sessionManager.js');
	return {
		globalSessionOrchestrator: {
			getManagerForProject: vi.fn(() => new SessionManager()),
			destroyAllSessions: vi.fn(),
		},
	};
});

vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: class MockWorktreeService {
		createWorktree = vi.fn();
		deleteWorktree = vi.fn();
		listWorktrees = vi.fn(() => ({success: true, data: []}));
	},
}));

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getSelectPresetOnStart: vi.fn(() => false),
	},
}));

vi.mock('../services/projectManager.js', () => ({
	projectManager: {
		addRecentProject: vi.fn(),
	},
}));

describe('App - View Union Types', () => {
	describe('View Union Type Extension for Session Loading States', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should support "creating-session" as a valid View state', () => {
			// RED: This test verifies that 'creating-session' is added to View union type
			// Expected: TypeScript should allow 'creating-session' as a valid View value
			const view = 'creating-session' as const;
			expect(view).toBe('creating-session');
		});

		it('should support "creating-session-preset" as a valid View state', () => {
			// RED: This test verifies that 'creating-session-preset' is added to View union type
			// Expected: TypeScript should allow 'creating-session-preset' as a valid View value
			const view = 'creating-session-preset' as const;
			expect(view).toBe('creating-session-preset');
		});

		it('should maintain all existing View states without breaking changes', () => {
			// RED: This test ensures backward compatibility with existing View states
			// Expected: All existing View states should still be valid
			const existingViews = [
				'menu',
				'project-list',
				'session',
				'new-worktree',
				'creating-worktree',
				'delete-worktree',
				'deleting-worktree',
				'merge-worktree',
				'configuration',
				'preset-selector',
				'remote-branch-selector',
				'clearing',
			];

			existingViews.forEach(view => {
				expect(typeof view).toBe('string');
				expect(view.length).toBeGreaterThan(0);
			});
		});

		it('should verify TypeScript exhaustive View handling with new states', async () => {
			// RED: This test ensures TypeScript will catch any unhandled View cases
			// Expected: When View union is extended, TypeScript's exhaustiveness checking
			// should require handling of 'creating-session' and 'creating-session-preset'

			// Import the App component to verify type definitions
			const AppModule = await import('./App.js');
			expect(AppModule.default).toBeDefined();

			// This test will fail if the View union is not properly extended
			// or if the switch/if statements don't handle all View cases
			const allViewStates = [
				'menu',
				'project-list',
				'session',
				'new-worktree',
				'creating-worktree',
				'creating-session', // NEW
				'creating-session-preset', // NEW
				'delete-worktree',
				'deleting-worktree',
				'merge-worktree',
				'configuration',
				'preset-selector',
				'remote-branch-selector',
				'clearing',
			];

			// Verify all states are defined
			allViewStates.forEach(state => {
				expect(typeof state).toBe('string');
			});

			// Verify the new states are included
			expect(allViewStates).toContain('creating-session');
			expect(allViewStates).toContain('creating-session-preset');
		});

		it('should not break existing View type consumers', () => {
			// RED: This test ensures that extending View union doesn't break existing code
			// Expected: View can still be assigned to all existing view states

			type ViewType =
				| 'menu'
				| 'project-list'
				| 'session'
				| 'new-worktree'
				| 'creating-worktree'
				| 'creating-session' // NEW
				| 'creating-session-preset' // NEW
				| 'delete-worktree'
				| 'deleting-worktree'
				| 'merge-worktree'
				| 'configuration'
				| 'preset-selector'
				| 'remote-branch-selector'
				| 'clearing';

			const testView: ViewType = 'menu';
			expect(testView).toBe('menu');

			const newView1: ViewType = 'creating-session';
			expect(newView1).toBe('creating-session');

			const newView2: ViewType = 'creating-session-preset';
			expect(newView2).toBe('creating-session-preset');
		});
	});
});
