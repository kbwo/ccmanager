import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {supportsUnicode} from './terminalCapabilities.js';

describe('terminalCapabilities', () => {
	// Store original environment variables
	const originalEnv = {...process.env};
	const originalStdout = {...process.stdout};
	const originalPlatform = process.platform;

	beforeEach(() => {
		// Reset environment before each test
		vi.resetModules();
	});

	afterEach(() => {
		// Restore original environment
		process.env = {...originalEnv};
		Object.assign(process.stdout, originalStdout);

		// Restore platform if it was modified
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			writable: true,
			configurable: true,
		});

		vi.restoreAllMocks();
	});

	describe('supportsUnicode', () => {
		it('should return true when TERM environment variable indicates Unicode support', () => {
			process.env.TERM = 'xterm-256color';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return true when TERM is set to xterm', () => {
			process.env.TERM = 'xterm';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return true when TERM is screen with Unicode support', () => {
			process.env.TERM = 'screen-256color';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return true when TERM is alacritty', () => {
			process.env.TERM = 'alacritty';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return true when LANG indicates UTF-8 encoding', () => {
			delete process.env.TERM;
			process.env.LANG = 'en_US.UTF-8';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return true when LC_ALL indicates UTF-8 encoding', () => {
			delete process.env.TERM;
			delete process.env.LANG;
			process.env.LC_ALL = 'en_US.UTF-8';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return false when TERM is dumb', () => {
			process.env.TERM = 'dumb';
			expect(supportsUnicode()).toBe(false);
		});

		it('should return false when TERM is linux without Unicode support', () => {
			process.env.TERM = 'linux';
			delete process.env.LANG;
			delete process.env.LC_ALL;
			expect(supportsUnicode()).toBe(false);
		});

		it('should return false when no Unicode indicators are present', () => {
			delete process.env.TERM;
			delete process.env.LANG;
			delete process.env.LC_ALL;
			expect(supportsUnicode()).toBe(false);
		});

		it('should return true on Windows when WT_SESSION is set (Windows Terminal)', () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				writable: true,
			});
			process.env.WT_SESSION = 'some-session-id';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return false on Windows without Windows Terminal markers', () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				writable: true,
			});
			delete process.env.WT_SESSION;
			delete process.env.TERM;
			expect(supportsUnicode()).toBe(false);
		});

		it('should return true when CI environment variable is set and LANG is UTF-8', () => {
			process.env.CI = 'true';
			process.env.LANG = 'en_US.UTF-8';
			expect(supportsUnicode()).toBe(true);
		});

		it('should return false when TERM_PROGRAM is Apple_Terminal on older macOS', () => {
			// Apple Terminal historically had limited Unicode support
			process.env.TERM_PROGRAM = 'Apple_Terminal';
			delete process.env.LANG;
			delete process.env.LC_ALL;
			delete process.env.TERM;
			expect(supportsUnicode()).toBe(false);
		});

		it('should handle case-insensitive UTF-8 check in LANG', () => {
			delete process.env.TERM;
			process.env.LANG = 'en_US.utf-8'; // lowercase
			expect(supportsUnicode()).toBe(true);
		});
	});
});
