import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {Effect} from 'effect';
import SelectInput from 'ink-select-input';
import stripAnsi from 'strip-ansi';
import {
	GitProject,
	Session as ISession,
	Worktree,
	RecentProject,
} from '../types/index.js';
import {type AppError} from '../types/errors.js';
import {projectManager} from '../services/projectManager.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {SessionManager} from '../services/sessionManager.js';
import {WorktreeService} from '../services/worktreeService.js';
import {
	STATUS_ICONS,
	STATUS_LABELS,
	MENU_ICONS,
	getStatusDisplay,
} from '../constants/statusIcons.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {useGitStatus} from '../hooks/useGitStatus.js';
import {
	type WorktreeItem,
	truncateString,
	calculateColumnPositions,
	assembleWorktreeLabel,
} from '../utils/worktreeUtils.js';
import {
	formatGitFileChanges,
	formatGitAheadBehind,
	formatParentBranch,
} from '../utils/gitStatus.js';
import TextInputWrapper from './TextInputWrapper.js';

const MAX_BRANCH_NAME_LENGTH = 70;

interface DashboardProps {
	projectsDir: string;
	onSelectSession: (session: ISession, project: GitProject) => void;
	onSelectProject: (project: GitProject) => void;
	error: string | null;
	onDismissError: () => void;
	version: string;
}

interface SessionDashboardItem {
	type: 'session';
	label: string;
	value: string;
	session: ISession;
	project: GitProject;
}

interface ProjectDashboardItem {
	type: 'project';
	label: string;
	value: string;
	project: GitProject;
}

interface CommonDashboardItem {
	type: 'common';
	label: string;
	value: string;
}

type DashboardItem =
	| SessionDashboardItem
	| ProjectDashboardItem
	| CommonDashboardItem;

/** Session metadata for mapping sessions to projects and worktrees. */
interface SessionEntry {
	session: ISession;
	projectPath: string;
	projectName: string;
	worktree: Worktree;
}

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

const formatErrorMessage = (error: AppError): string => {
	switch (error._tag) {
		case 'ProcessError':
			return `Process error: ${error.message}`;
		case 'ConfigError':
			return `Configuration error (${error.reason}): ${error.details}`;
		case 'GitError':
			return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
		case 'FileSystemError':
			return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
		case 'ValidationError':
			return `Validation failed for ${error.field}: ${error.constraint}`;
	}
};

/** Sort sessions: busy first, then waiting/pending, then idle. Within same state, by lastActivity desc. */
function sessionSortKey(session: ISession): number {
	const stateData = session.stateMutex.getSnapshot();
	switch (stateData.state) {
		case 'busy':
			return 0;
		case 'waiting_input':
		case 'pending_auto_approval':
			return 1;
		case 'idle':
			return 2;
	}
}

/** Resolve the display name for a project, using relativePath if names collide. */
function resolveProjectDisplayNames(
	projects: GitProject[],
): Map<string, string> {
	const nameCount = new Map<string, number>();
	for (const p of projects) {
		nameCount.set(p.name, (nameCount.get(p.name) || 0) + 1);
	}
	const displayNames = new Map<string, string>();
	for (const p of projects) {
		displayNames.set(
			p.path,
			nameCount.get(p.name)! > 1 ? p.relativePath : p.name,
		);
	}
	return displayNames;
}

