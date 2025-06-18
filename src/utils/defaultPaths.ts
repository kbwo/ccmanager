import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Get the default CCManager directory path
 */
export function getDefaultCCManagerDir(): string {
	return path.join(os.homedir(), '.ccmanager');
}

/**
 * Get the default worktrees directory path
 */
export function getDefaultWorktreesDir(): string {
	// Check for environment variable override
	const envWorktreeDir = process.env['CCMANAGER_DEFAULT_WORKTREE_DIR'];
	if (envWorktreeDir) {
		// Handle tilde expansion manually since path.resolve doesn't expand ~
		if (envWorktreeDir.startsWith('~/')) {
			return path.join(os.homedir(), envWorktreeDir.slice(2));
		}
		return path.resolve(envWorktreeDir);
	}

	// Use default location
	return path.join(getDefaultCCManagerDir(), 'worktrees');
}

/**
 * Ensure the default directories exist, creating them if necessary
 */
export function ensureDefaultDirectories(): void {
	const ccmanagerDir = getDefaultCCManagerDir();
	const worktreesDir = getDefaultWorktreesDir();

	// Create .ccmanager directory if it doesn't exist
	if (!fs.existsSync(ccmanagerDir)) {
		fs.mkdirSync(ccmanagerDir, {recursive: true});
	}

	// Create worktrees directory if it doesn't exist
	if (!fs.existsSync(worktreesDir)) {
		fs.mkdirSync(worktreesDir, {recursive: true});
	}
}

/**
 * Check if a path is empty or whitespace-only
 */
export function isEmptyPath(path: string | undefined): boolean {
	return !path || path.trim() === '';
}
