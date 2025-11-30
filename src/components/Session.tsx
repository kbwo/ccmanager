import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useStdout} from 'ink';
import {Session as ISession} from '../types/index.js';
import {SessionManager} from '../services/sessionManager.js';
import {shortcutManager} from '../services/shortcutManager.js';

interface SessionProps {
	session: ISession;
	sessionManager: SessionManager;
	onReturnToMenu: () => void;
}

type StatusVariant = 'error' | 'pending' | null;

const Session: React.FC<SessionProps> = ({
	session,
	sessionManager,
	onReturnToMenu,
}) => {
	const {stdout} = useStdout();
	const [isExiting, setIsExiting] = useState(false);
	const deriveStatus = (
		currentSession: ISession,
	): {message: string | null; variant: StatusVariant} => {
		// Always prioritize showing the manual approval notice when verification failed
		if (currentSession.autoApprovalFailed) {
			return {
				message:
					'Auto-approval failed. Manual approval required—respond to the prompt.',
				variant: 'error',
			};
		}

		if (currentSession.state === 'pending_auto_approval') {
			return {
				message:
					'Auto-approval pending... verifying permissions (press any key to cancel)',
				variant: 'pending',
			};
		}

		return {message: null, variant: null};
	};

	const initialStatus = deriveStatus(session);
	const [statusMessage, setStatusMessage] = useState<string | null>(
		initialStatus.message,
	);
	const [statusVariant, setStatusVariant] = useState<StatusVariant>(
		initialStatus.variant,
	);
	const [columns, setColumns] = useState(
		() => stdout?.columns ?? process.stdout.columns ?? 80,
	);

	const {statusLineText, backgroundColor, textColor} = useMemo(() => {
		if (!statusMessage || !statusVariant) {
			return {
				statusLineText: null,
				backgroundColor: undefined,
				textColor: undefined,
			};
		}

		const maxContentWidth = Math.max(columns - 4, 0);
		const prefix =
			statusVariant === 'error'
				? '[AUTO-APPROVAL REQUIRED]'
				: '[AUTO-APPROVAL]';
		const prefixed = `${prefix} ${statusMessage.toUpperCase()}`;
		const trimmed =
			prefixed.length > maxContentWidth
				? prefixed.slice(0, maxContentWidth)
				: prefixed;

		return {
			statusLineText: ` ${trimmed}`.padEnd(columns, ' '),
			backgroundColor: statusVariant === 'error' ? '#d90429' : '#ffd166',
			textColor: statusVariant === 'error' ? 'white' : '#1c1c1c',
		};
	}, [columns, statusMessage, statusVariant]);

	useEffect(() => {
		const handleSessionStateChange = (updatedSession: ISession) => {
			if (updatedSession.id !== session.id) return;

			const {message, variant} = deriveStatus(updatedSession);
			setStatusMessage(message);
			setStatusVariant(variant);
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
		const handleSessionRestore = (restoredSession: ISession) => {
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
		const handleSessionData = (activeSession: ISession, data: string) => {
			// Only handle data for our session
			if (activeSession.id === session.id && !isExiting) {
				stdout.write(data);
			}
		};

		const handleSessionExit = (exitedSession: ISession) => {
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
			setColumns(cols);
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

			if (session.state === 'pending_auto_approval') {
				sessionManager.cancelAutoApproval(
					session.worktreePath,
					'User input received during auto-approval',
				);
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

	return statusLineText ? (
		<Box width="100%">
			<Text backgroundColor={backgroundColor} color={textColor} bold>
				{statusLineText}
			</Text>
		</Box>
	) : null;
};

export default Session;
