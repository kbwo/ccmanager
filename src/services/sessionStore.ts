import path from 'path';
import {homedir} from 'os';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {logger} from '../utils/logger.js';

export interface SessionMeta {
	id: string;
	worktreePath: string;
	number: number;
	name?: string;
}

interface SessionStoreData {
	sessions: SessionMeta[];
}

class SessionStore {
	private dataPath: string;
	private sessions: SessionMeta[] = [];

	constructor() {
		const homeDir = homedir();
		const configDir =
			process.platform === 'win32'
				? path.join(
						process.env['APPDATA'] || path.join(homeDir, 'AppData', 'Roaming'),
						'ccmanager',
					)
				: path.join(homeDir, '.config', 'ccmanager');

		if (!existsSync(configDir)) {
			mkdirSync(configDir, {recursive: true});
		}

		this.dataPath = path.join(configDir, 'sessions.json');
		this.load();
	}

	private load(): void {
		try {
			if (existsSync(this.dataPath)) {
				const data = readFileSync(this.dataPath, 'utf-8');
				const parsed: SessionStoreData = JSON.parse(data);
				this.sessions = parsed.sessions || [];
			}
		} catch (error) {
			logger.error('Failed to load session store:', error);
			this.sessions = [];
		}
	}

	private save(): void {
		try {
			const data: SessionStoreData = {sessions: this.sessions};
			writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
		} catch (error) {
			logger.error('Failed to save session store:', error);
		}
	}

	createSessionMeta(worktreePath: string): SessionMeta {
		const existing = this.getSessionsForWorktree(worktreePath);
		const maxNumber = existing.reduce((max, s) => Math.max(max, s.number), 0);
		const meta: SessionMeta = {
			id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			worktreePath,
			number: maxNumber + 1,
		};
		this.sessions.push(meta);
		this.save();
		return meta;
	}

	removeSessionMeta(id: string): void {
		this.sessions = this.sessions.filter(s => s.id !== id);
		this.save();
	}

	removeSessionsForWorktree(worktreePath: string): void {
		this.sessions = this.sessions.filter(s => s.worktreePath !== worktreePath);
		this.save();
	}

	renameSession(id: string, name?: string): void {
		const session = this.sessions.find(s => s.id === id);
		if (session) {
			session.name = name;
			this.save();
		}
	}

	getSessionsForWorktree(worktreePath: string): SessionMeta[] {
		return this.sessions.filter(s => s.worktreePath === worktreePath);
	}

	getAllSessionMetas(): SessionMeta[] {
		return [...this.sessions];
	}

	getSessionMeta(id: string): SessionMeta | undefined {
		return this.sessions.find(s => s.id === id);
	}

	cleanupOrphanedPaths(validPaths: string[]): void {
		const validSet = new Set(validPaths);
		const before = this.sessions.length;
		this.sessions = this.sessions.filter(s => validSet.has(s.worktreePath));
		if (this.sessions.length !== before) {
			this.save();
		}
	}

	/**
	 * Remove metas whose IDs are not in the given set of running session IDs.
	 * Called on startup to clean up metas from sessions that exited while the
	 * app was not running (e.g., killed without clean shutdown).
	 */
	cleanupStaleMetas(runningSessionIds: Set<string>): void {
		const before = this.sessions.length;
		this.sessions = this.sessions.filter(s => runningSessionIds.has(s.id));
		if (this.sessions.length !== before) {
			this.save();
		}
	}
}

export const sessionStore = new SessionStore();
