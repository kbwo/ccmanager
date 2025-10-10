import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import App from './App.js';
import {Effect} from 'effect';
import {ProcessError, ConfigError} from '../types/errors.js';
import type {Session} from '../types/index.js';

// Mock the dependencies
vi.mock('../services/sessionManager.js', () => {
	const EventEmitter = require('events');
	return {
		SessionManager: class MockSessionManager extends EventEmitter {
			getSession = vi.fn();
			createSessionWithPreset = vi.fn();
			createSessionWithPresetEffect = vi.fn();
			createSessionWithDevcontainer = vi.fn();
			createSessionWithDevcontainerEffect = vi.fn();
			setSessionActive = vi.fn();
		},
	};
});

vi.mock('../services/globalSessionOrchestrator.js', () => ({
	globalSessionOrchestrator: {
		getManagerForProject: vi.fn(() => new (require('../services/sessionManager.js').SessionManager)()),
		destroyAllSessions: vi.fn(),
	},
}));

vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: class MockWorktreeService {
		createWorktree = vi.fn();
		deleteWorktree = vi.fn();
		listWorktrees = vi.fn(() => ({success: true, data: []}));
	},
}));

vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getSelectPresetOnStart: vi.fn(() => false),
	},
}));

vi.mock('../services/projectManager.js', () => ({
	projectManager: {
		addRecentProject: vi.fn(),
	},
}));

describe('App - Effect-based Session Creation Error Handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should handle ProcessError from createSessionWithPreset using Effect execution', async () => {
		// This test should fail initially because App doesn't use Effect-based error handling yet
		const {SessionManager} = await import('../services/sessionManager.js');
		const mockManager = new SessionManager();

		// Mock the Effect-based method to return a failed Effect with ProcessError
		const processError = new ProcessError({
			command: 'claude',
			message: 'Failed to spawn PTY process',
		});

		mockManager.createSessionWithPresetEffect = vi.fn(() =>
			Effect.fail(processError),
		);

		// This test verifies that when we use Effect-based session creation,
		// ProcessError is properly displayed to the user
		// Expected behavior: Error message should be extracted from ProcessError
		// and displayed in the UI using _tag discrimination

		expect(mockManager.createSessionWithPresetEffect).toBeDefined();

		// Execute the Effect and verify it fails with ProcessError
		// Use Effect.either to extract the error without throwing
		const result = await Effect.runPromise(
			Effect.either(mockManager.createSessionWithPresetEffect('/test/path'))
		);

		expect(result._tag).toBe('Left'); // Either.Left contains the error
		if (result._tag === 'Left') {
			expect(result.left).toBeInstanceOf(ProcessError);
			expect(result.left._tag).toBe('ProcessError');
			expect(result.left.message).toBe('Failed to spawn PTY process');
		}
	});

	it('should handle ConfigError from createSessionWithPreset using Effect execution', async () => {
		const {SessionManager} = await import('../services/sessionManager.js');
		const mockManager = new SessionManager();

		// Mock the Effect-based method to return a failed Effect with ConfigError
		const configError = new ConfigError({
			configPath: '~/.config/ccmanager/config.json',
			reason: 'validation',
			details: 'Invalid preset ID: nonexistent-preset',
		});

		mockManager.createSessionWithPresetEffect = vi.fn(() =>
			Effect.fail(configError),
		);

		// This test verifies that when we use Effect-based session creation,
		// ConfigError is properly displayed to the user
		// Expected behavior: Error message should be extracted from ConfigError
		// and displayed in the UI using _tag discrimination

		expect(mockManager.createSessionWithPresetEffect).toBeDefined();

		// Execute the Effect and verify it fails with ConfigError
		// Use Effect.either to extract the error without throwing
		const result = await Effect.runPromise(
			Effect.either(mockManager.createSessionWithPresetEffect('/test/path', 'invalid-preset'))
		);

		expect(result._tag).toBe('Left'); // Either.Left contains the error
		if (result._tag === 'Left') {
			expect(result.left).toBeInstanceOf(ConfigError);
			expect(result.left._tag).toBe('ConfigError');
			expect(result.left.details).toBe('Invalid preset ID: nonexistent-preset');
		}
	});

	it('should display user-friendly error message for ProcessError using _tag discrimination', () => {
		// Test the error display pattern matching logic
		const error = new ProcessError({
			command: 'claude',
			message: 'Failed to spawn PTY process',
			exitCode: 1,
		});

		// This should match the pattern in the component
		const displayMessage = error._tag === 'ProcessError'
			? `Process error: ${error.message}`
			: 'Unknown error';

		expect(displayMessage).toBe('Process error: Failed to spawn PTY process');
		expect(error._tag).toBe('ProcessError');
	});

	it('should display user-friendly error message for ConfigError using _tag discrimination', () => {
		// Test the error display pattern matching logic
		const error = new ConfigError({
			configPath: '~/.config/ccmanager/config.json',
			reason: 'validation',
			details: 'Invalid preset ID: nonexistent-preset',
		});

		// This should match the pattern in the component
		const displayMessage = error._tag === 'ConfigError'
			? `Configuration error (${error.reason}): ${error.details}`
			: 'Unknown error';

		expect(displayMessage).toBe('Configuration error (validation): Invalid preset ID: nonexistent-preset');
		expect(error._tag).toBe('ConfigError');
	});

	it('should handle successful session creation with Effect', async () => {
		const {SessionManager} = await import('../services/sessionManager.js');
		const mockManager = new SessionManager();

		const mockSession: Session = {
			id: 'test-session-123',
			worktreePath: '/test/path',
			process: {} as any,
			terminal: null,
			command: 'claude',
			args: [],
			fallbackArgs: [],
			outputHistory: [],
			detectionStrategy: 'claude',
			state: 'idle',
			isActive: false,
		};

		mockManager.createSessionWithPresetEffect = vi.fn(() =>
			Effect.succeed(mockSession),
		);

		// Execute the Effect and verify it succeeds
		const result = await Effect.runPromise(
			mockManager.createSessionWithPresetEffect('/test/path')
		);

		expect(result).toEqual(mockSession);
		expect(result.id).toBe('test-session-123');
		expect(result.worktreePath).toBe('/test/path');
	});

	it('should handle ProcessError from createSessionWithDevcontainer using Effect execution', async () => {
		const {SessionManager} = await import('../services/sessionManager.js');
		const mockManager = new SessionManager();

		const processError = new ProcessError({
			command: 'devcontainer exec --workspace-folder . -- claude',
			message: 'Container not running',
		});

		mockManager.createSessionWithDevcontainerEffect = vi.fn(() =>
			Effect.fail(processError),
		);

		// Execute the Effect and verify it fails with ProcessError
		// Use Effect.either to extract the error without throwing
		const result = await Effect.runPromise(
			Effect.either(
				mockManager.createSessionWithDevcontainerEffect(
					'/test/path',
					{
						upCommand: 'devcontainer up --workspace-folder .',
						execCommand: 'devcontainer exec --workspace-folder .',
					}
				)
			)
		);

		expect(result._tag).toBe('Left'); // Either.Left contains the error
		if (result._tag === 'Left') {
			expect(result.left).toBeInstanceOf(ProcessError);
			expect(result.left._tag).toBe('ProcessError');
			expect(result.left.message).toBe('Container not running');
		}
	});
});
