import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
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
}

interface MenuItem {
	label: string;
	value: string;
	worktree?: Worktree;
}

const Menu: React.FC<MenuProps> = ({sessionManager, onSelectWorktree}) => {
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
		const menuItems: MenuItem[] = items.map(item => {
			const label = assembleWorktreeLabel(item, columnPositions);

			return {
				label,
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
			label: `${MENU_ICONS.NEW_WORKTREE} New Worktree`,
			value: 'new-worktree',
		});
		menuItems.push({
			label: `${MENU_ICONS.MERGE_WORKTREE} Merge Worktree`,
			value: 'merge-worktree',
		});
		menuItems.push({
			label: `${MENU_ICONS.DELETE_WORKTREE} Delete Worktree`,
			value: 'delete-worktree',
		});
		menuItems.push({
			label: `${MENU_ICONS.CONFIGURE_SHORTCUTS} Configuration`,
			value: 'configuration',
		});
		menuItems.push({
			label: `${MENU_ICONS.EXIT} Exit`,
			value: 'exit',
		});
		setItems(menuItems);
	}, [worktrees, sessions, defaultBranch]);

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

			<SelectInput items={items} onSelect={handleSelect} isFocused={true} />

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					Status: {STATUS_ICONS.BUSY} {STATUS_LABELS.BUSY}{' '}
					{STATUS_ICONS.WAITING} {STATUS_LABELS.WAITING} {STATUS_ICONS.IDLE}{' '}
					{STATUS_LABELS.IDLE}
				</Text>
				<Text dimColor>Controls: ↑↓ Navigate Enter Select</Text>
			</Box>
		</Box>
	);
};

export default Menu;
