/**
 * BunTerminal - A wrapper around Bun's built-in Terminal API
 * that provides an interface compatible with the IPty interface.
 *
 * This replaces @skitee3000/bun-pty to avoid native library issues
 * when running compiled Bun binaries.
 */

import {logger} from '../utils/logger.js';

/**
 * Interface for disposable resources.
 */
export interface IDisposable {
	dispose(): void;
}

/**
 * Exit event data for PTY process.
 */
export interface IExitEvent {
	exitCode: number;
	signal?: number | string;
}

/**
 * Options for spawning a new PTY process.
 */
export interface IPtyForkOptions {
	name: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	env?: Record<string, string | undefined>;
}

/**
 * Interface for interacting with a pseudo-terminal (PTY) instance.
 */
export interface IPty {
	readonly pid: number;
	readonly cols: number;
	readonly rows: number;
	readonly process: string;
	readonly onData: (listener: (data: string) => void) => IDisposable;
	readonly onExit: (listener: (event: IExitEvent) => void) => IDisposable;
	write(data: string): void;
	resize(columns: number, rows: number): void;
	kill(signal?: string): void;
}

/**
 * BunTerminal class that wraps Bun's built-in Terminal API.
 */
class BunTerminal implements IPty {
	private _pid: number = -1;
	private _cols: number;
	private _rows: number;
	private _process: string;
	private _closed: boolean = false;
	private _dataListeners: Array<(data: string) => void> = [];
	private _exitListeners: Array<(event: IExitEvent) => void> = [];
	private _subprocess: ReturnType<typeof Bun.spawn> | null = null;
	private _terminal: Bun.Terminal | null = null;
	private _decoder: TextDecoder = new TextDecoder('utf-8');

	// Buffering to combine fragmented data chunks from the same event loop
	private _dataBuffer: string = '';
	private _flushTimer: ReturnType<typeof setTimeout> | null = null;
	private _syncOutputMode: boolean = false;

	// Synchronized output escape sequences (used by Ink and other TUI frameworks)
	private static readonly SYNC_OUTPUT_START = '\x1b[?2026h';
	private static readonly SYNC_OUTPUT_END = '\x1b[?2026l';
	private static readonly FLUSH_DELAY_MS = 8; // ~2 frames at 60fps for batching
	private static readonly SYNC_TIMEOUT_MS = 100; // Timeout for sync mode

	constructor(file: string, args: string[], options: IPtyForkOptions) {
		this._cols = options.cols ?? 80;
		this._rows = options.rows ?? 24;
		this._process = file;

		// Build environment with TERM variable (like node-pty does with 'name' option)
		const env: Record<string, string> = {};
		if (options.env) {
			for (const [key, value] of Object.entries(options.env)) {
				if (value !== undefined) {
					env[key] = value;
				}
			}
		}
		// Set TERM from the 'name' option (like node-pty does)
		env['TERM'] = options.name || 'xterm-256color';

		// Create a standalone Bun.Terminal instance for better control over termios settings
		this._terminal = new Bun.Terminal({
			cols: this._cols,
			rows: this._rows,
			data: (_terminal, data) => {
				if (this._closed) return;

				const str =
					typeof data === 'string'
						? data
						: this._decoder.decode(data, {stream: true});

				this._dataBuffer += str;
				this._processBuffer();
			},
		});

		// Match node-pty behavior by starting in raw mode (no canonical input/echo),
		// while keeping Bun's output processing defaults intact.
		this._terminal.setRawMode(true);

		// Disable ONLCR in the PTY output flags to avoid double CRLF translation
		// when forwarding PTY output to the real stdout TTY.
		const ONLCR_FLAG = 0x0002;
		this._terminal.outputFlags = this._terminal.outputFlags & ~ONLCR_FLAG;

		// Keep Bun defaults for other termios flags.

		// Spawn the process with the pre-configured terminal
		this._subprocess = Bun.spawn([file, ...args], {
			cwd: options.cwd ?? process.cwd(),
			env,
			terminal: this._terminal,
		});

		this._pid = this._subprocess.pid;

		// Handle process exit
		this._subprocess.exited.then(exitCode => {
			if (!this._closed) {
				this._closed = true;
				// Clear any pending flush timer
				if (this._flushTimer) {
					clearTimeout(this._flushTimer);
					this._flushTimer = null;
				}
				// Flush any remaining buffered data before exit
				this._finalizeDecoder();
				this._syncOutputMode = false;
				// Temporarily unset _closed to allow final flush
				this._closed = false;
				this._flushBuffer();
				this._closed = true;
				for (const listener of this._exitListeners) {
					listener({exitCode});
				}
			}
		});
	}

