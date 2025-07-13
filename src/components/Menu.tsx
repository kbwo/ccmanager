import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Worktree, Session} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import {SessionManager} from '../services/sessionManager.js';
import {
	STATUS_ICONS,
	STATUS_LABELS,
	MENU_ICONS,
} from '../constants/statusIcons.js';
import {useGitStatus} from '../hooks/useGitStatus.js';
import {
	prepareWorktreeItems,
	calculateColumnPositions,
	assembleWorktreeLabel,
} from '../utils/worktreeUtils.js';

interface MenuProps {
	sessionManager: SessionManager;
	onSelectWorktree: (worktree: Worktree) => void;
	error?: string | null;
	onDismissError?: () => void;
}

interface MenuItem {
	label: string;
	value: string;
	worktree?: Worktree;
}

const Menu: React.FC<MenuProps> = ({
	sessionManager,
	onSelectWorktree,
	error,
	onDismissError,
}) => {
	const [baseWorktrees, setBaseWorktrees] = useState<Worktree[]>([]);
	const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
	const worktrees = useGitStatus(baseWorktrees, defaultBranch);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [items, setItems] = useState<MenuItem[]>([]);

	useEffect(() => {
		// Load worktrees
		const worktreeService = new WorktreeService();
		const loadedWorktrees = worktreeService.getWorktrees();
		setBaseWorktrees(loadedWorktrees);
		setDefaultBranch(worktreeService.getDefaultBranch());

		// Update sessions
		const updateSessions = () => {
			const allSessions = sessionManager.getAllSessions();
			setSessions(allSessions);

			// Update worktree session status
			loadedWorktrees.forEach(wt => {
				wt.hasSession = allSessions.some(s => s.worktreePath === wt.path);
			});
		};

		updateSessions();

		// Listen for session changes
		const handleSessionChange = () => updateSessions();
		sessionManager.on('sessionCreated', handleSessionChange);
		sessionManager.on('sessionDestroyed', handleSessionChange);
		sessionManager.on('sessionStateChanged', handleSessionChange);

		return () => {
			sessionManager.off('sessionCreated', handleSessionChange);
			sessionManager.off('sessionDestroyed', handleSessionChange);
			sessionManager.off('sessionStateChanged', handleSessionChange);
		};
	}, [sessionManager]);

	useEffect(() => {
		// Prepare worktree items and calculate layout
		const items = prepareWorktreeItems(worktrees, sessions);
		const columnPositions = calculateColumnPositions(items);

		// Build menu items with proper alignment
		const menuItems: MenuItem[] = items.map((item, index) => {
			const label = assembleWorktreeLabel(item, columnPositions);

			// Only show numbers for first 10 worktrees (0-9)
			const numberPrefix = index < 10 ? `${index} ❯ ` : '❯ ';

			return {
				label: numberPrefix + label,
				value: item.worktree.path,
				worktree: item.worktree,
			};
		});

		// Add menu options
		menuItems.push({
			label: '─────────────',
			value: 'separator',
		});
		menuItems.push({
			label: `N ${MENU_ICONS.NEW_WORKTREE} New Worktree`,
			value: 'new-worktree',
		});
		menuItems.push({
			label: `M ${MENU_ICONS.MERGE_WORKTREE} Merge Worktree`,
			value: 'merge-worktree',
		});
		menuItems.push({
			label: `D ${MENU_ICONS.DELETE_WORKTREE} Delete Worktree`,
			value: 'delete-worktree',
		});
		menuItems.push({
			label: `C ${MENU_ICONS.CONFIGURE_SHORTCUTS} Configuration`,
			value: 'configuration',
		});
		menuItems.push({
			label: `Q ${MENU_ICONS.EXIT} Exit`,
			value: 'exit',
		});
		setItems(menuItems);
	}, [worktrees, sessions, defaultBranch]);

	// Handle hotkeys
	useInput((input, _key) => {
		// Dismiss error on any key press when error is shown
		if (error && onDismissError) {
			onDismissError();
			return;
		}

		const keyPressed = input.toLowerCase();

		// Handle number keys 0-9 for worktree selection (first 10 only)
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			if (index < Math.min(10, worktrees.length) && worktrees[index]) {
				onSelectWorktree(worktrees[index]);
			}
			return;
		}

		switch (keyPressed) {
			case 'n':
				// Trigger new worktree action
				onSelectWorktree({
					path: '',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'm':
				// Trigger merge worktree action
				onSelectWorktree({
					path: 'MERGE_WORKTREE',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'd':
				// Trigger delete worktree action
				onSelectWorktree({
					path: 'DELETE_WORKTREE',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'c':
				// Trigger configuration action
				onSelectWorktree({
					path: 'CONFIGURATION',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
			case 'q':
			case 'x':
				// Trigger exit action
				onSelectWorktree({
					path: 'EXIT_APPLICATION',
					branch: '',
					isMainWorktree: false,
					hasSession: false,
				});
				break;
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value === 'separator') {
			// Do nothing for separator
		} else if (item.value === 'new-worktree') {
			// Handle in parent component
			onSelectWorktree({
				path: '',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'merge-worktree') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'MERGE_WORKTREE',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'delete-worktree') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'DELETE_WORKTREE',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'configuration') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'CONFIGURATION',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.value === 'exit') {
			// Handle in parent component - use special marker
			onSelectWorktree({
				path: 'EXIT_APPLICATION',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			});
		} else if (item.worktree) {
			onSelectWorktree(item.worktree);
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					CCManager - Claude Code Worktree Manager
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Select a worktree to start or resume a Claude Code session:
				</Text>
			</Box>

			<SelectInput items={items} onSelect={handleSelect} isFocused={!error} />

			{error && (
				<Box marginTop={1} paddingX={1} borderStyle="round" borderColor="red">
					<Box flexDirection="column">
						<Text color="red" bold>
							Error: {error}
						</Text>
						<Text color="gray" dimColor>
							Press any key to dismiss
						</Text>
					</Box>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					Status: {STATUS_ICONS.BUSY} {STATUS_LABELS.BUSY}{' '}
					{STATUS_ICONS.WAITING} {STATUS_LABELS.WAITING} {STATUS_ICONS.IDLE}{' '}
					{STATUS_LABELS.IDLE}
				</Text>
				<Text dimColor>
					Controls: ↑↓ Navigate Enter Select | Hotkeys: 0-9 Quick Select (first
					10) N-New M-Merge D-Delete C-Config Q-Quit
				</Text>
			</Box>
		</Box>
	);
};

export default Menu;
