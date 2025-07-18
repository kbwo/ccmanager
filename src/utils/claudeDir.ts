/**
 * @fileoverview Utilities for Claude Code directory and project path handling.
 * Provides functions to get Claude configuration directories respecting the
 * CLAUDE_CONFIG_DIR environment variable and convert worktree paths to Claude's
 * project naming convention.
 */

import path from 'path';
import os from 'os';

/**
 * Get the Claude directory path, respecting CLAUDE_CONFIG_DIR environment variable
 * @returns The Claude directory path
 */
export function getClaudeDir(): string {
	const envConfigDir = process.env['CLAUDE_CONFIG_DIR'];
	if (envConfigDir) {
		return envConfigDir.trim();
	}
	// Default to ~/.claude for backward compatibility and when not set
	return path.join(os.homedir(), '.claude');
}

/**
 * Get the Claude projects directory path
 * @returns The Claude projects directory path
 */
export function getClaudeProjectsDir(): string {
	return path.join(getClaudeDir(), 'projects');
}

/**
 * Convert a worktree path to Claude's project naming convention
 * @param worktreePath The path to the worktree
 * @returns The project name used by Claude
 */
export function pathToClaudeProjectName(worktreePath: string): string {
	// Convert absolute path to Claude's project naming convention
	// Claude replaces all path separators and dots with dashes
	const resolved = path.resolve(worktreePath);
	// Handle both forward slashes (Linux/macOS) and backslashes (Windows)
	return resolved.replace(/[/\\.]/g, '-');
}
