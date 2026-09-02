import {SessionManager} from './sessionManager.js';
import {Session} from '../types/index.js';
import {getCurrentRepositoryRoot} from '../utils/gitUtils.js';
import {sessionRestoreStore} from './sessionRestoreStore.js';

class GlobalSessionOrchestrator {
	private static instance: GlobalSessionOrchestrator;
	private projectManagers: Map<string, SessionManager> = new Map();
	private globalManager: SessionManager;

	private constructor() {
		// Create a global session manager for single-project mode
		this.globalManager = new SessionManager();
		this.trackSessionsForRestore(this.globalManager);
	}

	static getInstance(): GlobalSessionOrchestrator {
		if (!GlobalSessionOrchestrator.instance) {
			GlobalSessionOrchestrator.instance = new GlobalSessionOrchestrator();
		}
		return GlobalSessionOrchestrator.instance;
	}

	getManagerForProject(projectPath?: string): SessionManager {
		// If no project path, return the global manager (single-project mode)
		if (!projectPath) {
			return this.globalManager;
		}

		// Get or create a session manager for this project
		let manager = this.projectManagers.get(projectPath);
		if (!manager) {
			manager = new SessionManager();
			this.trackSessionsForRestore(manager, projectPath);
			this.projectManagers.set(projectPath, manager);
		}
		return manager;
	}

	getAllActiveSessions(): Session[] {
		const sessions: Session[] = [];

		// Get sessions from global manager
		sessions.push(...this.globalManager.getAllSessions());

		// Get sessions from all project managers
		for (const manager of this.projectManagers.values()) {
			sessions.push(...manager.getAllSessions());
		}

		return sessions;
	}

	destroyAllSessions(): void {
		// Every caller of this method is quitting ccmanager, and the sessions
		// being torn down here are exactly the ones the next run should offer to
		// restore. Stop updating the durable record first so the teardown does
		// not erase them.
		sessionRestoreStore.suspendTracking();

		// Destroy sessions in global manager
		this.globalManager.destroy();

		// Destroy sessions in all project managers
		for (const manager of this.projectManagers.values()) {
			manager.destroy();
		}

		// Clear the project managers map
		this.projectManagers.clear();
	}

	destroyProjectSessions(projectPath: string): void {
		const manager = this.projectManagers.get(projectPath);
		if (manager) {
			manager.destroy();
			this.projectManagers.delete(projectPath);
		}
	}

	getProjectPaths(): string[] {
		return Array.from(this.projectManagers.keys());
	}

	getProjectSessions(projectPath: string): Session[] {
		const manager = this.projectManagers.get(projectPath);
		if (manager) {
			return manager.getAllSessions();
		}
		return [];
	}

	/**
	 * Keep the durable session record in step with one manager's sessions, so a
	 * later ccmanager run can offer to launch them again. This orchestrator is
	 * the only place that knows which project a manager belongs to, which is why
	 * the wiring lives here rather than inside SessionManager.
	 */
	private trackSessionsForRestore(
		manager: SessionManager,
		projectPath?: string,
	): void {
		manager.on('sessionCreated', (session: Session) => {
			sessionRestoreStore.record({
				id: session.id,
				// The global manager has no project path of its own: its sessions
				// belong to the repository ccmanager was started in.
				projectPath: projectPath ?? getCurrentRepositoryRoot(),
				worktreePath: session.worktreePath,
				presetId: session.presetId,
				sessionName: session.sessionName,
				devcontainerConfig: session.devcontainerConfig,
				ownerPid: process.pid,
				createdAt: Date.now(),
			});
		});

		manager.on('sessionRenamed', (session: Session) => {
			sessionRestoreStore.rename(session.id, session.sessionName);
		});

		// A destroyed session is one that should stay gone: either the user
		// killed it or the launched command exited on its own. The exception is
		// the teardown on quit, which suspends tracking beforehand.
		manager.on('sessionDestroyed', (session: Session) => {
			sessionRestoreStore.forget(session.id);
		});
	}
}

export const globalSessionOrchestrator =
	GlobalSessionOrchestrator.getInstance();
