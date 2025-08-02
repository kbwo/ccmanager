import {SessionManager} from './sessionManager.js';
import {Session} from '../types/index.js';

class GlobalSessionOrchestrator {
	private static instance: GlobalSessionOrchestrator;
	private projectManagers: Map<string, SessionManager> = new Map();
	private globalManager: SessionManager;

	private constructor() {
		// Create a global session manager for single-project mode
		this.globalManager = new SessionManager();
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

	getProjectSessions(projectPath: string): Session[] {
		const manager = this.projectManagers.get(projectPath);
		if (manager) {
			return manager.getAllSessions();
		}
		return [];
	}
}

export const globalSessionOrchestrator =
	GlobalSessionOrchestrator.getInstance();
