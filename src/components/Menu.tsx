import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Effect} from 'effect';
import {Worktree, Session, GitProject, MenuAction} from '../types/index.js';
import {WorktreeService} from '../services/worktreeService.js';
import {SessionManager} from '../services/sessionManager.js';
import {GitError} from '../types/errors.js';
import {
	STATUS_ICONS,
	STATUS_LABELS,
	MENU_ICONS,
} from '../constants/statusIcons.js';
import {useGitStatus} from '../hooks/useGitStatus.js';
import {
	prepareSessionItems,
	calculateColumnPositions,
	assembleSessionLabel,
} from '../utils/worktreeUtils.js';
import {projectManager} from '../services/projectManager.js';
import {RecentProject} from '../types/index.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {useDynamicLimit} from '../hooks/useDynamicLimit.js';
import {filterWorktreesByQuery} from '../utils/filterByQuery.js';
import SearchableList from './SearchableList.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {configReader} from '../services/config/configReader.js';

interface MenuProps {
	sessionManager: SessionManager;
	worktreeService: WorktreeService;
	onMenuAction: (action: MenuAction) => void;
	onSelectRecentProject?: (project: GitProject) => void;
	error?: string | null;
	onDismissError?: () => void;
	projectName?: string;
	multiProject?: boolean;
	version: string;
}

interface CommonItem {
	type: 'common';
	label: string;
	value: string;
}

interface SessionMenuItem {
	type: 'worktree';
	label: string;
	value: string;
	worktree: Worktree;
	session?: Session;
}

interface ProjectItem {
	type: 'project';
	label: string;
	value: string;
	recentProject: RecentProject;
}

type MenuItem = CommonItem | SessionMenuItem | ProjectItem;

const createSeparatorWithText = (
	text: string,
	totalWidth: number = 35,
): string => {
	const textWithSpaces = ` ${text} `;
	const textLength = textWithSpaces.length;
	const remainingWidth = totalWidth - textLength;
	const leftDashes = Math.floor(remainingWidth / 2);
	const rightDashes = Math.ceil(remainingWidth / 2);

	return '─'.repeat(leftDashes) + textWithSpaces + '─'.repeat(rightDashes);
};

/**
 * Format GitError for display
 * Extracts relevant error information using pattern matching
 */
const formatGitError = (error: GitError): string => {
	return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
};