	private _emitData(payload: string): void {
		if (payload.length === 0 || this._closed) {
			return;
		}
		for (const listener of this._dataListeners) {
			listener(payload);
		}
	}

	private _flushBuffer(): void {
		if (this._dataBuffer.length === 0 || this._closed) {
			return;
		}
		const bufferedData = this._dataBuffer;
		this._dataBuffer = '';
		this._emitData(bufferedData);
	}

	private _finalizeDecoder(): void {
		const remaining = this._decoder.decode(new Uint8Array(), {stream: false});
		if (remaining.length > 0) {
			this._dataBuffer += remaining;
		}
	}

	private _processBuffer(): void {
		if (this._closed) {
			return;
		}

		let madeProgress = true;
		while (madeProgress) {
			madeProgress = false;

			if (this._syncOutputMode) {
				const endIndex = this._dataBuffer.indexOf(
					BunTerminal.SYNC_OUTPUT_END,
				);
				if (endIndex !== -1) {
					const endOffset = endIndex + BunTerminal.SYNC_OUTPUT_END.length;
					const frame = this._dataBuffer.slice(0, endOffset);
					this._dataBuffer = this._dataBuffer.slice(endOffset);
					this._syncOutputMode = false;
					if (this._flushTimer) {
						clearTimeout(this._flushTimer);
						this._flushTimer = null;
					}
					this._emitData(frame);
					madeProgress = true;
					continue;
				}

				if (this._flushTimer) {
					clearTimeout(this._flushTimer);
				}
				this._flushTimer = setTimeout(() => {
					this._flushTimer = null;
					this._syncOutputMode = false;
					this._flushBuffer();
				}, BunTerminal.SYNC_TIMEOUT_MS);
				return;
			}

			const startIndex = this._dataBuffer.indexOf(
				BunTerminal.SYNC_OUTPUT_START,
			);
			if (startIndex !== -1) {
				if (startIndex > 0) {
					const leading = this._dataBuffer.slice(0, startIndex);
					this._dataBuffer = this._dataBuffer.slice(startIndex);
					this._emitData(leading);
					madeProgress = true;
					continue;
				}

				this._syncOutputMode = true;
				if (this._flushTimer) {
					clearTimeout(this._flushTimer);
					this._flushTimer = null;
				}
				madeProgress = true;
				continue;
			}

			if (this._flushTimer) {
				clearTimeout(this._flushTimer);
			}
			this._flushTimer = setTimeout(() => {
				this._flushTimer = null;
				this._flushBuffer();
			}, BunTerminal.FLUSH_DELAY_MS);
		}
	}

	get pid(): number {
		return this._pid;
	}

	get cols(): number {
		return this._cols;
	}

	get rows(): number {
		return this._rows;
	}

	get process(): string {
		return this._process;
	}

	onData = (listener: (data: string) => void): IDisposable => {
		this._dataListeners.push(listener);
		return {
			dispose: () => {
				const index = this._dataListeners.indexOf(listener);
				if (index !== -1) {
					this._dataListeners.splice(index, 1);
				}
			},
		};
	};

	onExit = (listener: (event: IExitEvent) => void): IDisposable => {
		this._exitListeners.push(listener);
		return {
			dispose: () => {
				const index = this._exitListeners.indexOf(listener);
				if (index !== -1) {
					this._exitListeners.splice(index, 1);
				}
			},
		};
	};

	write(data: string): void {
		if (this._closed || !this._terminal) {
			return;
		}
		this._terminal.write(data);
	}

	resize(columns: number, rows: number): void {
		if (this._closed || !this._terminal) {
			return;
		}
		this._cols = columns;
		this._rows = rows;
		this._terminal.resize(columns, rows);
	}

	kill(_signal?: string): void {
		if (this._closed) {
			return;
		}
		this._closed = true;

		// Clear any pending flush timer
		if (this._flushTimer) {
			clearTimeout(this._flushTimer);
			this._flushTimer = null;
		}

		// Flush any remaining buffered data
		this._finalizeDecoder();
		this._syncOutputMode = false;
		// Temporarily unset _closed to allow final flush
		this._closed = false;
		this._flushBuffer();
		this._closed = true;

		if (this._terminal) {
			this._terminal.close();
		}

		if (this._subprocess) {
			this._subprocess.kill();
		}
	}
}

/**
 * Spawn a new PTY process using Bun's built-in Terminal API.
 *
 * @param file - The command to execute
 * @param args - Arguments to pass to the command
 * @param options - PTY fork options
 * @returns An IPty instance
 */
export function spawn(
	file: string,
	args: string[],
	options: IPtyForkOptions,
): IPty {
	return new BunTerminal(file, args, options);
}
