import React, {useEffect, useRef} from 'react';
import {useStdout} from 'ink';
import {Session as ISession} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface SessionProps {
	session: ISession;
	sessionManager: SessionManager;
	onReturnToMenu: () => void;
}

const Session: React.FC<SessionProps> = ({
	session,
	sessionManager,
	onReturnToMenu,
}) => {
	const {stdout} = useStdout();
	const isExitingRef = useRef(false);

	const normalizeLineEndings = (input: string): string => {
		// Ensure LF moves to column 0 to prevent cursor drift when ONLCR is disabled.
		let normalized = '';
		for (let i = 0; i < input.length; i++) {
			const char = input[i];
			if (char === '\n') {
				const prev = i > 0 ? input[i - 1] : '';
				if (prev !== '\r') {
					normalized += '\r';
				}
			}
			normalized += char;
		}
		return normalized;
	};

	useEffect(() => {
		if (!stdout) return;

		const resetTerminalInputModes = () => {
			// Reset terminal modes that interactive tools like Codex enable (kitty keyboard
			// protocol / modifyOtherKeys / focus tracking) so they don't leak into other
			// sessions after we detach.
			stdout.write('\x1b[>0u'); // Disable kitty keyboard protocol (CSI u sequences)
			stdout.write('\x1b[>4;0m'); // Disable xterm modifyOtherKeys extensions
			stdout.write('\x1b[?1004l'); // Disable focus reporting
			stdout.write('\x1b[?2004l'); // Disable bracketed paste (can interfere with shortcuts)
			stdout.write('\x1b[?7h'); // Re-enable auto-wrap
		};

		// Set up raw input handling
		const stdin = process.stdin;

		// Configure stdin for PTY passthrough
		if (stdin.isTTY) {
			stdin.setRawMode(true);
			stdin.resume();
		}
		stdin.setEncoding('utf8');

		const handleStdinData = (data: string) => {
			if (isExitingRef.current) return;

			// Check for return to menu shortcut
			if (shortcutManager.matchesRawInput('returnToMenu', data)) {
				// Disable any extended input modes that might have been enabled by the PTY
				if (stdout) {
					resetTerminalInputModes();
				}
				// Remove our listener — Ink will reconfigure stdin when Menu mounts
				stdin.removeListener('data', handleStdinData);
				onReturnToMenu();
				return;
			}

			if (session.stateMutex.getSnapshot().state === 'pending_auto_approval') {
				sessionManager.cancelAutoApproval(
					session.id,
					'User input received during auto-approval',
				);
			}

			// Pass all other input directly to the PTY
			session.process.write(data);
		};

		stdin.on('data', handleStdinData);

		// Prevent line wrapping from drifting redraws in TUIs that rely on cursor-up clears.
		stdout.write('\x1b[?7l');

		// Clear screen when entering session
		stdout.write('\x1B[2J\x1B[H');

		// Restore the current terminal state from the headless xterm snapshot.
		const handleSessionRestore = (
			restoredSession: ISession,
			restoreSnapshot: string,
		) => {
			if (restoredSession.id === session.id) {
				if (restoreSnapshot.length > 0) {
					stdout.write(restoreSnapshot);
				}
			}
		};

		// Listen for restore event first
		sessionManager.on('sessionRestore', handleSessionRestore);

		// Listen for session data events
		const handleSessionData = (activeSession: ISession, data: string) => {
			// Only handle data for our session
			if (activeSession.id === session.id && !isExitingRef.current) {
				stdout.write(normalizeLineEndings(data));
			}
		};

		const handleSessionExit = (exitedSession: ISession) => {
			if (exitedSession.id === session.id) {
				isExitingRef.current = true;
				// Don't call onReturnToMenu here - App component handles it
			}
		};

		sessionManager.on('sessionData', handleSessionData);
		sessionManager.on('sessionExit', handleSessionExit);

		// Immediately resize the PTY and terminal to current dimensions
		// This fixes rendering issues when terminal width changed while in menu
		// https://github.com/kbwo/ccmanager/issues/2
		const currentCols = process.stdout.columns || 80;
		const currentRows = process.stdout.rows || 24;

		// Do not delete try-catch
		// Prevent ccmanager from exiting when claude process has already exited
		try {
			session.process.resize(currentCols, currentRows);
			if (session.terminal) {
				session.terminal.resize(currentCols, currentRows);
			}
		} catch {
			/* empty */
		}

		// Mark session as active after resizing so the restore snapshot matches
		// the current terminal dimensions.
		sessionManager.setSessionActive(session.id, true);

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

		return () => {
			// Remove our stdin listener
			stdin.removeListener('data', handleStdinData);

			// Disable extended input modes that might have been enabled by the PTY
			if (stdout) {
				resetTerminalInputModes();
			}

			// Mark session as inactive
			sessionManager.setSessionActive(session.id, false);

			// Remove event listeners
			sessionManager.off('sessionRestore', handleSessionRestore);
			sessionManager.off('sessionData', handleSessionData);
			sessionManager.off('sessionExit', handleSessionExit);
			stdout.off('resize', handleResize);
		};
	}, [session, sessionManager, stdout, onReturnToMenu]);

	return null;
};

export default Session;
