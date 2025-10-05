import {Data} from 'effect';

/**
 * Git operation errors
 * Used when git commands fail with non-zero exit codes
 */
export class GitError extends Data.TaggedError('GitError')<{
	readonly command: string;
	readonly exitCode: number;
	readonly stderr: string;
	readonly stdout?: string;
}> {}

/**
 * File system operation errors
 * Used when file system operations (read, write, delete, mkdir, stat) fail
 */
export class FileSystemError extends Data.TaggedError('FileSystemError')<{
	readonly operation: 'read' | 'write' | 'delete' | 'mkdir' | 'stat';
	readonly path: string;
	readonly cause: string;
}> {}

/**
 * Configuration errors
 * Used when configuration operations fail (parsing, validation, migration)
 */
export class ConfigError extends Data.TaggedError('ConfigError')<{
	readonly configPath: string;
	readonly reason: 'parse' | 'validation' | 'missing' | 'migration';
	readonly details: string;
}> {}

/**
 * Process/PTY errors
 * Used when process spawning or PTY operations fail
 */
export class ProcessError extends Data.TaggedError('ProcessError')<{
	readonly processId?: number;
	readonly command: string;
	readonly signal?: string;
	readonly exitCode?: number;
	readonly message: string;
}> {}

/**
 * Validation errors
 * Used when input validation fails
 */
export class ValidationError extends Data.TaggedError('ValidationError')<{
	readonly field: string;
	readonly constraint: string;
	readonly receivedValue: unknown;
}> {}

/**
 * Union type for all application errors
 * Enables discriminated union type narrowing using _tag property
 */
export type AppError =
	| GitError
	| FileSystemError
	| ConfigError
	| ProcessError
	| ValidationError;
