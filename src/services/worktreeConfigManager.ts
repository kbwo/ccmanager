import {isWorktreeConfigEnabled} from '../utils/worktreeConfig.js';

class WorktreeConfigManager {
	private static instance: WorktreeConfigManager;
	private isExtensionAvailable: boolean | null = null;

	private constructor() {}

	static getInstance(): WorktreeConfigManager {
		if (!WorktreeConfigManager.instance) {
			WorktreeConfigManager.instance = new WorktreeConfigManager();
		}
		return WorktreeConfigManager.instance;
	}

	initialize(gitPath?: string): void {
		this.isExtensionAvailable = isWorktreeConfigEnabled(gitPath);
	}

	isAvailable(): boolean {
		if (this.isExtensionAvailable === null) {
			throw new Error('WorktreeConfigManager not initialized');
		}
		return this.isExtensionAvailable;
	}
}

export const worktreeConfigManager = WorktreeConfigManager.getInstance();
