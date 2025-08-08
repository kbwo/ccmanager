import {describe, it, expect, vi} from 'vitest';
import {executeStatusHook} from './hookExecutor.js';
import {mkdtemp, rm, readFile} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';
import type {SessionState, Session} from '../types/index.js';
import {configurationManager} from '../services/configurationManager.js';
import {WorktreeService} from '../services/worktreeService.js';

// Mock the configurationManager
vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getStatusHooks: vi.fn(),
	},
}));

// Mock the WorktreeService
vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn(),
}));

describe('executeStatusHook', () => {
	it('should wait for hook execution to complete', async () => {
		// Arrange
		const tmpDir = await mkdtemp(join(tmpdir(), 'status-hook-test-'));
		const outputFile = join(tmpDir, 'status-hook-output.txt');

		const mockSession = {
			id: 'test-session-123',
			worktreePath: tmpDir, // Use tmpDir as the worktree path
			process: {} as unknown as Session['process'],
			terminal: {} as unknown as Session['terminal'],
			output: [],
			outputHistory: [],
			state: 'idle' as SessionState,
			stateCheckInterval: undefined,
			lastActivity: new Date(),
			isActive: true,
		} satisfies Session;

		// Mock WorktreeService to return a worktree with the tmpDir path
		vi.mocked(WorktreeService).mockImplementation(
			() =>
				({
					getWorktrees: vi.fn(() => [
						{
							path: tmpDir,
							branch: 'test-branch',
							isMainWorktree: false,
							hasSession: true,
						},
					]),
				}) as unknown as InstanceType<typeof WorktreeService>,
		);

		// Configure mock to return a hook that writes to a file with delay
		vi.mocked(configurationManager.getStatusHooks).mockReturnValue({
			busy: {
				enabled: true,
				command: `sleep 0.1 && echo "Hook executed" > "${outputFile}"`,
			},
			idle: {enabled: false, command: ''},
			waiting_input: {enabled: false, command: ''},
		});

		try {
			// Act - execute the hook and await it
			await executeStatusHook('idle', 'busy', mockSession);

			// Assert - file should exist because we awaited the hook
			const content = await readFile(outputFile, 'utf-8');
			expect(content.trim()).toBe('Hook executed');
		} finally {
			// Cleanup
			await rm(tmpDir, {recursive: true});
		}
	});

	it('should handle hook execution errors gracefully', async () => {
		// Arrange
		const tmpDir = await mkdtemp(join(tmpdir(), 'status-hook-test-'));

		const mockSession = {
			id: 'test-session-456',
			worktreePath: tmpDir, // Use tmpDir as the worktree path
			process: {} as unknown as Session['process'],
			terminal: {} as unknown as Session['terminal'],
			output: [],
			outputHistory: [],
			state: 'idle' as SessionState,
			stateCheckInterval: undefined,
			lastActivity: new Date(),
			isActive: true,
		} satisfies Session;

		// Mock WorktreeService to return a worktree with the tmpDir path
		vi.mocked(WorktreeService).mockImplementation(
			() =>
				({
					getWorktrees: vi.fn(() => [
						{
							path: tmpDir,
							branch: 'test-branch',
							isMainWorktree: false,
							hasSession: true,
						},
					]),
				}) as unknown as InstanceType<typeof WorktreeService>,
		);

		// Configure mock to return a hook that fails
		vi.mocked(configurationManager.getStatusHooks).mockReturnValue({
			busy: {
				enabled: true,
				command: 'exit 1',
			},
			idle: {enabled: false, command: ''},
			waiting_input: {enabled: false, command: ''},
		});

		try {
			// Act & Assert - should not throw even when hook fails
			await expect(
				executeStatusHook('idle', 'busy', mockSession),
			).resolves.toBeUndefined();
		} finally {
			// Cleanup
			await rm(tmpDir, {recursive: true});
		}
	});

	it('should not execute disabled hooks', async () => {
		// Arrange
		const tmpDir = await mkdtemp(join(tmpdir(), 'status-hook-test-'));
		const outputFile = join(tmpDir, 'should-not-exist.txt');

		const mockSession = {
			id: 'test-session-789',
			worktreePath: tmpDir, // Use tmpDir as the worktree path
			process: {} as unknown as Session['process'],
			terminal: {} as unknown as Session['terminal'],
			output: [],
			outputHistory: [],
			state: 'idle' as SessionState,
			stateCheckInterval: undefined,
			lastActivity: new Date(),
			isActive: true,
		} satisfies Session;

		// Mock WorktreeService to return a worktree with the tmpDir path
		vi.mocked(WorktreeService).mockImplementation(
			() =>
				({
					getWorktrees: vi.fn(() => [
						{
							path: tmpDir,
							branch: 'test-branch',
							isMainWorktree: false,
							hasSession: true,
						},
					]),
				}) as unknown as InstanceType<typeof WorktreeService>,
		);

		// Configure mock to return a disabled hook
		vi.mocked(configurationManager.getStatusHooks).mockReturnValue({
			busy: {
				enabled: false,
				command: `echo "Should not run" > "${outputFile}"`,
			},
			idle: {enabled: false, command: ''},
			waiting_input: {enabled: false, command: ''},
		});

		try {
			// Act
			await executeStatusHook('idle', 'busy', mockSession);

			// Assert - file should not exist because hook was disabled
			await expect(readFile(outputFile, 'utf-8')).rejects.toThrow();
		} finally {
			// Cleanup
			await rm(tmpDir, {recursive: true});
		}
	});
});
