/**
 * @fileoverview Utilities for Claude Code directory and project path handling.
 * Provides functions to get Claude configuration directories respecting the
 * CLAUDE_CONFIG_DIR environment variable and convert worktree paths to Claude's
 * project naming convention.
 */

import path from 'path';
import os from 'os';
import {promises as fs} from 'fs';
import {Effect, Either} from 'effect';
import {ValidationError, FileSystemError} from '../types/errors.js';

/**
 * Get the Claude directory path using Either for synchronous validation
 * Returns Either with ValidationError if HOME directory cannot be determined
 */
export function getClaudeDir(): Either.Either<string, ValidationError> {
	const envConfigDir = process.env['CLAUDE_CONFIG_DIR'];
	if (envConfigDir) {
		return Either.right(envConfigDir.trim());
	}

	// Try to get home directory
	try {
		const homeDir = os.homedir();
		if (!homeDir) {
			return Either.left(
				new ValidationError({
					field: 'HOME',
					constraint: 'must be set',
					receivedValue: undefined,
				}),
			);
		}
		return Either.right(path.join(homeDir, '.claude'));
	} catch {
		return Either.left(
			new ValidationError({
				field: 'HOME',
				constraint: 'must be accessible',
				receivedValue: undefined,
			}),
		);
	}
}

/**
 * Get the Claude projects directory path using Either
 * Propagates ValidationError from getClaudeDir
 */
export function getClaudeProjectsDir(): Either.Either<string, ValidationError> {
	return Either.map(getClaudeDir(), dir => path.join(dir, 'projects'));
}

/**
 * Convert a worktree path to Claude's project naming convention
 * Pure transformation, cannot fail
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

/**
 * Check if Claude project directory exists using Effect
 * Returns false for ENOENT, fails with FileSystemError for other errors
 */
export function claudeDirExists(
	projectName: string,
): Effect.Effect<boolean, FileSystemError> {
	const claudeDirEither = getClaudeProjectsDir();

	if (Either.isLeft(claudeDirEither)) {
		// If we can't determine the projects directory, return false
		return Effect.succeed(false);
	}

	const projectPath = path.join(claudeDirEither.right, projectName);

	return Effect.catchAll(
		Effect.tryPromise({
			try: () => fs.stat(projectPath).then(() => true),
			catch: error => error,
		}),
		error => {
			// ENOENT means directory doesn't exist, which is not an error
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return Effect.succeed(false);
			}

			// Other errors are filesystem issues
			return Effect.fail(
				new FileSystemError({
					operation: 'stat',
					path: projectPath,
					cause: error instanceof Error ? error.message : String(error),
				}),
			);
		},
	);
}

/**
 * Legacy string-returning wrapper for getClaudeDir
 * @deprecated Use getClaudeDir with Either instead
 * Throws if HOME cannot be determined
 */
export function getClaudeDirLegacy(): string {
	return Either.getOrThrow(getClaudeDir());
}

/**
 * Legacy string-returning wrapper for getClaudeProjectsDir
 * @deprecated Use getClaudeProjectsDir with Either instead
 * Throws if HOME cannot be determined
 */
export function getClaudeProjectsDirLegacy(): string {
	return Either.getOrThrow(getClaudeProjectsDir());
}