const Menu: React.FC<MenuProps> = ({
	sessionManager,
	worktreeService,
	onMenuAction,
	onSelectRecentProject,
	error,
	onDismissError,
	projectName,
	multiProject = false,
	version,
}) => {
	const [baseWorktrees, setBaseWorktrees] = useState<Worktree[]>([]);
	const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const worktrees = useGitStatus(baseWorktrees, defaultBranch);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [items, setItems] = useState<MenuItem[]>([]);
	const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
	const [highlightedWorktreePath, setHighlightedWorktreePath] = useState<
		string | null
	>(null);
	const [highlightedSession, setHighlightedSession] = useState<
		Session | undefined
	>(undefined);
	const [autoApprovalToggleCounter, setAutoApprovalToggleCounter] = useState(0);

	// Use the search mode hook
	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(items.length, {
			isDisabled: !!error || !!loadError,
		});

	const limit = useDynamicLimit({
		isSearchMode,
		hasError: !!(error || loadError),
	});

	// Get worktree configuration for sorting
	const worktreeConfig = configReader.getWorktreeConfig();

	useEffect(() => {
		let cancelled = false;

		// Load worktrees and default branch using Effect composition
		// Chain getWorktreesEffect and getDefaultBranchEffect using Effect.flatMap
		const loadWorktreesAndBranch = Effect.flatMap(
			worktreeService.getWorktreesEffect(),
			worktrees =>
				Effect.map(worktreeService.getDefaultBranchEffect(), defaultBranch => ({
					worktrees,
					defaultBranch,
				})),
		);

		Effect.runPromise(
			Effect.match(loadWorktreesAndBranch, {
				onFailure: (error: GitError) => ({
					success: false as const,
					error,
				}),
				onSuccess: ({worktrees, defaultBranch}) => ({
					success: true as const,
					worktrees,
					defaultBranch,
				}),
			}),
		)
			.then(result => {
				if (!cancelled) {
					if (result.success) {
						// Update sessions after worktrees are loaded
						const allSessions = sessionManager.getAllSessions();
						setSessions(allSessions);

						// Update worktree session status
						result.worktrees.forEach(wt => {
							wt.hasSession = allSessions.some(s => s.worktreePath === wt.path);
						});

						setBaseWorktrees(result.worktrees);
						setDefaultBranch(result.defaultBranch);
						setLoadError(null);
					} else {
						// Handle GitError with pattern matching
						setLoadError(formatGitError(result.error));
					}
				}
			})
			.catch((err: unknown) => {
				// This catch should not normally be reached with Effect.match
				if (!cancelled) {
					setLoadError(String(err));
				}
			});

		// Load recent projects if in multi-project mode
		if (multiProject) {
			// Filter out the current project from recent projects
			const allRecentProjects = projectManager.getRecentProjects();
			const currentProjectPath = worktreeService.getGitRootPath();
			const filteredProjects = allRecentProjects.filter(
				(project: RecentProject) => project.path !== currentProjectPath,
			);
			setRecentProjects(filteredProjects);
		}

		// Listen for session changes
		const handleSessionChange = () => {
			const allSessions = sessionManager.getAllSessions();
			setSessions(allSessions);
		};
		sessionManager.on('sessionCreated', handleSessionChange);
		sessionManager.on('sessionDestroyed', handleSessionChange);
		sessionManager.on('sessionStateChanged', handleSessionChange);

		return () => {
			cancelled = true;
			sessionManager.off('sessionCreated', handleSessionChange);
			sessionManager.off('sessionDestroyed', handleSessionChange);
			sessionManager.off('sessionStateChanged', handleSessionChange);
		};
	}, [sessionManager, worktreeService, multiProject]);

	useEffect(() => {
		// Prepare worktree items and calculate layout
		const items = prepareSessionItems(worktrees, sessions, {
			sortByLastSession: worktreeConfig.sortByLastSession,
		});
		const columnPositions = calculateColumnPositions(items);

		// Filter worktrees based on search query
		const filteredWorktrees = filterWorktreesByQuery(
			items.map(item => item.worktree),
			searchQuery,
		);
		const filteredWorktreeSet = new Set(filteredWorktrees);
		const filteredItems = items.filter(item =>
			filteredWorktreeSet.has(item.worktree),
		);

		// Build menu items with proper alignment
		const menuItems: MenuItem[] = filteredItems.map(
			(item, index): SessionMenuItem => {
				const baseLabel = assembleSessionLabel(item, columnPositions);
				const aaDisabled =
					configReader.isAutoApprovalEnabled() &&
					sessionManager.isAutoApprovalDisabledForWorktree(item.worktree.path);
				const label = baseLabel + (aaDisabled ? ' [Auto Approval Off]' : '');

				// Only show numbers for worktrees (0-9) when not in search mode
				// Use fixed-width prefix to prevent flicker at scroll boundary
				const numberPrefix =
					!isSearchMode && index < 10 ? `${index} ❯ ` : '  ❯ ';

				// Use session meta id for value if present, otherwise worktree path
				const value = item.session
					? `session:${item.session.id}`
					: item.worktree.path;

				return {
					type: 'worktree',
					label: numberPrefix + label,
					value,
					worktree: item.worktree,
					session: item.session,
				};
			},
		);

		// Filter recent projects based on search query
		const filteredRecentProjects = searchQuery
			? recentProjects.filter(project =>
					project.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: recentProjects;

		// Add menu options only when not in search mode
		if (!isSearchMode) {
			// Add recent projects section if enabled and has recent projects
			if (multiProject && filteredRecentProjects.length > 0) {
				menuItems.push({
					type: 'common',
					label: createSeparatorWithText('Recent'),
					value: 'recent-separator',
				});

				// Add recent projects
				// Calculate available number shortcuts for recent projects
				const worktreeCount = filteredItems.length;
				const availableNumbersForProjects = worktreeCount < 10;

				filteredRecentProjects.forEach((project, index) => {
					// Get session counts for this project
					const projectSessions = globalSessionOrchestrator.getProjectSessions(
						project.path,
					);
					const counts = SessionManager.getSessionCounts(projectSessions);
					const countsFormatted = SessionManager.formatSessionCounts(counts);

					// Assign number shortcuts to recent projects if worktrees < 10
					let label = project.name + countsFormatted;
					if (availableNumbersForProjects) {
						const projectNumber = worktreeCount + index;
						if (projectNumber < 10) {
							label = `${projectNumber} ❯ ${label}`;
						} else {
							label = `❯ ${label}`;
						}
					} else {
						label = `❯ ${label}`;
					}

					menuItems.push({
						type: 'project',
						label,
						value: `recent-project-${index}`,
						recentProject: project,
					});
				});
			}

			// Add menu options
			const otherMenuItems: MenuItem[] = [
				{
					type: 'common',
					label: createSeparatorWithText('Other'),
					value: 'other-separator',
				},
				{
					type: 'common',
					label: `N ${MENU_ICONS.NEW_WORKTREE} New Worktree`,
					value: 'new-worktree',
				},
				{
					type: 'common',
					label: `M ${MENU_ICONS.MERGE_WORKTREE} Merge Worktree`,
					value: 'merge-worktree',
				},
				{
					type: 'common',
					label: `D ${MENU_ICONS.DELETE_WORKTREE} Delete Worktree`,
					value: 'delete-worktree',
				},
			];

			// Add configuration menu items based on multiProject mode
			if (multiProject) {
				// In multi-project mode, only show global configuration (backward compatible)
				otherMenuItems.push({
					type: 'common',
					label: `C ${MENU_ICONS.CONFIGURE_SHORTCUTS} Configuration`,
					value: 'configuration',
				});
			} else {
				// In single-project mode, show both Project and Global configuration
				otherMenuItems.push({
					type: 'common',
					label: `P ${MENU_ICONS.CONFIGURE_SHORTCUTS} Project Configuration`,
					value: 'configuration-project',
				});
				otherMenuItems.push({
					type: 'common',
					label: `C ${MENU_ICONS.CONFIGURE_SHORTCUTS} Global Configuration`,
					value: 'configuration-global',
				});
			}

			menuItems.push(...otherMenuItems);
			if (projectName) {
				// In multi-project mode, show 'Back to project list'
				menuItems.push({
					type: 'common',
					label: `B 🔙 Back to project list`,
					value: 'back-to-projects',
				});
			} else {
				// In single-project mode, show 'Exit'
				menuItems.push({
					type: 'common',
					label: `Q ${MENU_ICONS.EXIT} Exit`,
					value: 'exit',
				});
			}
		}
		setItems(menuItems);

		// Ensure highlighted worktree path is valid for hotkey support
		setHighlightedWorktreePath(prev => {
			if (
				prev &&
				menuItems.some(
					item => item.type === 'worktree' && item.worktree.path === prev,
				)
			) {
				return prev;
			}
			const first = menuItems.find(item => item.type === 'worktree');
			if (first && first.type === 'worktree') {
				setHighlightedSession(first.session);
				return first.worktree.path;
			}
			setHighlightedSession(undefined);
			return null;
		});
	}, [
		worktrees,
		sessions,
		defaultBranch,
		projectName,
		multiProject,
		recentProjects,
		searchQuery,
		isSearchMode,
		autoApprovalToggleCounter,
		sessionManager,
		worktreeConfig.sortByLastSession,
	]);

	// Handle hotkeys
	useInput((input, _key) => {
		// Skip in test environment to avoid stdin.ref error
		if (!process.stdin.setRawMode) {
			return;
		}

		// Dismiss error on any key press when error is shown
		if (error && onDismissError) {
			onDismissError();
			return;
		}

		// Dismiss load error on any key press when load error is shown
		if (loadError) {
			setLoadError(null);
			return;
		}

		// Don't process other keys if in search mode (handled by useSearchMode)
		if (isSearchMode) {
			return;
		}

		const keyPressed = input.toLowerCase();

		// Handle number keys 0-9 for worktree selection
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			// Get filtered worktree items
			const worktreeItems = items.filter(item => item.type === 'worktree');
			const projectItems = items.filter(item => item.type === 'project');

			// Check if it's a worktree
			if (index < worktreeItems.length && worktreeItems[index]) {
				onMenuAction({
					type: 'selectWorktree',
					worktree: worktreeItems[index].worktree,
					session: worktreeItems[index].session,
				});
				return;
			}

			// Check if it's a recent project (when worktrees < 10)
			if (worktreeItems.length < 10) {
				const projectIndex = index - worktreeItems.length;
				if (
					projectIndex >= 0 &&
					projectIndex < projectItems.length &&
					projectItems[projectIndex]
				) {
					handleSelect(projectItems[projectIndex]);
				}
			}
			return;
		}

		switch (keyPressed) {
			case 'a':
				// Toggle auto-approval for the currently highlighted worktree
				if (configReader.isAutoApprovalEnabled() && highlightedWorktreePath) {
					sessionManager.toggleAutoApprovalForWorktree(highlightedWorktreePath);
					setAutoApprovalToggleCounter(c => c + 1);
				}
				break;
			case 's':
				// Create new session for highlighted worktree
				if (highlightedWorktreePath) {
					onMenuAction({
						type: 'newSession',
						worktreePath: highlightedWorktreePath,
					});
				}
				break;
			case 'r':
				// Rename highlighted session
				if (highlightedSession) {
					onMenuAction({
						type: 'renameSession',
						session: highlightedSession,
					});
				}
				break;
			case 'n':
				onMenuAction({type: 'newWorktree'});
				break;
			case 'm':
				onMenuAction({type: 'mergeWorktree'});
				break;
			case 'd':
				onMenuAction({type: 'deleteWorktree'});
				break;
			case 'p':
				// Trigger project configuration action (only in single-project mode)
				if (!multiProject) {
					onMenuAction({type: 'configuration', scope: 'project'});
				}
				break;
			case 'c':
				onMenuAction({type: 'configuration', scope: 'global'});
				break;
			case 'b':
				// In multi-project mode, go back to project list
				if (projectName) {
					onMenuAction({type: 'exit'});
				}
				break;
			case 'x':
				// Kill session if one is highlighted, otherwise exit
				if (highlightedSession) {
					onMenuAction({
						type: 'killSession',
						sessionId: highlightedSession.id,
					});
				} else if (!projectName) {
					onMenuAction({type: 'exit'});
				}
				break;
			case 'q':
				// Trigger exit action (only in single-project mode)
				if (!projectName) {
					onMenuAction({type: 'exit'});
				}
				break;
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value.endsWith('-separator') || item.value === 'recent-header') {
			// Do nothing for separators and headers
		} else if (item.type === 'project') {
			if (onSelectRecentProject) {
				const project: GitProject = {
					path: item.recentProject.path,
					name: item.recentProject.name,
					relativePath: item.recentProject.path,
					isValid: true,
				};
				onSelectRecentProject(project);
			}
		} else if (item.value === 'new-worktree') {
			onMenuAction({type: 'newWorktree'});
		} else if (item.value === 'merge-worktree') {
			onMenuAction({type: 'mergeWorktree'});
		} else if (item.value === 'delete-worktree') {
			onMenuAction({type: 'deleteWorktree'});
		} else if (item.value === 'configuration') {
			onMenuAction({type: 'configuration', scope: 'global'});
		} else if (item.value === 'configuration-project') {
			onMenuAction({type: 'configuration', scope: 'project'});
		} else if (item.value === 'configuration-global') {
			onMenuAction({type: 'configuration', scope: 'global'});
		} else if (item.value === 'exit' || item.value === 'back-to-projects') {
			onMenuAction({type: 'exit'});
		} else if (item.type === 'worktree') {
			onMenuAction({
				type: 'selectWorktree',
				worktree: item.worktree,
				session: item.session,
			});
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1} flexDirection="column">
				<Text bold color="green">
					CCManager - Claude Code Worktree Manager v{version}
				</Text>
				{projectName && (
					<Text bold color="green">
						{projectName}
					</Text>
				)}
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Select a worktree to start or resume a Claude Code session:
				</Text>
			</Box>

			<SearchableList
				isSearchMode={isSearchMode}
				searchQuery={searchQuery}
				onSearchQueryChange={setSearchQuery}
				selectedIndex={selectedIndex}
				items={items}
				limit={limit}
				placeholder="Type to filter worktrees..."
				noMatchMessage="No worktrees match your search"
			>
				<SelectInput
					items={items}
					onSelect={item => handleSelect(item as MenuItem)}
					onHighlight={item => {
						// ink-select-input may call onHighlight with undefined when items are empty
						// (e.g., during menu re-mount after returning from a session), so guard it.
						if (!item) {
							return;
						}
						const menuItem = item as MenuItem;
						if (menuItem.type === 'worktree') {
							setHighlightedWorktreePath(menuItem.worktree.path);
							setHighlightedSession(menuItem.session);
						}
					}}
					isFocused={!error}
					initialIndex={selectedIndex}
					limit={limit}
				/>
			</SearchableList>

			{(error || loadError) && (
				<Box marginTop={1} paddingX={1} borderStyle="round" borderColor="red">
					<Box flexDirection="column">
						<Text color="red" bold>
							Error: {error || loadError}
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
					{configReader.isAutoApprovalEnabled() && (
						<>
							{' | '}
							<Text color="green">Auto Approval Enabled</Text>
						</>
					)}
				</Text>
				<Text dimColor>
					{isSearchMode
						? 'Search Mode: Type to filter, Enter to exit search, ESC to exit search'
						: searchQuery
							? `Filtered: "${searchQuery}" | ↑↓ Navigate Enter Select | /-Search ESC-Clear 0-9 Quick Select N-New S-NewSession R-Rename X-KillSession M-Merge D-Delete ${
									configReader.isAutoApprovalEnabled() ? 'A-AutoApproval ' : ''
								}${
									multiProject ? 'C-Config' : 'P-ProjConfig C-GlobalConfig'
								} ${projectName ? 'B-Back' : 'Q-Quit'}`
							: `Controls: ↑↓ Navigate Enter Select | Hotkeys: 0-9 Quick Select /-Search N-New S-NewSession R-Rename X-KillSession M-Merge D-Delete ${
									configReader.isAutoApprovalEnabled() ? 'A-AutoApproval ' : ''
								}${
									multiProject ? 'C-Config' : 'P-ProjConfig C-GlobalConfig'
								} ${projectName ? 'B-Back' : 'Q-Quit'}`}
				</Text>
			</Box>
		</Box>
	);
};

export default Menu;
