import React, {useEffect, useState} from 'react';
import {useStdout} from 'ink';
import {Session as SessionType} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface BashSessionProps {
	session: SessionType;
	sessionManager: SessionManager;
	onToggleMode: () => void;
	onReturnToMenu: () => void;
}

const BashSession: React.FC<BashSessionProps> = ({
	session,
	sessionManager,
	onToggleMode,
	onReturnToMenu,
}) => {
	const {stdout} = useStdout();
	const [isExiting, setIsExiting] = useState(false);

	useEffect(() => {
		if (!stdout) return;

		// Only clear screen on initial load, not on mode toggles
		if (session.bashHistory.length === 0) {
			stdout.write('\x1B[2J\x1B[H');
		}

		// Set session to bash mode so SessionManager routes events correctly
		session.currentMode = 'bash';

		// Handle Bash session restoration
		const handleBashSessionRestore = (restoredSession: SessionType) => {
			if (restoredSession.id !== session.id) return;

			// Replay all Bash buffered output, using robust logic
			for (let i = 0; i < restoredSession.bashHistory.length; i++) {
				const buffer = restoredSession.bashHistory[i];
				if (!buffer) continue;

				const str = buffer.toString('utf8');

				// Skip clear screen sequences at the beginning
				if (i === 0 && (str.includes('\x1B[2J') || str.includes('\x1B[H'))) {
					const cleaned = str.replace(/\x1B\[2J/g, '').replace(/\x1B\[H/g, '');
					if (cleaned.length > 0) {
						stdout.write(Buffer.from(cleaned, 'utf8'));
					}
				} else {
					stdout.write(buffer);
				}
			}
		};

		// Handle Bash data only
		const handleBashSessionData = (
			activeSession: SessionType,
			data: string,
		) => {
			if (activeSession.id === session.id && !isExiting) {
				stdout.write(data);
			}
		};

		const handleSessionExit = (exitedSession: SessionType) => {
			if (exitedSession.id === session.id) {
				setIsExiting(true);
			}
		};

		// Setup event listeners for Bash events only
		sessionManager.on('bashSessionRestore', handleBashSessionRestore);
		sessionManager.on('bashSessionData', handleBashSessionData);
		sessionManager.on('sessionExit', handleSessionExit);

		// Mark session as active (triggers restore event)
		sessionManager.setSessionActive(session.worktreePath, true);

		// If bash history is empty, send initial newline to get bash prompt
		if (session.bashHistory.length === 0) {
			setTimeout(() => {
				session.bashProcess.write('\n');
			}, 150);
		}

		// Resize PTY to current dimensions
		const currentCols = process.stdout.columns || 80;
		const currentRows = process.stdout.rows || 24;

		try {
			session.bashProcess.resize(currentCols, currentRows);
			if (session.bashTerminal) {
				session.bashTerminal.resize(currentCols, currentRows);
			}
		} catch {
			// Bash process might have exited
		}

		// Handle terminal resize
		const handleResize = () => {
			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;

			// Resize Bash PTY and virtual terminal only
			try {
				session.bashProcess.resize(cols, rows);
				if (session.bashTerminal) {
					session.bashTerminal.resize(cols, rows);
				}
			} catch {
				// Bash process might have exited
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
			const toggleModeCode = shortcutManager.getShortcutCode(
				shortcuts.toggleMode,
			);
			if (toggleModeCode && data === toggleModeCode) {
				onToggleMode();
				return;
			}

			// Check for return to menu shortcut
			const returnToMenuCode = shortcutManager.getShortcutCode(
				shortcuts.returnToMenu,
			);
			if (returnToMenuCode && data === returnToMenuCode) {
				if (stdout) {
					stdout.write('\x1b[?1004l');
				}
				onReturnToMenu();
				return;
			}

			// Send to Bash PTY only
			session.bashProcess.write(data);
		};

		stdin.on('data', handleStdinData);

		return () => {
			// Cleanup Bash session
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
			sessionManager.off('bashSessionRestore', handleBashSessionRestore);
			sessionManager.off('bashSessionData', handleBashSessionData);
			sessionManager.off('sessionExit', handleSessionExit);
			stdout.off('resize', handleResize);
		};
	}, [
		session,
		sessionManager,
		stdout,
		onToggleMode,
		onReturnToMenu,
		isExiting,
	]);

	return null;
};

export default BashSession;
