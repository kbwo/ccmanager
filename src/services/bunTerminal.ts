/**
 * BunTerminal - A wrapper around Bun's built-in Terminal API
 * that provides an interface compatible with the IPty interface.
 *
 * This replaces @skitee3000/bun-pty to avoid native library issues
 * when running compiled Bun binaries.
 */

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

	constructor(
		file: string,
		args: string[],
		options: IPtyForkOptions,
	) {
		this._cols = options.cols ?? 80;
		this._rows = options.rows ?? 24;
		this._process = file;

		// Spawn the process with Bun's built-in terminal support
		this._subprocess = Bun.spawn([file, ...args], {
			cwd: options.cwd ?? process.cwd(),
			env: options.env as Record<string, string> | undefined,
			terminal: {
				cols: this._cols,
				rows: this._rows,
				data: (_terminal, data) => {
					if (!this._closed) {
						const str =
							typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
						for (const listener of this._dataListeners) {
							listener(str);
						}
					}
				},
			},
		});

		this._pid = this._subprocess.pid;

		// Handle process exit
		this._subprocess.exited.then(exitCode => {
			if (!this._closed) {
				this._closed = true;
				for (const listener of this._exitListeners) {
					listener({exitCode});
				}
			}
		});
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
		if (this._closed || !this._subprocess?.terminal) {
			return;
		}
		this._subprocess.terminal.write(data);
	}

	resize(columns: number, rows: number): void {
		if (this._closed || !this._subprocess?.terminal) {
			return;
		}
		this._cols = columns;
		this._rows = rows;
		this._subprocess.terminal.resize(columns, rows);
	}

	kill(_signal?: string): void {
		if (this._closed) {
			return;
		}
		this._closed = true;

		if (this._subprocess?.terminal) {
			this._subprocess.terminal.close();
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
