import React, {useEffect, useState} from 'react';
import {useStdout} from 'ink';
import {Session as SessionType} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';
import {shortcutManager} from '../services/shortcutManager.js';
import {TerminalSerializer} from '../utils/terminalSerializer.js';

interface SessionProps {
	session: SessionType;
	sessionManager: SessionManager;
	onReturnToMenu: () => void;
}

const Session: React.FC<SessionProps> = ({
	session,
	sessionManager,
	onReturnToMenu,
}) => {
	const {stdout} = useStdout();
	const [isExiting, setIsExiting] = useState(false);

	useEffect(() => {
		if (!stdout) return;

		// Clear screen when entering session
		stdout.write('\x1B[2J\x1B[H');

		// Handle session restoration
		const handleSessionRestore = (restoredSession: SessionType) => {
			if (restoredSession.id === session.id) {
				// Instead of replaying all history, use the virtual terminal's current buffer
				// This avoids duplicate content issues
				const terminal = restoredSession.terminal;
				if (terminal) {
					// Use the TerminalSerializer to preserve ANSI escape sequences (colors, styles)
					const serializedOutput = TerminalSerializer.serialize(terminal, {
						trimRight: true,
						includeEmptyLines: true,
					});

					// Write the serialized terminal state with preserved formatting
					if (serializedOutput) {
						stdout.write(serializedOutput);

						// Position cursor at the correct location
						const buffer = terminal.buffer.active;
						const cursorY = buffer.cursorY;
						const cursorX = buffer.cursorX;

						// Move cursor to the saved position
						stdout.write(`\x1B[${cursorY + 1};${cursorX + 1}H`);
					}
				}
			}
		};

		// Listen for restore event first
		sessionManager.on('sessionRestore', handleSessionRestore);

		// Mark session as active (this will trigger the restore event)
		sessionManager.setSessionActive(session.worktreePath, true);

		// Immediately resize the PTY and terminal to current dimensions
		// This fixes rendering issues when terminal width changed while in menu
		// https://github.com/kbwo/ccmanager/issues/2
		const currentCols = process.stdout.columns || 80;
		const currentRows = process.stdout.rows || 24;
		session.process.resize(currentCols, currentRows);
		if (session.terminal) {
			session.terminal.resize(currentCols, currentRows);
		}

		// Listen for session data events
		const handleSessionData = (activeSession: SessionType, data: string) => {
			// Only handle data for our session
			if (activeSession.id === session.id && !isExiting) {
				stdout.write(data);
			}
		};

		const handleSessionExit = (exitedSession: SessionType) => {
			if (exitedSession.id === session.id) {
				setIsExiting(true);
				// Don't call onReturnToMenu here - App component handles it
			}
		};

		sessionManager.on('sessionData', handleSessionData);
		sessionManager.on('sessionExit', handleSessionExit);

		// Handle terminal resize
		const handleResize = () => {
			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;
			session.process.resize(cols, rows);
			// Also resize the virtual terminal
			if (session.terminal) {
				session.terminal.resize(cols, rows);
			}
		};

		stdout.on('resize', handleResize);

		// Set up raw input handling
		const stdin = process.stdin;

		// Store original stdin state
		const originalIsRaw = stdin.isRaw;
		const originalIsPaused = stdin.isPaused();

		// Configure stdin for PTY passthrough
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const handleStdinData = (data: string) => {
			if (isExiting) return;

			// Check for return to menu shortcut
			const returnToMenuShortcut = shortcutManager.getShortcuts().returnToMenu;
			const shortcutCode =
				shortcutManager.getShortcutCode(returnToMenuShortcut);

			if (shortcutCode && data === shortcutCode) {
				// Disable focus reporting mode before returning to menu
				if (stdout) {
					stdout.write('\x1b[?1004l');
				}
				// Restore stdin state before returning to menu
				stdin.removeListener('data', handleStdinData);
				stdin.setRawMode(false);
				stdin.pause();
				onReturnToMenu();
				return;
			}

			// Pass all other input directly to the PTY
			session.process.write(data);
		};

		stdin.on('data', handleStdinData);

		return () => {
			// Remove listener first to prevent any race conditions
			stdin.removeListener('data', handleStdinData);

			// Disable focus reporting mode that might have been enabled by the PTY
			if (stdout) {
				stdout.write('\x1b[?1004l');
			}

			// Restore stdin to its original state
			if (stdin.isTTY) {
				stdin.setRawMode(originalIsRaw || false);
				if (originalIsPaused) {
					stdin.pause();
				} else {
					stdin.resume();
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
	}, [session, sessionManager, stdout, onReturnToMenu, isExiting]);

	// Return null to render nothing (PTY output goes directly to stdout)
	return null;
};

export default Session;
