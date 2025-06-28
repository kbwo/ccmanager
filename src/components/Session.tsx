import React, {useEffect, useState, useCallback} from 'react';
import {useStdout} from 'ink';
import {Session as SessionType, TerminalMode} from '../types/index.js';
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
	const [currentMode, setCurrentMode] = useState<TerminalMode>(
		session.currentMode,
	);

	// Display mode indicator
	const displayModeIndicator = useCallback(
		(mode: TerminalMode) => {
			const toggleShortcut = shortcutManager.getShortcutDisplay('toggleMode');
			const menuShortcut = shortcutManager.getShortcutDisplay('returnToMenu');
			const indicator =
				mode === 'claude'
					? `\x1b[44m Claude \x1b[0m \x1b[90m(${toggleShortcut}: Bash | ${menuShortcut}: Menu)\x1b[0m`
					: `\x1b[42m Bash \x1b[0m \x1b[90m(${toggleShortcut}: Claude | ${menuShortcut}: Menu)\x1b[0m`;

			// Display in status line at top of terminal (FIXED: removed cursor save/restore for NBIM compatibility)
			stdout.write(`\x1b[1;1H${indicator}\n`);
		},
		[stdout],
	);

	// Mode switching function
	const toggleMode = useCallback(() => {
		const newMode = currentMode === 'claude' ? 'bash' : 'claude';

		// Update mode state
		setCurrentMode(newMode);
		session.currentMode = newMode;

		// Clear screen for clean switch
		stdout.write('\x1B[2J\x1B[H');

		// Show current terminal content based on mode
		if (newMode === 'bash') {
			// Display bash history
			for (const buffer of session.bashHistory) {
				stdout.write(buffer);
			}
			
			// If bash history is empty, initialize bash with newline to get prompt
			if (session.bashHistory.length === 0) {
				setTimeout(() => {
					session.bashProcess.write('\n');
				}, 100);
			}
		} else {
			// Display claude history
			for (const buffer of session.outputHistory) {
				stdout.write(buffer);
			}
		}

		// Display mode indicator
		displayModeIndicator(newMode);
	}, [currentMode, session, stdout, displayModeIndicator]);

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

					const str = buffer.toString('utf8');

					// Skip clear screen sequences at the beginning
					if (i === 0 && (str.includes('\x1B[2J') || str.includes('\x1B[H'))) {
						// Skip this buffer or remove the clear sequence
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
			}
		};

		// Handle bash session restoration
		const handleBashSessionRestore = (restoredSession: SessionType) => {
			if (restoredSession.id === session.id) {
				// Replay all bash buffered output, using the same robust logic as Claude
				for (let i = 0; i < restoredSession.bashHistory.length; i++) {
					const buffer = restoredSession.bashHistory[i];
					if (!buffer) continue;

					const str = buffer.toString('utf8');

					// Skip clear screen sequences at the beginning
					if (i === 0 && (str.includes('\x1B[2J') || str.includes('\x1B[H'))) {
						// Skip this buffer or remove the clear sequence
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
			}
		};

		// Listen for restore events first
		sessionManager.on('sessionRestore', handleSessionRestore);
		sessionManager.on('bashSessionRestore', handleBashSessionRestore);

		// Mark session as active (this will trigger the restore event)
		sessionManager.setSessionActive(session.worktreePath, true);

		// Display initial mode indicator
		setTimeout(() => {
			displayModeIndicator(currentMode);
		}, 100);

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
			// Only handle data for our session and if in Claude mode
			if (
				activeSession.id === session.id &&
				!isExiting &&
				session.currentMode === 'claude'
			) {
				stdout.write(data);
			}
		};

		const handleBashSessionData = (
			activeSession: SessionType,
			data: string,
		) => {
			// Only handle data for our session and if in bash mode
			if (
				activeSession.id === session.id &&
				!isExiting &&
				session.currentMode === 'bash'
			) {
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
		sessionManager.on('bashSessionData', handleBashSessionData);
		sessionManager.on('sessionExit', handleSessionExit);

		// Handle terminal resize
		const handleResize = () => {
			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;

			// Resize Claude PTY and virtual terminal
			try {
				session.process.resize(cols, rows);
				if (session.terminal) {
					session.terminal.resize(cols, rows);
				}
			} catch {
				// Process might have exited
			}

			// Resize bash PTY (always exists)
			try {
				session.bashProcess.resize(cols, rows);
				session.bashTerminal.resize(cols, rows);
			} catch {
				// Bash process might have exited
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

			const shortcuts = shortcutManager.getShortcuts();

			// Check for return to menu shortcut
			const returnToMenuCode = shortcutManager.getShortcutCode(
				shortcuts.returnToMenu,
			);
			if (returnToMenuCode && data === returnToMenuCode) {
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

			// Check for mode toggle shortcut
			const toggleModeCode = shortcutManager.getShortcutCode(
				shortcuts.toggleMode,
			);
			if (toggleModeCode && data === toggleModeCode) {
				toggleMode();
				return;
			}

			// Route input to appropriate PTY based on current mode
			if (currentMode === 'claude') {
				session.process.write(data);
			} else {
				// Bash mode - write to bash PTY
				session.bashProcess.write(data);
			}
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
			sessionManager.off('bashSessionRestore', handleBashSessionRestore);
			sessionManager.off('sessionData', handleSessionData);
			sessionManager.off('bashSessionData', handleBashSessionData);
			sessionManager.off('sessionExit', handleSessionExit);
			stdout.off('resize', handleResize);
		};
	}, [
		session,
		sessionManager,
		stdout,
		onReturnToMenu,
		isExiting,
		displayModeIndicator,
		toggleMode,
		currentMode,
	]);

	// Return null to render nothing (PTY output goes directly to stdout)
	return null;
};

export default Session;
