/**
 * @fileoverview Single source of truth for the location of ccmanager's own
 * configuration/state directory (`~/.config/ccmanager`, or the Windows
 * equivalent under APPDATA). Every module that needs to read or write a file
 * belonging to ccmanager itself resolves the directory through here so the
 * location is defined in exactly one place.
 */
import {homedir} from 'os';
import path from 'path';
import {existsSync, mkdirSync} from 'fs';

/**
 * Path of ccmanager's configuration/state directory. Does not touch the
 * filesystem.
 */
export function getConfigDir(): string {
	const homeDir = homedir();

	return process.platform === 'win32'
		? path.join(
				process.env['APPDATA'] || path.join(homeDir, 'AppData', 'Roaming'),
				'ccmanager',
			)
		: path.join(homeDir, '.config', 'ccmanager');
}

/**
 * Path of ccmanager's configuration/state directory, creating it first if it
 * does not exist yet.
 */
export function ensureConfigDir(): string {
	const configDir = getConfigDir();

	if (!existsSync(configDir)) {
		mkdirSync(configDir, {recursive: true});
	}

	return configDir;
}
