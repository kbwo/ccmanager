import React, {useImperativeHandle, forwardRef} from 'react';
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import App from './App.js';
import {globalSessionManager} from '../services/globalSessionManager.js';

interface MockProjectListProps {
	onSelectProject: (project: {
		path: string;
		name: string;
		relativePath: string;
		isValid: boolean;
	}) => void;
}

interface MockMenuProps {
	onSelectWorktree: (worktree: {
		path: string;
		branch: string;
		isMainWorktree: boolean;
		hasSession: boolean;
	}) => void;
	projectName?: string;
}

interface MockMenuHandle {
	triggerBack: () => void;
}

// Store refs to mock components
let mockMenuRef: React.RefObject<MockMenuHandle> | null = null;

// Mock dependencies
vi.mock('./ProjectList.js', () => ({
	default: function MockProjectList({onSelectProject}: MockProjectListProps) {
		// Simulate selecting a project after a delay
		React.useEffect(() => {
			setTimeout(() => {
				onSelectProject({
					path: '/test/project1',
					name: 'Project 1',
					relativePath: 'project1',
					isValid: true,
				});
			}, 50);
		}, [onSelectProject]);
		return null;
	},
}));

vi.mock('./Menu.js', () => ({
	default: forwardRef<MockMenuHandle, MockMenuProps>(function MockMenu(
		{onSelectWorktree, projectName},
		ref,
	) {
		React.useEffect(() => {
			// Show project name to verify we're in the right context
			if (projectName) {
				console.log(`Menu loaded for ${projectName}`);
			}
		}, [projectName]);

		// Expose method to trigger back navigation
		useImperativeHandle(
			ref,
			() => ({
				triggerBack: () => {
					onSelectWorktree({
						path: 'EXIT_APPLICATION',
						branch: '',
						isMainWorktree: false,
						hasSession: false,
					});
				},
			}),
			[onSelectWorktree],
		);

		// Store ref globally for test access
		React.useEffect(() => {
			if (ref && 'current' in ref) {
				mockMenuRef = ref as React.RefObject<MockMenuHandle>;
			}
		}, [ref]);

		return null;
	}),
}));

vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn().mockImplementation(() => ({
		getWorktrees: () => [],
		getDefaultBranch: () => 'main',
		getGitRootPath: () => '/test/project',
	})),
}));

vi.mock('../services/sessionManager.js', () => {
	class MockSessionManager {
		sessions = new Map();
		listeners = new Map<string, Set<(...args: unknown[]) => void>>();

		on(event: string, handler: (...args: unknown[]) => void) {
			if (!this.listeners.has(event)) {
				this.listeners.set(event, new Set());
			}
			this.listeners.get(event)!.add(handler);
		}

		off(event: string, handler: (...args: unknown[]) => void) {
			this.listeners.get(event)?.delete(handler);
		}

		emit(event: string, ...args: unknown[]) {
			this.listeners.get(event)?.forEach(handler => handler(...args));
		}

		getSession(worktreePath: string) {
			return this.sessions.get(worktreePath);
		}

		getAllSessions() {
			return Array.from(this.sessions.values());
		}

		async createSessionWithPreset(worktreePath: string) {
			const session = {
				id: `session-${worktreePath}`,
				worktreePath,
				state: 'idle',
				isActive: false,
			};
			this.sessions.set(worktreePath, session);
			this.emit('sessionCreated', session);
			return session;
		}

		destroy() {
			this.sessions.clear();
		}
	}

	return {SessionManager: MockSessionManager};
});

describe('App - Session Persistence', () => {
	beforeEach(() => {
		mockMenuRef = null;
		globalSessionManager.destroyAllSessions();
	});

	afterEach(() => {
		mockMenuRef = null;
	});

	it('should persist sessions when navigating between projects', async () => {
		render(<App multiProject={true} />);

		// Wait for project selection and menu to load
		await new Promise(resolve => setTimeout(resolve, 150));

		// Get the session manager for project1
		const project1Manager =
			globalSessionManager.getManagerForProject('/test/project1');

		// Create a session in project1
		await project1Manager.createSessionWithPreset('/test/project1/main');

		// Verify session exists
		expect(project1Manager.getAllSessions()).toHaveLength(1);
		expect(project1Manager.getSession('/test/project1/main')).toBeDefined();

		// Trigger back navigation using ref
		if (mockMenuRef?.current) {
			mockMenuRef.current.triggerBack();
		}

		// Wait for navigation
		await new Promise(resolve => setTimeout(resolve, 100));

		// Session should still exist in the project manager
		const persistedManager =
			globalSessionManager.getManagerForProject('/test/project1');
		expect(persistedManager).toBe(project1Manager); // Same instance
		expect(persistedManager.getAllSessions()).toHaveLength(1);
		expect(persistedManager.getSession('/test/project1/main')).toBeDefined();
	});

	it('should maintain separate sessions for different projects', async () => {
		// Create sessions for two different projects
		const project1Manager =
			globalSessionManager.getManagerForProject('/test/project1');
		const project2Manager =
			globalSessionManager.getManagerForProject('/test/project2');

		await project1Manager.createSessionWithPreset('/test/project1/main');
		await project1Manager.createSessionWithPreset('/test/project1/feature');
		await project2Manager.createSessionWithPreset('/test/project2/main');

		// Verify sessions are separate
		expect(project1Manager.getAllSessions()).toHaveLength(2);
		expect(project2Manager.getAllSessions()).toHaveLength(1);

		// Verify all sessions are accessible globally
		const allSessions = globalSessionManager.getAllActiveSessions();
		expect(allSessions).toHaveLength(3);
		expect(allSessions.map(s => s.worktreePath)).toContain(
			'/test/project1/main',
		);
		expect(allSessions.map(s => s.worktreePath)).toContain(
			'/test/project1/feature',
		);
		expect(allSessions.map(s => s.worktreePath)).toContain(
			'/test/project2/main',
		);
	});

	it('should only destroy sessions on actual app exit', async () => {
		const {unmount} = render(<App multiProject={false} />);

		// Create a session
		const manager = globalSessionManager.getManagerForProject();
		await manager.createSessionWithPreset('/test/worktree');

		expect(manager.getAllSessions()).toHaveLength(1);

		// Unmount the component (simulate navigation)
		unmount();

		// Session should still exist
		expect(manager.getAllSessions()).toHaveLength(1);

		// Simulate actual app exit
		globalSessionManager.destroyAllSessions();

		// Now sessions should be gone
		expect(manager.getAllSessions()).toHaveLength(0);
	});
});
