/**
 * Integration tests for ConfigureShortcuts component with Effect-based config operations
 * Tests the service-component boundary for configuration management
 *
 * Note: These tests focus on verifying the Effect integration logic rather than
 * full component rendering due to ink-testing-library limitations with stdin
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {Effect} from 'effect';
import {configurationManager} from '../services/configurationManager.js';
import {
	FileSystemError,
	ValidationError,
	ConfigError,
} from '../types/errors.js';
import {DEFAULT_SHORTCUTS, ConfigurationData} from '../types/index.js';

describe('ConfigureShortcuts - Effect Integration Logic', () => {
	// Store original methods to restore after each test
	let originalLoadConfigEffect: typeof configurationManager.loadConfigEffect;
	let originalSetShortcutsEffect: typeof configurationManager.setShortcutsEffect;

	beforeEach(() => {
		// Save original methods
		originalLoadConfigEffect = configurationManager.loadConfigEffect;
		originalSetShortcutsEffect = configurationManager.setShortcutsEffect;
	});

	afterEach(() => {
		// Restore original methods
		configurationManager.loadConfigEffect = originalLoadConfigEffect;
		configurationManager.setShortcutsEffect = originalSetShortcutsEffect;
		vi.restoreAllMocks();
	});

	describe('Configuration Loading with Effect', () => {
		it('should handle FileSystemError when loading config fails', async () => {
			// Mock loadConfigEffect to fail with FileSystemError
			configurationManager.loadConfigEffect = vi.fn().mockReturnValue(
				Effect.fail(
					new FileSystemError({
						operation: 'read',
						path: '/config/path',
						cause: 'Permission denied',
					}),
				),
			);

			// Simulate component's useEffect loading logic
			const result = await Effect.runPromise(
				Effect.match(configurationManager.loadConfigEffect(), {
					onFailure: (err: FileSystemError | ConfigError) => ({
						type: 'error' as const,
						error: err,
					}),
					onSuccess: (config: ConfigurationData) => ({
						type: 'success' as const,
						data: config,
					}),
				}),
			);

			// Verify error was returned
			expect(result.type).toBe('error');
			if (result.type === 'error') {
				expect(result.error._tag).toBe('FileSystemError');
				if (result.error._tag === 'FileSystemError') {
					expect(result.error.operation).toBe('read');
					expect(result.error.cause).toBe('Permission denied');
				}
			}
		});

		it('should handle ConfigError when config parsing fails', async () => {
			// Mock loadConfigEffect to fail with ConfigError
			configurationManager.loadConfigEffect = vi.fn().mockReturnValue(
				Effect.fail(
					new ConfigError({
						configPath: '/config/path',
						reason: 'parse',
						details: 'Invalid JSON at line 5',
					}),
				),
			);

			// Simulate component's useEffect loading logic
			const result = await Effect.runPromise(
				Effect.match(configurationManager.loadConfigEffect(), {
					onFailure: (err: FileSystemError | ConfigError) => ({
						type: 'error' as const,
						error: err,
					}),
					onSuccess: (config: ConfigurationData) => ({
						type: 'success' as const,
						data: config,
					}),
				}),
			);

			// Verify error was returned
			expect(result.type).toBe('error');
			if (result.type === 'error') {
				expect(result.error._tag).toBe('ConfigError');
				if (result.error._tag === 'ConfigError') {
					expect(result.error.reason).toBe('parse');
					expect(result.error.details).toContain('Invalid JSON');
				}
			}
		});

		it('should load shortcuts successfully with Effect', async () => {
			// Mock loadConfigEffect to succeed
			const mockConfig: ConfigurationData = {
				shortcuts: DEFAULT_SHORTCUTS,
			};
			configurationManager.loadConfigEffect = vi
				.fn()
				.mockReturnValue(Effect.succeed(mockConfig));

			// Simulate component's useEffect loading logic
			const result = await Effect.runPromise(
				Effect.match(configurationManager.loadConfigEffect(), {
					onFailure: (err: FileSystemError | ConfigError) => ({
						type: 'error' as const,
						error: err,
					}),
					onSuccess: (config: ConfigurationData) => ({
						type: 'success' as const,
						data: config,
					}),
				}),
			);

			// Verify success
			expect(result.type).toBe('success');
			if (result.type === 'success') {
				expect(result.data.shortcuts).toEqual(DEFAULT_SHORTCUTS);
			}
		});
	});

	describe('Configuration Saving with Effect', () => {
		it('should handle FileSystemError when saving shortcuts fails', async () => {
			// Mock setShortcutsEffect to fail with FileSystemError
			configurationManager.setShortcutsEffect = vi.fn().mockReturnValue(
				Effect.fail(
					new FileSystemError({
						operation: 'write',
						path: '/config/path',
						cause: 'Disk full',
					}),
				),
			);

			// Simulate component's save logic
			const result = await Effect.runPromise(
				Effect.match(
					configurationManager.setShortcutsEffect(DEFAULT_SHORTCUTS),
					{
						onFailure: (err: FileSystemError) => ({
							type: 'error' as const,
							error: err,
						}),
						onSuccess: () => ({type: 'success' as const}),
					},
				),
			);

			// Verify error was returned
			expect(result.type).toBe('error');
			if (result.type === 'error') {
				expect(result.error._tag).toBe('FileSystemError');
				expect(result.error.operation).toBe('write');
				expect(result.error.cause).toBe('Disk full');
			}
		});

		it('should save shortcuts successfully with Effect', async () => {
			// Mock setShortcutsEffect to succeed
			configurationManager.setShortcutsEffect = vi
				.fn()
				.mockReturnValue(Effect.succeed(undefined));

			// Simulate component's save logic
			const result = await Effect.runPromise(
				Effect.match(
					configurationManager.setShortcutsEffect(DEFAULT_SHORTCUTS),
					{
						onFailure: (err: FileSystemError) => ({
							type: 'error' as const,
							error: err,
						}),
						onSuccess: () => ({type: 'success' as const}),
					},
				),
			);

			// Verify success
			expect(result.type).toBe('success');
			expect(configurationManager.setShortcutsEffect).toHaveBeenCalledWith(
				DEFAULT_SHORTCUTS,
			);
		});
	});

	describe('Error Display with TaggedError', () => {
		it('should format FileSystemError using _tag discrimination', () => {
			const error = new FileSystemError({
				operation: 'write',
				path: '/test/path',
				cause: 'Test error',
			});

			// Verify error structure
			expect(error._tag).toBe('FileSystemError');
			expect(error.operation).toBe('write');
			expect(error.path).toBe('/test/path');
			expect(error.cause).toBe('Test error');

			// Test formatError function pattern
			const formatError = (err: FileSystemError): string => {
				switch (err._tag) {
					case 'FileSystemError':
						return `File ${err.operation} failed for ${err.path}: ${err.cause}`;
				}
			};

			const formatted = formatError(error);
			expect(formatted).toContain('write');
			expect(formatted).toContain('/test/path');
			expect(formatted).toContain('Test error');
		});

		it('should format ConfigError using _tag discrimination', () => {
			const error = new ConfigError({
				configPath: '/config/path',
				reason: 'parse',
				details: 'Invalid JSON',
			});

			// Verify error structure
			expect(error._tag).toBe('ConfigError');
			expect(error.reason).toBe('parse');
			expect(error.details).toBe('Invalid JSON');

			// Test formatError function pattern
			const formatError = (err: ConfigError): string => {
				switch (err._tag) {
					case 'ConfigError':
						return `Configuration error (${err.reason}): ${err.details}`;
				}
			};

			const formatted = formatError(error);
			expect(formatted).toContain('parse');
			expect(formatted).toContain('Invalid JSON');
		});

		it('should format ValidationError using _tag discrimination', () => {
			const error = new ValidationError({
				field: 'shortcut',
				constraint: 'must use modifier key',
				receivedValue: 'a',
			});

			// Verify error structure
			expect(error._tag).toBe('ValidationError');
			expect(error.field).toBe('shortcut');
			expect(error.constraint).toBe('must use modifier key');

			// Test formatError function pattern
			const formatError = (err: ValidationError): string => {
				switch (err._tag) {
					case 'ValidationError':
						return `Validation failed for ${err.field}: ${err.constraint}`;
				}
			};

			const formatted = formatError(error);
			expect(formatted).toContain('shortcut');
			expect(formatted).toContain('must use modifier key');
		});
	});

	describe('Effect.match usage patterns', () => {
		it('should use Effect.match for type-safe error handling', async () => {
			// Mock setShortcutsEffect to fail
			configurationManager.setShortcutsEffect = vi.fn().mockReturnValue(
				Effect.fail(
					new FileSystemError({
						operation: 'write',
						path: '/config/path',
						cause: 'Test error',
					}),
				),
			);

			// Use Effect.match pattern from component
			const result = await Effect.runPromise(
				Effect.match(
					configurationManager.setShortcutsEffect(DEFAULT_SHORTCUTS),
					{
						onFailure: (err: FileSystemError) => ({
							type: 'error' as const,
							error: err,
						}),
						onSuccess: () => ({type: 'success' as const}),
					},
				),
			);

			// Verify error handling without crashing
			expect(result).toBeDefined();
			expect(result.type).toBe('error');
		});

		it('should use Effect.match to handle success case', async () => {
			// Mock setShortcutsEffect to succeed
			configurationManager.setShortcutsEffect = vi
				.fn()
				.mockReturnValue(Effect.succeed(undefined));

			// Use Effect.match pattern from component
			const result = await Effect.runPromise(
				Effect.match(
					configurationManager.setShortcutsEffect(DEFAULT_SHORTCUTS),
					{
						onFailure: (err: FileSystemError) => ({
							type: 'error' as const,
							error: err,
						}),
						onSuccess: () => ({type: 'success' as const}),
					},
				),
			);

			// Verify success handling
			expect(result.type).toBe('success');
		});
	});

	describe('Effect composition and error recovery', () => {
		it('should compose multiple Effects for load-then-save workflow', async () => {
			// Mock both load and save to succeed
			const mockConfig: ConfigurationData = {
				shortcuts: DEFAULT_SHORTCUTS,
			};
			configurationManager.loadConfigEffect = vi
				.fn()
				.mockReturnValue(Effect.succeed(mockConfig));
			configurationManager.setShortcutsEffect = vi
				.fn()
				.mockReturnValue(Effect.succeed(undefined));

			// Compose load and save operations
			const workflow = Effect.flatMap(
				configurationManager.loadConfigEffect(),
				config => {
					const updatedShortcuts = config.shortcuts || DEFAULT_SHORTCUTS;
					return configurationManager.setShortcutsEffect(updatedShortcuts);
				},
			);

			// Execute composed effect
			const result = await Effect.runPromise(
				Effect.match(workflow, {
					onFailure: (err: FileSystemError | ConfigError) => ({
						type: 'error' as const,
						error: err,
					}),
					onSuccess: () => ({type: 'success' as const}),
				}),
			);

			// Verify both operations were called
			expect(result.type).toBe('success');
			expect(configurationManager.loadConfigEffect).toHaveBeenCalled();
			expect(configurationManager.setShortcutsEffect).toHaveBeenCalled();
		});

		it('should handle error in composed Effect chain', async () => {
			// Mock load to fail
			configurationManager.loadConfigEffect = vi.fn().mockReturnValue(
				Effect.fail(
					new FileSystemError({
						operation: 'read',
						path: '/config/path',
						cause: 'File not found',
					}),
				),
			);
			configurationManager.setShortcutsEffect = vi
				.fn()
				.mockReturnValue(Effect.succeed(undefined));

			// Compose load and save operations
			const workflow = Effect.flatMap(
				configurationManager.loadConfigEffect(),
				config => {
					const updatedShortcuts = config.shortcuts || DEFAULT_SHORTCUTS;
					return configurationManager.setShortcutsEffect(updatedShortcuts);
				},
			);

			// Execute composed effect
			const result = await Effect.runPromise(
				Effect.match(workflow, {
					onFailure: (err: FileSystemError | ConfigError) => ({
						type: 'error' as const,
						error: err,
					}),
					onSuccess: () => ({type: 'success' as const}),
				}),
			);

			// Verify error short-circuits the chain
			expect(result.type).toBe('error');
			expect(configurationManager.loadConfigEffect).toHaveBeenCalled();
			// Save should NOT be called because load failed
			expect(configurationManager.setShortcutsEffect).not.toHaveBeenCalled();
		});
	});
});
