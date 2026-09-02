import {type AppError} from '../types/errors.js';

/**
 * Human-readable one-line rendering of an application error, for display in the
 * TUI and for log lines. Each error type carries different fields, so the text
 * is composed per type via the `_tag` discriminator.
 */
export function formatErrorMessage(error: AppError): string {
	switch (error._tag) {
		case 'ProcessError':
			return `Process error: ${error.message}`;
		case 'ConfigError':
			return `Configuration error (${error.reason}): ${error.details}`;
		case 'GitError':
			return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
		case 'FileSystemError':
			return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
		case 'ValidationError':
			return `Validation failed for ${error.field}: ${error.constraint}`;
	}
}
