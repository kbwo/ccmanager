import React, {useEffect, useState} from 'react';
import {useStdout} from 'ink';
import {Session as SessionType} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface ClaudeSessionProps {
	session: SessionType;
	sessionManager: SessionManager;
	onToggleMode: () => void;
	onReturnToMenu: () => void;
}

const ClaudeSession: React.FC<ClaudeSessionProps> = ({
	session,
	sessionManager,
	onToggleMode,
	onReturnToMenu,
}) => {
	const {stdout} = useStdout();
	const [isExiting, setIsExiting] = useState(false);

	useEffect(() => {
		if (!stdout) return;

		// Simple screen clear - same strategy as Menu→Claude (no ANSI cursor manipulation)
		stdout.write('\x1B[2J\x1B[H');

		// Set session to claude mode so SessionManager routes events correctly
		session.currentMode = 'claude';

		// Handle Claude session restoration
		const handleSessionRestore = (restoredSession: SessionType) => {
			if (restoredSession.id !== session.id) return;

			// Replay all Claude buffered output, using robust logic
			for (let i = 0; i < restoredSession.outputHistory.length; i++) {
				const buffer = restoredSession.outputHistory[i];
				if (!buffer) continue;

				const str = buffer.toString('utf8');

				// Skip clear screen sequences at the beginning
				if (i === 0 && (str.includes('\x1B[2J') || str.includes('\x1B[H'))) {
					const cleaned = str
						.replace(/\x1B\[2J/g, '')
						.replace(/\x1B\[H/g, '');
					if (cleaned.length > 0) {
						stdout.write(Buffer.from(cleaned, 'utf8'));
					}
				} else {
					stdout.write(buffer);
				}
			}
		};

		// Handle Claude data only
		const handleSessionData = (activeSession: SessionType, data: string) => {
			if (activeSession.id === session.id && !isExiting) {
				stdout.write(data);
			}
		};

		const handleSessionExit = (exitedSession: SessionType) => {
			if (exitedSession.id === session.id) {
				setIsExiting(true);
			}
		};

		// Setup event listeners for Claude events only
		sessionManager.on('sessionRestore', handleSessionRestore);
		sessionManager.on('sessionData', handleSessionData);
		sessionManager.on('sessionExit', handleSessionExit);

		// Mark session as active (triggers restore event)
		sessionManager.setSessionActive(session.worktreePath, true);

		// Display mode indicator (save cursor position to avoid displacing input)
		setTimeout(() => {
			const toggleShortcut = shortcutManager.getShortcutDisplay('toggleMode');
			const menuShortcut = shortcutManager.getShortcutDisplay('returnToMenu');
			const indicator = `\x1b[44m Claude \x1b[0m \x1b[90m(${toggleShortcut}: Bash | ${menuShortcut}: Menu)\x1b[0m`;
			stdout.write(`\x1b7\x1b[1;1H${indicator}\x1b8`);
		}, 200);

		// Resize PTY to current dimensions
		const currentCols = process.stdout.columns || 80;
		const currentRows = process.stdout.rows || 24;

		try {
			session.process.resize(currentCols, currentRows);
			if (session.terminal) {
				session.terminal.resize(currentCols, currentRows);
			}
		} catch {
			// Process might have exited
		}

		// Handle terminal resize
		const handleResize = () => {
			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;

			// Resize Claude PTY and virtual terminal only
			try {
				session.process.resize(cols, rows);
				if (session.terminal) {
					session.terminal.resize(cols, rows);
				}
			} catch {
				// Process might have exited
			}
		};

		stdout.on('resize', handleResize);

		// Setup stdin handling
		const stdin = process.stdin;
		const originalRawMode = stdin.isRaw;
		const originalPaused = stdin.isPaused();

		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const handleStdinData = (data: string) => {
			if (isExiting) return;

			const shortcuts = shortcutManager.getShortcuts();

			// Check for toggle mode shortcut
			const toggleModeCode = shortcutManager.getShortcutCode(shortcuts.toggleMode);
			if (toggleModeCode && data === toggleModeCode) {
				onToggleMode();
				return;
			}

			// Check for return to menu shortcut
			const returnToMenuCode = shortcutManager.getShortcutCode(shortcuts.returnToMenu);
			if (returnToMenuCode && data === returnToMenuCode) {
				if (stdout) {
					stdout.write('\x1b[?1004l');
				}
				onReturnToMenu();
				return;
			}

			// Send to Claude PTY only
			session.process.write(data);
		};

		stdin.on('data', handleStdinData);

		return () => {
			// Cleanup Claude session
			stdin.removeListener('data', handleStdinData);

			try {
				stdin.setRawMode(originalRawMode);
				if (originalPaused) {
					stdin.pause();
				}
			} catch {
				// Handle case where stdin is already in desired state
			}

			if (stdout) {
				try {
					stdout.write('\x1b[?1004l');
				} catch {
					// Handle case where stdout is no longer available
				}
			}

			// Mark session as inactive
			sessionManager.setSessionActive(session.worktreePath, false);

			// Remove event listeners
			sessionManager.off('sessionRestore', handleSessionRestore);
			sessionManager.off('sessionData', handleSessionData);
			sessionManager.off('sessionExit', handleSessionExit);
			stdout.off('resize', handleResize);
		};
	}, [session, sessionManager, stdout, onToggleMode, onReturnToMenu, isExiting]);

	return null;
};

export default ClaudeSession;