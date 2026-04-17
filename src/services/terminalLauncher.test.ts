import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import type {EventEmitter} from 'events';

const mockSpawn = vi.fn();

vi.mock('child_process', () => ({
	spawn: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
	},
}));

import {launchTerminal} from './terminalLauncher.js';

type FakeChild = Pick<EventEmitter, 'on'> & {unref: () => void};

function makeFakeChild(): FakeChild {
	return {
		on: vi.fn().mockReturnThis() as unknown as EventEmitter['on'],
		unref: vi.fn(),
	};
}

describe('terminalLauncher', () => {
	const originalPlatform = process.platform;
	const originalEnv = process.env['CCMANAGER_TERMINAL'];

	beforeEach(() => {
		mockSpawn.mockReset();
		mockSpawn.mockReturnValue(makeFakeChild());
		delete process.env['CCMANAGER_TERMINAL'];
	});

	afterEach(() => {
		Object.defineProperty(process, 'platform', {value: originalPlatform});
		if (originalEnv === undefined) {
			delete process.env['CCMANAGER_TERMINAL'];
		} else {
			process.env['CCMANAGER_TERMINAL'] = originalEnv;
		}
	});

	it('launches Terminal.app on macOS', () => {
		Object.defineProperty(process, 'platform', {value: 'darwin'});

		const result = launchTerminal('/tmp/worktree');

		expect(result.success).toBe(true);
		expect(mockSpawn).toHaveBeenCalledWith(
			'open',
			['-a', 'Terminal', '/tmp/worktree'],
			expect.objectContaining({cwd: '/tmp/worktree', detached: true}),
		);
	});

	it('launches x-terminal-emulator on linux', () => {
		Object.defineProperty(process, 'platform', {value: 'linux'});

		const result = launchTerminal('/home/user/project');

		expect(result.success).toBe(true);
		expect(mockSpawn).toHaveBeenCalledWith(
			'x-terminal-emulator',
			['--working-directory', '/home/user/project'],
			expect.objectContaining({detached: true}),
		);
	});

	it('launches cmd.exe via start on win32', () => {
		Object.defineProperty(process, 'platform', {value: 'win32'});

		const result = launchTerminal('C:\\repo');

		expect(result.success).toBe(true);
		expect(mockSpawn).toHaveBeenCalledWith(
			'cmd.exe',
			expect.arrayContaining(['/c', 'start']),
			expect.objectContaining({detached: true}),
		);
	});

	it('respects CCMANAGER_TERMINAL override with {cwd} substitution', () => {
		Object.defineProperty(process, 'platform', {value: 'linux'});
		process.env['CCMANAGER_TERMINAL'] = 'alacritty --working-directory {cwd}';

		const result = launchTerminal('/tmp/wt');

		expect(result.success).toBe(true);
		expect(mockSpawn).toHaveBeenCalledWith(
			'alacritty',
			['--working-directory', '/tmp/wt'],
			expect.objectContaining({cwd: '/tmp/wt'}),
		);
	});

	it('returns an error on unsupported platform with no override', () => {
		Object.defineProperty(process, 'platform', {value: 'sunos'});

		const result = launchTerminal('/tmp/wt');

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/CCMANAGER_TERMINAL/);
		expect(mockSpawn).not.toHaveBeenCalled();
	});

	it('captures spawn errors synchronously', () => {
		Object.defineProperty(process, 'platform', {value: 'linux'});
		mockSpawn.mockImplementationOnce(() => {
			throw new Error('ENOENT');
		});

		const result = launchTerminal('/tmp/wt');

		expect(result.success).toBe(false);
		expect(result.error).toContain('ENOENT');
	});
});