const Dashboard: React.FC<DashboardProps> = ({
	projectsDir,
	onSelectSession,
	onSelectProject,
	error,
	onDismissError,
	version,
}) => {
	const [projects, setProjects] = useState<GitProject[]>([]);
	const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [items, setItems] = useState<DashboardItem[]>([]);

	// Session-related state
	const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]);
	const [baseSessionWorktrees, setBaseSessionWorktrees] = useState<Worktree[]>(
		[],
	);
	const [sessionRefreshKey, setSessionRefreshKey] = useState(0);

	const {stdout} = useStdout();
	const fixedRows = 6;

	const displayError = error || loadError;

	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(items.length, {
			isDisabled: !!displayError,
			skipInTest: false,
		});

	const limit = Math.max(
		5,
		stdout.rows - fixedRows - (isSearchMode ? 1 : 0) - (displayError ? 3 : 0),
	);

	// Git status polling for session worktrees
	const enrichedWorktrees = useGitStatus(
		baseSessionWorktrees,
		baseSessionWorktrees.length > 0 ? 'main' : null,
	);

	// Discover projects on mount
	useEffect(() => {
		let cancelled = false;

		const loadProjects = async () => {
			setLoading(true);
			setLoadError(null);

			const result = await Effect.runPromise(
				Effect.either(
					projectManager.instance.discoverProjectsEffect(projectsDir),
				),
			);

			if (cancelled) return;

			if (result._tag === 'Left') {
				setLoadError(formatErrorMessage(result.left));
				setLoading(false);
				return;
			}

			setProjects(result.right);
			setRecentProjects(projectManager.getRecentProjects(0));
			setLoading(false);
		};

		loadProjects();

		return () => {
			cancelled = true;
		};
	}, [projectsDir]);

	// Load session worktree data on mount + sessionRefreshKey
	useEffect(() => {
		let cancelled = false;

		const loadSessionData = async () => {
			const projectPaths = globalSessionOrchestrator.getProjectPaths();
			const entries: SessionEntry[] = [];
			const worktrees: Worktree[] = [];

			// Build a project lookup map
			const projectByPath = new Map<string, GitProject>();
			for (const p of projects) {
				projectByPath.set(p.path, p);
			}
			const displayNames = resolveProjectDisplayNames(projects);

			for (const projectPath of projectPaths) {
				const sessions =
					globalSessionOrchestrator.getProjectSessions(projectPath);
				if (sessions.length === 0) continue;

				// Load worktrees for this project to resolve branch names
				const ws = new WorktreeService(projectPath);
				const result = await Effect.runPromise(
					Effect.either(ws.getWorktreesEffect()),
				);

				if (cancelled) return;

				if (result._tag === 'Left') continue;

				const projectWorktrees = result.right;
				const project = projectByPath.get(projectPath);
				const projectName =
					displayNames.get(projectPath) ||
					project?.name ||
					projectPath.split('/').pop() ||
					projectPath;

				// Mark worktrees that have sessions
				for (const wt of projectWorktrees) {
					wt.hasSession = sessions.some(s => s.worktreePath === wt.path);
				}

				for (const session of sessions) {
					const wt = projectWorktrees.find(
						w => w.path === session.worktreePath,
					);
					if (!wt) continue;

					entries.push({
						session,
						projectPath,
						projectName,
						worktree: wt,
					});
					worktrees.push(wt);
				}
			}

			if (cancelled) return;

			// Sort sessions: busy > waiting > idle, then by lastActivity desc
			entries.sort((a, b) => {
				const keyA = sessionSortKey(a.session);
				const keyB = sessionSortKey(b.session);
				if (keyA !== keyB) return keyA - keyB;
				return (
					b.session.lastActivity.getTime() - a.session.lastActivity.getTime()
				);
			});

			setSessionEntries(entries);
			setBaseSessionWorktrees(prev => {
				// Avoid restarting git status polling if the set of paths hasn't changed
				const prevPaths = prev
					.map(w => w.path)
					.sort()
					.join('\0');
				const newPaths = worktrees
					.map(w => w.path)
					.sort()
					.join('\0');
				return prevPaths === newPaths ? prev : worktrees;
			});
		};

		loadSessionData();

		return () => {
			cancelled = true;
		};
	}, [sessionRefreshKey, projects]);

	// Subscribe to session events from all managers
	useEffect(() => {
		const refresh = () => setSessionRefreshKey(k => k + 1);

		const projectPaths = globalSessionOrchestrator.getProjectPaths();
		const managers: SessionManager[] = projectPaths.map(p =>
			globalSessionOrchestrator.getManagerForProject(p),
		);

		for (const mgr of managers) {
			mgr.on('sessionCreated', refresh);
			mgr.on('sessionDestroyed', refresh);
			mgr.on('sessionStateChanged', refresh);
		}

		return () => {
			for (const mgr of managers) {
				mgr.off('sessionCreated', refresh);
				mgr.off('sessionDestroyed', refresh);
				mgr.off('sessionStateChanged', refresh);
			}
		};
	}, [sessionRefreshKey]);

	// Build display items
	const projectDisplayNames = useMemo(
		() => resolveProjectDisplayNames(projects),
		[projects],
	);

	useEffect(() => {
		const menuItems: DashboardItem[] = [];
		let currentIndex = 0;

		// --- Active Sessions section ---
		if (sessionEntries.length > 0) {
			// Build WorktreeItems for column alignment
			const sessionWorkItems: WorktreeItem[] = sessionEntries.map(entry => {
				// Use enriched worktree if available (has git status)
				const wt =
					enrichedWorktrees.find(w => w.path === entry.worktree.path) ||
					entry.worktree;
				const stateData = entry.session.stateMutex.getSnapshot();
				const status = ` [${getStatusDisplay(stateData.state, stateData.backgroundTaskCount, stateData.teamMemberCount)}]`;
				const fullBranchName = wt.branch
					? wt.branch.replace('refs/heads/', '')
					: wt.path.split('/').pop() || 'detached';
				const branchName = truncateString(
					fullBranchName,
					MAX_BRANCH_NAME_LENGTH,
				);
				const isMain = wt.isMainWorktree ? ' (main)' : '';
				const baseLabel = `${entry.projectName} :: ${branchName}${isMain}${status}`;

				let fileChanges = '';
				let aheadBehind = '';
				let parentBranch = '';
				let itemError = '';

				if (wt.gitStatus) {
					fileChanges = formatGitFileChanges(wt.gitStatus);
					aheadBehind = formatGitAheadBehind(wt.gitStatus);
					parentBranch = formatParentBranch(
						wt.gitStatus.parentBranch,
						fullBranchName,
					);
				} else if (wt.gitStatusError) {
					itemError = `\x1b[31m[git error]\x1b[0m`;
				} else {
					fileChanges = '\x1b[90m[fetching...]\x1b[0m';
				}

				return {
					worktree: wt,
					session: entry.session,
					baseLabel,
					fileChanges,
					aheadBehind,
					parentBranch,
					error: itemError,
					lengths: {
						base: stripAnsi(baseLabel).length,
						fileChanges: stripAnsi(fileChanges).length,
						aheadBehind: stripAnsi(aheadBehind).length,
						parentBranch: stripAnsi(parentBranch).length,
					},
				};
			});

			const columns = calculateColumnPositions(sessionWorkItems);

			if (!isSearchMode) {
				menuItems.push({
					type: 'common',
					label: createSeparatorWithText('Active Sessions'),
					value: 'separator-sessions',
				});
			}

			// Filter by search query
			const filteredEntries = searchQuery
				? sessionEntries.filter((_entry, i) => {
						const item = sessionWorkItems[i]!;
						return stripAnsi(item.baseLabel)
							.toLowerCase()
							.includes(searchQuery.toLowerCase());
					})
				: sessionEntries;

			filteredEntries.forEach(entry => {
				const itemIndex = sessionEntries.indexOf(entry);
				const workItem = sessionWorkItems[itemIndex]!;
				const label = assembleWorktreeLabel(workItem, columns);

				const numberPrefix =
					!isSearchMode && currentIndex < 10 ? `${currentIndex} ❯ ` : '❯ ';

				const project: GitProject = {
					path: entry.projectPath,
					name: entry.projectName,
					relativePath:
						projects.find(p => p.path === entry.projectPath)?.relativePath ||
						entry.projectPath,
					isValid: true,
				};

				menuItems.push({
					type: 'session',
					label: numberPrefix + label,
					value: `session-${entry.session.id}`,
					session: entry.session,
					project,
				});
				currentIndex++;
			});
		}

		// --- Projects section ---
		const filteredRecentProjects = searchQuery
			? recentProjects.filter(p =>
					p.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: recentProjects;

		const filteredProjects = searchQuery
			? projects.filter(p =>
					p.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: projects;

		// Deduplicate: recent projects first, then remaining
		const recentPaths = new Set(filteredRecentProjects.map(rp => rp.path));
		const nonRecentProjects = filteredProjects.filter(
			p => !recentPaths.has(p.path),
		);

		// Build ordered project list: recent first, then alphabetical
		const orderedProjects: GitProject[] = [];
		for (const rp of filteredRecentProjects) {
			const full = projects.find(p => p.path === rp.path);
			if (full) orderedProjects.push(full);
		}
		orderedProjects.push(...nonRecentProjects);

		if (orderedProjects.length > 0 && !isSearchMode) {
			menuItems.push({
				type: 'common',
				label: createSeparatorWithText('Projects'),
				value: 'separator-projects',
			});
		}

		orderedProjects.forEach(project => {
			const projectSessions = globalSessionOrchestrator.getProjectSessions(
				project.path,
			);
			const counts = SessionManager.getSessionCounts(projectSessions);
			const countsFormatted = SessionManager.formatSessionCounts(counts);

			const displayName = projectDisplayNames.get(project.path) || project.name;
			const numberPrefix =
				!isSearchMode && currentIndex < 10 ? `${currentIndex} ❯ ` : '❯ ';

			menuItems.push({
				type: 'project',
				label: numberPrefix + displayName + countsFormatted,
				value: project.path,
				project,
			});
			currentIndex++;
		});

		// --- Other section ---
		if (!isSearchMode) {
			menuItems.push({
				type: 'common',
				label: createSeparatorWithText('Other'),
				value: 'separator-other',
			});
			menuItems.push({
				type: 'common',
				label: `R 🔄 Refresh`,
				value: 'refresh',
			});
			menuItems.push({
				type: 'common',
				label: `Q ${MENU_ICONS.EXIT} Exit`,
				value: 'exit',
			});
		}

		setItems(menuItems);
	}, [
		sessionEntries,
		enrichedWorktrees,
		projects,
		recentProjects,
		projectDisplayNames,
		searchQuery,
		isSearchMode,
	]);

	// Refresh handler
	const refreshAll = () => {
		setLoading(true);
		setLoadError(null);

		Effect.runPromise(
			Effect.either(
				projectManager.instance.discoverProjectsEffect(projectsDir),
			),
		).then(result => {
			if (result._tag === 'Left') {
				setLoadError(formatErrorMessage(result.left));
				setLoading(false);
				return;
			}
			setProjects(result.right);
			setRecentProjects(projectManager.getRecentProjects(0));
			setLoading(false);
			setSessionRefreshKey(k => k + 1);
		});
	};

	// Handle hotkeys
	useInput((input, _key) => {
		if (!process.stdin.setRawMode) return;

		if (displayError && onDismissError) {
			onDismissError();
			return;
		}

		if (isSearchMode) return;

		const keyPressed = input.toLowerCase();

		// Number keys 0-9 for quick selection
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			const selectableItems = items.filter(
				item => item.type === 'session' || item.type === 'project',
			);
			if (index < selectableItems.length && selectableItems[index]) {
				const selected = selectableItems[index]!;
				if (selected.type === 'session') {
					onSelectSession(selected.session, selected.project);
				} else if (selected.type === 'project') {
					onSelectProject(selected.project);
				}
			}
			return;
		}

		switch (keyPressed) {
			case 'r':
				refreshAll();
				break;
			case 'q':
			case 'x':
				onSelectProject({
					path: 'EXIT_APPLICATION',
					name: '',
					relativePath: '',
					isValid: false,
				});
				break;
		}
	});

	const handleSelect = (item: DashboardItem) => {
		if (item.value.startsWith('separator')) return;

		if (item.type === 'session') {
			onSelectSession(item.session, item.project);
		} else if (item.type === 'project') {
			onSelectProject(item.project);
		} else if (item.value === 'refresh') {
			refreshAll();
		} else if (item.value === 'exit') {
			onSelectProject({
				path: 'EXIT_APPLICATION',
				name: '',
				relativePath: '',
				isValid: false,
			});
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1} flexDirection="column">
				<Text bold color="green">
					CCManager - Dashboard v{version}
				</Text>
			</Box>

			{isSearchMode && (
				<Box marginBottom={1}>
					<Text>Search: </Text>
					<TextInputWrapper
						value={searchQuery}
						onChange={setSearchQuery}
						focus={true}
						placeholder="Type to filter..."
					/>
				</Box>
			)}

			{loading ? (
				<Box>
					<Text color="yellow">Discovering projects...</Text>
				</Box>
			) : projects.length === 0 && !displayError ? (
				<Box>
					<Text color="yellow">No git repositories found in {projectsDir}</Text>
				</Box>
			) : isSearchMode && items.length === 0 ? (
				<Box>
					<Text color="yellow">No matches found</Text>
				</Box>
			) : isSearchMode ? (
				<Box flexDirection="column">
					{items.slice(0, limit).map((item, index) => (
						<Text
							key={item.value}
							color={index === selectedIndex ? 'green' : undefined}
						>
							{index === selectedIndex ? '❯ ' : '  '}
							{item.label}
						</Text>
					))}
				</Box>
			) : (
				<SelectInput
					items={items}
					onSelect={item => handleSelect(item as DashboardItem)}
					isFocused={!displayError}
					limit={limit}
					initialIndex={selectedIndex}
				/>
			)}

			{displayError && (
				<Box marginTop={1} paddingX={1} borderStyle="round" borderColor="red">
					<Box flexDirection="column">
						<Text color="red" bold>
							Error: {displayError}
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
					{isSearchMode
						? 'Search Mode: Type to filter, Enter to exit search, ESC to exit search'
						: searchQuery
							? `Filtered: "${searchQuery}" | ↑↓ Navigate Enter Select | /-Search ESC-Clear 0-9 Quick Select R-Refresh Q-Quit`
							: 'Controls: ↑↓ Navigate Enter Select | Hotkeys: 0-9 Quick Select /-Search R-Refresh Q-Quit'}
				</Text>
			</Box>
		</Box>
	);
};

export default Dashboard;
