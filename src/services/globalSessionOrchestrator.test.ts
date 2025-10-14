import {describe, it, expect, beforeEach, vi} from 'vitest';
import {globalSessionOrchestrator} from './globalSessionOrchestrator.js';

interface MockSession {
	id: string;
	worktreePath?: string;
	state?: string;
}

interface MockSessionManager {
	sessions: Map<string, MockSession>;
	getAllSessions(): MockSession[];
	destroy(): void;
}

// Mock SessionManager
vi.mock('./sessionManager.js', () => {
	class MockSessionManager {
		sessions = new Map<string, MockSession>();

		getAllSessions() {
			return Array.from(this.sessions.values());
		}

		destroy() {
			this.sessions.clear();
		}

		getSession(worktreePath: string) {
			return this.sessions.get(worktreePath);
		}

		setSessionActive(_worktreePath: string, _active: boolean) {
			// Mock implementation
		}

		destroySession(worktreePath: string) {
			this.sessions.delete(worktreePath);
		}

		on() {
			// Mock implementation
		}

		off() {
			// Mock implementation
		}

		emit() {
			// Mock implementation
		}
	}

	return {SessionManager: MockSessionManager};
});

describe('GlobalSessionManager', () => {
	beforeEach(() => {
		// Clear any existing sessions
		globalSessionOrchestrator.destroyAllSessions();
	});

	it('should return the same manager instance for the same project', () => {
		const manager1 =
			globalSessionOrchestrator.getManagerForProject('/project1');
		const manager2 =
			globalSessionOrchestrator.getManagerForProject('/project1');

		expect(manager1).toBe(manager2);
	});

	it('should return different managers for different projects', () => {
		const manager1 =
			globalSessionOrchestrator.getManagerForProject('/project1');
		const manager2 =
			globalSessionOrchestrator.getManagerForProject('/project2');

		expect(manager1).not.toBe(manager2);
	});

	it('should return global manager when no project path is provided', () => {
		const manager1 = globalSessionOrchestrator.getManagerForProject();
		const manager2 = globalSessionOrchestrator.getManagerForProject();

		expect(manager1).toBe(manager2);
	});

	it('should get all active sessions from all managers', () => {
		const globalManager =
			globalSessionOrchestrator.getManagerForProject() as unknown as MockSessionManager;
		const project1Manager = globalSessionOrchestrator.getManagerForProject(
			'/project1',
		) as unknown as MockSessionManager;
		const project2Manager = globalSessionOrchestrator.getManagerForProject(
			'/project2',
		) as unknown as MockSessionManager;

		// Add mock sessions
		globalManager.sessions.set('global-session', {
			id: 'global-session',
		});
		project1Manager.sessions.set('project1-session', {
			id: 'project1-session',
		});
		project2Manager.sessions.set('project2-session', {
			id: 'project2-session',
		});

		const allSessions = globalSessionOrchestrator.getAllActiveSessions();

		expect(allSessions).toHaveLength(3);
		const sessionIds = allSessions.map(s => (s as MockSession).id);
		expect(sessionIds).toContain('global-session');
		expect(sessionIds).toContain('project1-session');
		expect(sessionIds).toContain('project2-session');
	});

	it('should destroy all sessions when destroyAllSessions is called', () => {
		const globalManager =
			globalSessionOrchestrator.getManagerForProject() as unknown as MockSessionManager;
		const project1Manager = globalSessionOrchestrator.getManagerForProject(
			'/project1',
		) as unknown as MockSessionManager;

		// Add mock sessions
		globalManager.sessions.set('global-session', {
			id: 'global-session',
		});
		project1Manager.sessions.set('project1-session', {
			id: 'project1-session',
		});

		globalSessionOrchestrator.destroyAllSessions();

		expect(globalManager.sessions.size).toBe(0);
		expect(project1Manager.sessions.size).toBe(0);
	});

	it('should destroy only project sessions when destroyProjectSessions is called', () => {
		const globalManager =
			globalSessionOrchestrator.getManagerForProject() as unknown as MockSessionManager;
		const project1Manager = globalSessionOrchestrator.getManagerForProject(
			'/project1',
		) as unknown as MockSessionManager;
		const project2Manager = globalSessionOrchestrator.getManagerForProject(
			'/project2',
		) as unknown as MockSessionManager;

		// Add mock sessions
		globalManager.sessions.set('global-session', {
			id: 'global-session',
		});
		project1Manager.sessions.set('project1-session', {
			id: 'project1-session',
		});
		project2Manager.sessions.set('project2-session', {
			id: 'project2-session',
		});

		globalSessionOrchestrator.destroyProjectSessions('/project1');

		// Global and project2 sessions should remain
		expect(globalManager.sessions.size).toBe(1);
		expect(project2Manager.sessions.size).toBe(1);
		// project1 sessions should be cleared
		const newProject1Manager = globalSessionOrchestrator.getManagerForProject(
			'/project1',
		) as unknown as MockSessionManager;
		expect(newProject1Manager).not.toBe(project1Manager); // Should be a new instance
		expect(newProject1Manager.sessions.size).toBe(0);
	});

	it('should persist sessions when switching between projects', () => {
		const project1Manager = globalSessionOrchestrator.getManagerForProject(
			'/project1',
		) as unknown as MockSessionManager;
		project1Manager.sessions.set('session1', {
			id: 'session1',
			worktreePath: '/project1/main',
		});

		// Switch to project2
		const project2Manager = globalSessionOrchestrator.getManagerForProject(
			'/project2',
		) as unknown as MockSessionManager;
		project2Manager.sessions.set('session2', {
			id: 'session2',
			worktreePath: '/project2/main',
		});

		// Switch back to project1
		const project1ManagerAgain = globalSessionOrchestrator.getManagerForProject(
			'/project1',
		) as unknown as MockSessionManager;

		// Session should still exist
		expect(project1ManagerAgain).toBe(project1Manager);
		expect(project1ManagerAgain.sessions.get('session1')).toEqual({
			id: 'session1',
			worktreePath: '/project1/main',
		});
	});

	it('should get sessions for a specific project', () => {
		const project1Manager = globalSessionOrchestrator.getManagerForProject(
			'/project1',
		) as unknown as MockSessionManager;
		const project2Manager = globalSessionOrchestrator.getManagerForProject(
			'/project2',
		) as unknown as MockSessionManager;

		// Add mock sessions with different states
		project1Manager.sessions.set('session1', {
			id: 'session1',
			state: 'idle',
		});
		project1Manager.sessions.set('session2', {
			id: 'session2',
			state: 'busy',
		});
		project1Manager.sessions.set('session3', {
			id: 'session3',
			state: 'waiting',
		});
		project2Manager.sessions.set('session4', {
			id: 'session4',
			state: 'idle',
		});

		const project1Sessions =
			globalSessionOrchestrator.getProjectSessions('/project1');
		const project2Sessions =
			globalSessionOrchestrator.getProjectSessions('/project2');
		const project3Sessions =
			globalSessionOrchestrator.getProjectSessions('/project3'); // non-existent

		expect(project1Sessions).toHaveLength(3);
		expect(project2Sessions).toHaveLength(1);
		expect(project3Sessions).toHaveLength(0);

		// Verify the sessions are correct
		const project1Ids = project1Sessions.map(s => (s as MockSession).id);
		expect(project1Ids).toContain('session1');
		expect(project1Ids).toContain('session2');
		expect(project1Ids).toContain('session3');
	});
});
