import {execSync} from 'child_process';
import {join, resolve, isAbsolute, dirname} from 'path';
import {existsSync, readFileSync, statSync} from 'fs';
import {Effect} from 'effect';
import {ConfigurationData} from '../types/index.js';
import {GitError, FileSystemError, ConfigError} from '../types/errors.js';
import logger from '../utils/logger.js';

interface CachedConfig {
	config: ConfigurationData | null;
	mtime: number; // File modification time for cache validation
}

/**
 * ProjectConfigurationManager handles loading and caching of per-project configurations
 * from .ccmanager.json files in git repository roots.
 *
 * Project configs override global config on a per-field basis, allowing teams to
 * set repository-specific defaults for hooks, worktree settings, etc.
 */
export class ProjectConfigurationManager {
	private configCache: Map<string, CachedConfig> = new Map();
	private readonly PROJECT_CONFIG_FILENAME = '.ccmanager.json';

	/**
	 * Find the git repository root from any path within the repository
	 *
	 * @param fromPath - Path to start searching from (can be anywhere in the repo)
	 * @returns Effect that resolves to absolute path of git root directory
	 */
	findGitRoot(fromPath: string): Effect.Effect<string, GitError> {
		return Effect.try({
			try: () => {
				// Use git rev-parse --git-common-dir to find the .git directory
				const gitCommonDir = execSync('git rev-parse --git-common-dir', {
					cwd: fromPath,
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
				}).trim();

				// Convert .git directory path to repository root
				// Use path.isAbsolute() for cross-platform compatibility (Windows/Unix)
				const gitDirPath = isAbsolute(gitCommonDir)
					? gitCommonDir
					: join(fromPath, gitCommonDir);

				// Git root is the parent of the .git directory
				// For worktrees, git-common-dir points to main .git, so we get the correct root
				// Normalize the path to avoid cache key issues with /path/to/repo/.git/..
				const gitRoot = resolve(dirname(gitDirPath));

				return gitRoot;
			},
			catch: (error: unknown) => {
				return new GitError({
					message: `Failed to find git root from ${fromPath}: ${error instanceof Error ? error.message : String(error)}`,
				});
			},
		});
	}

	/**
	 * Load project configuration from .ccmanager.json in git root
	 *
	 * Handles caching with mtime validation to avoid repeated file reads.
	 * Gracefully handles missing files, malformed JSON, and validation errors.
	 *
	 * @param gitRoot - Absolute path to git repository root
	 * @returns Effect that resolves to ConfigurationData or null if not found/invalid
	 */
	loadProjectConfigEffect(
		gitRoot: string,
	): Effect.Effect<ConfigurationData | null, FileSystemError | ConfigError> {
		return Effect.gen(this, function* () {
			const configPath = join(gitRoot, this.PROJECT_CONFIG_FILENAME);

			// Check if file exists
			if (!existsSync(configPath)) {
				return null;
			}

			// Get file mtime for cache validation
			const stats = yield* Effect.try({
				try: () => statSync(configPath),
				catch: (error: unknown) => {
					return new FileSystemError({
						operation: 'stat',
						path: configPath,
						message: `Failed to stat config file: ${error instanceof Error ? error.message : String(error)}`,
					});
				},
			});

			const mtime = stats.mtimeMs;

			// Check cache
			const cached = this.configCache.get(gitRoot);
			if (cached && cached.mtime === mtime) {
				return cached.config;
			}

			// Load and parse config file
			const configResult = yield* Effect.either(
				Effect.try({
					try: () => {
						const content = readFileSync(configPath, 'utf-8');
						const parsed = JSON.parse(content) as ConfigurationData;
						return parsed;
					},
					catch: (error: unknown) => {
						return new ConfigError({
							message: `Invalid project configuration: ${error instanceof Error ? error.message : String(error)}`,
							path: configPath,
						});
					},
				}),
			);

			// Gracefully fall back to global configuration on malformed JSON
			if (configResult._tag === 'Left') {
				logger.warn(
					`Failed to load project config from ${configPath}: ${configResult.left.message}`,
				);
				logger.warn('Falling back to global configuration');
				return null;
			}

			const config = configResult.right;

			// Validate config structure (basic validation)
			const validatedConfig = this.validateConfig(config);

			if (!validatedConfig) {
				logger.warn(
					`Project config at ${configPath} failed validation, falling back to global configuration`,
				);
				return null;
			}

			// Cache the loaded config
			this.configCache.set(gitRoot, {
				config: validatedConfig,
				mtime,
			});

			return validatedConfig;
		});
	}

	/**
	 * Validate project configuration structure
	 *
	 * Performs basic validation to ensure the config object has valid structure.
	 * Invalid configs are rejected to prevent issues when merging with global config.
	 *
	 * @param config - Configuration data to validate
	 * @returns Validated config or null if invalid
	 */
	private validateConfig(
		config: ConfigurationData,
	): ConfigurationData | null {
		// Config should be an object
		if (typeof config !== 'object' || config === null) {
			return null;
		}

		// If specific fields are present, validate their types
		// Check for plain objects (not arrays) since typeof [] === 'object'
		if (
			config.shortcuts !== undefined &&
			(typeof config.shortcuts !== 'object' ||
				config.shortcuts === null ||
				Array.isArray(config.shortcuts))
		) {
			logger.warn('Invalid shortcuts configuration in project config');
			return null;
		}

		if (
			config.statusHooks !== undefined &&
			(typeof config.statusHooks !== 'object' ||
				config.statusHooks === null ||
				Array.isArray(config.statusHooks))
		) {
			logger.warn('Invalid statusHooks configuration in project config');
			return null;
		}

		if (
			config.worktreeHooks !== undefined &&
			(typeof config.worktreeHooks !== 'object' ||
				config.worktreeHooks === null ||
				Array.isArray(config.worktreeHooks))
		) {
			logger.warn('Invalid worktreeHooks configuration in project config');
			return null;
		}

		if (
			config.worktree !== undefined &&
			(typeof config.worktree !== 'object' ||
				config.worktree === null ||
				Array.isArray(config.worktree))
		) {
			logger.warn('Invalid worktree configuration in project config');
			return null;
		}

		if (
			config.command !== undefined &&
			(typeof config.command !== 'object' ||
				config.command === null ||
				Array.isArray(config.command))
		) {
			logger.warn('Invalid command configuration in project config');
			return null;
		}

		if (
			config.commandPresets !== undefined &&
			(typeof config.commandPresets !== 'object' ||
				config.commandPresets === null ||
				Array.isArray(config.commandPresets))
		) {
			logger.warn('Invalid commandPresets configuration in project config');
			return null;
		}

		if (
			config.autoApproval !== undefined &&
			(typeof config.autoApproval !== 'object' ||
				config.autoApproval === null ||
				Array.isArray(config.autoApproval))
		) {
			logger.warn('Invalid autoApproval configuration in project config');
			return null;
		}

		return config;
	}

	/**
	 * Invalidate cached configuration for a specific git root
	 *
	 * Use this when you know the project config file has changed
	 * and want to force a reload on next access.
	 *
	 * @param gitRoot - Git root path to invalidate
	 */
	invalidateCache(gitRoot: string): void {
		this.configCache.delete(gitRoot);
	}

	/**
	 * Clear all cached configurations
	 *
	 * Use this to free memory or during testing.
	 */
	clearCache(): void {
		this.configCache.clear();
	}
}

// Export singleton instance
export const projectConfigurationManager = new ProjectConfigurationManager();
