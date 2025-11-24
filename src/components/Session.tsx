import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useStdout} from 'ink';
import {Session as SessionType} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';
import {shortcutManager} from '../services/shortcutManager.js';

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
	const [statusMessage, setStatusMessage] = useState<string | null>(() =>
		session.state === 'pending_auto_approval'
			? 'Auto-approval pending... verifying permissions'
			: null,
	);
	const statusMessageRef = useRef(statusMessage);

	const renderStatusLine = useCallback(
		(message?: string | null) => {
			if (!stdout) return;

			const rows = stdout.rows ?? process.stdout.rows ?? 24;
			const cols = stdout.columns ?? process.stdout.columns ?? 80;
			const content =
				message !== undefined ? message : statusMessageRef.current;

			stdout.write('\x1b7'); // Save cursor position
			stdout.write(`\x1b[${rows};1H`); // Move to bottom row
			stdout.write('\x1b[2K'); // Clear the line

			if (content) {
				const bg = '\x1b[48;5;214m'; // High-contrast orange for dark terminals
				const fg = '\x1b[30m'; // Black text
				const bold = '\x1b[1m';
				const reset = '\x1b[0m';
				const maxContentWidth = Math.max(cols - 4, 0);
				const prefixed = `[AUTO-APPROVAL] ${content}`;
				const trimmed =
					prefixed.length > maxContentWidth
						? prefixed.slice(0, maxContentWidth)
						: prefixed;
				const boxedContent = ` ${trimmed}`.padEnd(cols, ' ');
				stdout.write(`${bg}${fg}${bold}${boxedContent}${reset}`);
			}

			stdout.write('\x1b8'); // Restore cursor position
		},
		[stdout],
	);

	useEffect(() => {
		statusMessageRef.current = statusMessage;
		renderStatusLine(statusMessage);
	}, [statusMessage, renderStatusLine]);

	useEffect(() => {
		const handleSessionStateChange = (updatedSession: SessionType) => {
			if (updatedSession.id !== session.id) return;

			if (updatedSession.state === 'pending_auto_approval') {
				setStatusMessage('Auto-approval pending... verifying permissions');
			} else {
				setStatusMessage(null);
			}
		};

		sessionManager.on('sessionStateChanged', handleSessionStateChange);

		return () => {
			sessionManager.off('sessionStateChanged', handleSessionStateChange);
		};
	}, [session.id, sessionManager]);

	const stripOscColorSequences = (input: string): string => {
		// Remove default foreground/background color OSC sequences that Codex emits
		// These sequences leak as literal text when replaying buffered output
		return input.replace(/\x1B\](?:10|11);[^\x07\x1B]*(?:\x07|\x1B\\)/g, '');
	};

	useEffect(() => {
		if (!stdout) return;

		// Clear screen when entering session
		stdout.write('\x1B[2J\x1B[H');

		// Handle session restoration
		const handleSessionRestore = (restoredSession: SessionType) => {
			if (restoredSession.id === session.id) {
				// Replay all buffered output, but skip the initial clear if present
				for (let i = 0; i < restoredSession.outputHistory.length; i++) {
					const buffer = restoredSession.outputHistory[i];
					if (!buffer) continue;

					const str = stripOscColorSequences(buffer.toString('utf8'));

					// Skip clear screen sequences at the beginning
					if (i === 0 && (str.includes('\x1B[2J') || str.includes('\x1B[H'))) {
						// Skip this buffer or remove the clear sequence
						const cleaned = str
							.replace(/\x1B\[2J/g, '')
							.replace(/\x1B\[H/g, '');
						if (cleaned.length > 0) {
							stdout.write(cleaned);
						}
					} else {
						if (str.length > 0) {
							stdout.write(str);
						}
					}
				}

				if (statusMessageRef.current) {
					renderStatusLine();
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

		// Listen for session data events
		const handleSessionData = (activeSession: SessionType, data: string) => {
			// Only handle data for our session
			if (activeSession.id === session.id && !isExiting) {
				stdout.write(data);

				if (statusMessageRef.current) {
					renderStatusLine();
				}
			}
		};

		const handleSessionExit = (exitedSession: SessionType) => {
			if (exitedSession.id === session.id) {
				setIsExiting(true);
				setStatusMessage(null);
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

			if (statusMessageRef.current) {
				renderStatusLine();
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
			if (shortcutManager.matchesRawInput('returnToMenu', data)) {
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

			renderStatusLine(null);
		};
	}, [
		session,
		sessionManager,
		stdout,
		onReturnToMenu,
		isExiting,
		renderStatusLine,
	]);

	// Return null to render nothing (PTY output goes directly to stdout)
	return null;
};

export default Session;
