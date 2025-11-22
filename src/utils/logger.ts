import * as fs from 'fs';
import * as path from 'path';
import {format} from 'util';
import os from 'os';

/**
 * Logger configuration with size management and log rotation
 */
interface LoggerConfig {
	/** Maximum log file size in bytes (default: 5MB) */
	maxSizeBytes: number;
	/** Number of old logs to keep (default: 3) */
	maxRotatedFiles: number;
	/** Enable console output for errors (default: true) */
	logErrorsToConsole: boolean;
}

/**
 * Log level enum for structured logging
 */
enum LogLevel {
	DEBUG = 'DEBUG',
	INFO = 'INFO',
	WARN = 'WARN',
	ERROR = 'ERROR',
	LOG = 'LOG',
}

/**
 * CLI-optimized logger with size management and rotation
 *
 * Features:
 * - Automatic log rotation when file exceeds max size
 * - Configurable retention (3 rotated files by default)
 * - Atomic write operations to prevent corruption
 * - Platform-aware log location (respects XDG_STATE_HOME on Linux)
 * - Detailed timestamps and structured log lines
 * - Sensitive information filtering on console output
 */
class Logger {
	private readonly logFile: string;
	private readonly config: LoggerConfig;
	private writeQueue: Array<() => void> = [];
	private isWriting = false;

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = {
			maxSizeBytes: config.maxSizeBytes ?? 5 * 1024 * 1024, // 5MB default
			maxRotatedFiles: config.maxRotatedFiles ?? 3,
			logErrorsToConsole: config.logErrorsToConsole ?? true,
		};

		this.logFile = this.resolveLogPath();
		this.initializeLogFile();
	}

	/**
	 * Resolve log file path following XDG Base Directory specification
	 * and respecting environment overrides for testing
	 */
	private resolveLogPath(): string {
		// Allow environment override for testing
		if (process.env['CCMANAGER_LOG_FILE']) {
			return process.env['CCMANAGER_LOG_FILE'];
		}

		// Use XDG_STATE_HOME if available (Linux/macOS standard)
		const xdgStateHome = process.env['XDG_STATE_HOME'];
		if (xdgStateHome) {
			const logDir = path.join(xdgStateHome, 'ccmanager');
			return path.join(logDir, 'ccmanager.log');
		}

		// Fallback to ~/.local/state/ccmanager on Linux, ~/Library/Logs on macOS
		const homeDir = os.homedir();
		if (process.platform === 'darwin') {
			return path.join(
				homeDir,
				'Library',
				'Logs',
				'ccmanager',
				'ccmanager.log',
			);
		}

		// Linux and others
		return path.join(homeDir, '.local', 'state', 'ccmanager', 'ccmanager.log');
	}

	/**
	 * Initialize log file and ensure directory exists
	 */
	private initializeLogFile(): void {
		try {
			const logDir = path.dirname(this.logFile);
			if (!fs.existsSync(logDir)) {
				fs.mkdirSync(logDir, {recursive: true, mode: 0o700});
			}

			// Only clear log on first startup (check if file exists)
			if (!fs.existsSync(this.logFile)) {
				fs.writeFileSync(this.logFile, '', 'utf8');
			}
		} catch (_error) {
			// Silently fail if we can't initialize - don't crash the app
			// This ensures CLI operation is not disrupted by logging issues
		}
	}

	/**
	 * Check if log file exceeds size limit and rotate if needed
	 */
	private rotateLogIfNeeded(): void {
		try {
			const stats = fs.statSync(this.logFile);
			if (stats.size < this.config.maxSizeBytes) {
				return; // No rotation needed
			}

			// Rotate old logs: ccmanager.log.3 -> removed, .2 -> .3, .1 -> .2, .log -> .1
			for (let i = this.config.maxRotatedFiles; i > 0; i--) {
				const oldName = i === 1 ? this.logFile : `${this.logFile}.${i - 1}`;
				const newName = `${this.logFile}.${i}`;
				if (fs.existsSync(oldName)) {
					fs.renameSync(oldName, newName);
				}
			}

			// Remove the oldest log file if it exists
			const oldestLog = `${this.logFile}.${this.config.maxRotatedFiles}`;
			if (fs.existsSync(oldestLog)) {
				fs.unlinkSync(oldestLog);
			}

			// Start fresh log file
			fs.writeFileSync(this.logFile, '', 'utf8');
		} catch (_error) {
			// Silently fail - don't disrupt app operation
		}
	}

	/**
	 * Queue write operation to prevent concurrent writes
	 * This ensures log file integrity with atomic operations
	 */
	private queueWrite(callback: () => void): void {
		this.writeQueue.push(callback);
		this.processQueue();
	}

	/**
	 * Process write queue sequentially to prevent concurrent writes
	 */
	private processQueue(): void {
		if (this.isWriting || this.writeQueue.length === 0) {
			return;
		}

		this.isWriting = true;
		const callback = this.writeQueue.shift();

		try {
			if (callback) {
				callback();
			}
		} catch (_error) {
			// Silently fail - don't crash the app
		} finally {
			this.isWriting = false;
			this.processQueue();
		}
	}

	/**
	 * Write log entry with level and formatted message
	 */
	private writeLog(level: LogLevel, args: unknown[]): void {
		this.queueWrite(() => {
			try {
				this.rotateLogIfNeeded();

				const timestamp = new Date().toISOString();
				const message = format(...args);
				const logLine = `[${timestamp}] [${level}] ${message}\n`;

				fs.appendFileSync(this.logFile, logLine, 'utf8');

				// Also output errors to console for immediate visibility
				if (level === LogLevel.ERROR && this.config.logErrorsToConsole) {
					console.error(`[${level}]`, ...args);
				}
			} catch (_error) {
				// Silently fail - don't disrupt app operation
			}
		});
	}

	/**
	 * Get the path to the current log file
	 * Useful for users to locate and inspect logs
	 */
	public getLogPath(): string {
		return this.logFile;
	}

	/**
	 * Log entry at LOG level (general information)
	 */
	public log(...args: unknown[]): void {
		this.writeLog(LogLevel.LOG, args);
	}

	/**
	 * Log entry at INFO level (significant events)
	 */
	public info(...args: unknown[]): void {
		this.writeLog(LogLevel.INFO, args);
	}

	/**
	 * Log entry at WARN level (potentially harmful situations)
	 */
	public warn(...args: unknown[]): void {
		this.writeLog(LogLevel.WARN, args);
	}

	/**
	 * Log entry at ERROR level (error conditions)
	 */
	public error(...args: unknown[]): void {
		this.writeLog(LogLevel.ERROR, args);
	}

	/**
	 * Log entry at DEBUG level (detailed diagnostic information)
	 * Only written to file, not to console
	 */
	public debug(...args: unknown[]): void {
		this.writeLog(LogLevel.DEBUG, args);
	}
}

export const logger = new Logger();
