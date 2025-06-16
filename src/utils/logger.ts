import * as fs from 'fs';
import * as path from 'path';
import {format} from 'util';

const LOG_FILE = path.join(process.cwd(), 'ccmanager.log');

// Clear log file on startup
fs.writeFileSync(LOG_FILE, '', 'utf8');

function writeLog(level: string, args: unknown[]): void {
	const timestamp = new Date().toISOString();
	const message = format(...args);
	const logLine = `[${timestamp}] [${level}] ${message}\n`;

	fs.appendFileSync(LOG_FILE, logLine, 'utf8');
}

export const log = {
	log: (...args: unknown[]) => writeLog('LOG', args),
	info: (...args: unknown[]) => writeLog('INFO', args),
	warn: (...args: unknown[]) => writeLog('WARN', args),
	error: (...args: unknown[]) => writeLog('ERROR', args),
	debug: (...args: unknown[]) => writeLog('DEBUG', args),
};

// Alias for console.log style usage
export const logger = log;
