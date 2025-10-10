import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {Effect} from 'effect';
import SelectInput from 'ink-select-input';
import {GitProject} from '../types/index.js';
import {projectManager} from '../services/projectManager.js';
import {MENU_ICONS} from '../constants/statusIcons.js';
import TextInputWrapper from './TextInputWrapper.js';
import {useSearchMode} from '../hooks/useSearchMode.js';
import {RecentProject} from '../types/index.js';
import {globalSessionOrchestrator} from '../services/globalSessionOrchestrator.js';
import {SessionManager} from '../services/sessionManager.js';
import {
	ProcessError,
	ConfigError,
	GitError,
	FileSystemError,
	ValidationError,
	type AppError,
} from '../types/errors.js';

interface ProjectListProps {
	projectsDir: string;
	onSelectProject: (project: GitProject) => void;
	error: string | null;
	onDismissError: () => void;
}

interface MenuItem {
	label: string;
	value: string;
	project?: GitProject;
}

const ProjectList: React.FC<ProjectListProps> = ({
	projectsDir,
	onSelectProject,
	error,
	onDismissError,
}) => {
	const [projects, setProjects] = useState<GitProject[]>([]);
	const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
	const [items, setItems] = useState<MenuItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const limit = 10;

	// Helper function to format error messages based on error type using _tag discrimination
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

	// Use the search mode hook
	const displayError = error || loadError;
	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(items.length, {
			isDisabled: !!displayError,
			skipInTest: false,
		});

	// Helper function to load projects with Effect-based error handling
	const loadProjectsEffect = async (checkCancellation?: () => boolean) => {
		setLoading(true);
		setLoadError(null);

		// Use Effect-based project discovery
		const projectsEffect =
			projectManager.instance.discoverProjectsEffect(projectsDir);

		// Execute the Effect and handle both success and failure cases
		const result = await Effect.runPromise(Effect.either(projectsEffect));

		// Check cancellation flag before updating state (if provided)
		if (checkCancellation && checkCancellation()) return;

		if (result._tag === 'Left') {
			// Handle error using pattern matching on _tag
			const errorMessage = formatErrorMessage(result.left);
			setLoadError(errorMessage);
			setLoading(false);
			return;
		}

		// Success case - extract projects from Right
		const discoveredProjects = result.right;
		setProjects(discoveredProjects);

		// Load recent projects with no limit (pass 0)
		const allRecentProjects = projectManager.getRecentProjects(0);
		setRecentProjects(allRecentProjects);

		setLoading(false);
	};

	const loadProjects = () => loadProjectsEffect();

	useEffect(() => {
		let cancelled = false;

		loadProjectsEffect(() => cancelled);

		// Cleanup function to set cancellation flag
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectsDir]);

	useEffect(() => {
		const menuItems: MenuItem[] = [];
		let currentIndex = 0;

		// Filter recent projects based on search query
		const filteredRecentProjects = searchQuery
			? recentProjects.filter(project =>
					project.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: recentProjects;

		// Add recent projects section if available and not in search mode
		if (filteredRecentProjects.length > 0) {
			// Add "Recent" separator only when not in search mode
			if (!isSearchMode) {
				menuItems.push({
					label: '── Recent ──',
					value: 'separator-recent',
				});
			}

			// Add recent projects
			filteredRecentProjects.forEach(recentProject => {
				// Find the full project data
				const fullProject = projects.find(p => p.path === recentProject.path);
				if (fullProject) {
					// Get session counts for this project
					const projectSessions = globalSessionOrchestrator.getProjectSessions(
						recentProject.path,
					);
					const counts = SessionManager.getSessionCounts(projectSessions);
					const countsFormatted = SessionManager.formatSessionCounts(counts);

					const numberPrefix =
						!isSearchMode && currentIndex < 10 ? `${currentIndex} ❯ ` : '❯ ';
					menuItems.push({
						label: numberPrefix + recentProject.name + countsFormatted,
						value: recentProject.path,
						project: fullProject,
					});
					currentIndex++;
				}
			});
		}

		// Filter projects based on search query
		const filteredProjects = searchQuery
			? projects.filter(project =>
					project.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: projects;

		// Filter out recent projects from all projects to avoid duplicates
		const recentPaths = new Set(filteredRecentProjects.map(rp => rp.path));
		const nonRecentProjects = filteredProjects.filter(
			project => !recentPaths.has(project.path),
		);

		// Add "All Projects" separator if we have both recent and other projects
		if (
			filteredRecentProjects.length > 0 &&
			nonRecentProjects.length > 0 &&
			!isSearchMode
		) {
			menuItems.push({
				label: '── All Projects ──',
				value: 'separator-all',
			});
		}

		// Build menu items from filtered non-recent projects
		nonRecentProjects.forEach(project => {
			// Get session counts for this project
			const projectSessions = globalSessionOrchestrator.getProjectSessions(
				project.path,
			);
			const counts = SessionManager.getSessionCounts(projectSessions);
			const countsFormatted = SessionManager.formatSessionCounts(counts);

			// Only show numbers for total items (0-9) when not in search mode
			const numberPrefix =
				!isSearchMode && currentIndex < 10 ? `${currentIndex} ❯ ` : '❯ ';

			menuItems.push({
				label: numberPrefix + project.name + countsFormatted,
				value: project.path,
				project,
			});
			currentIndex++;
		});

		// Add menu options only when not in search mode
		if (!isSearchMode) {
			if (projects.length > 0) {
				menuItems.push({
					label: '─────────────',
					value: 'separator',
				});
			}

			menuItems.push({
				label: `R 🔄 Refresh`,
				value: 'refresh',
			});
			menuItems.push({
				label: `Q ${MENU_ICONS.EXIT} Exit`,
				value: 'exit',
			});
		}

		setItems(menuItems);
	}, [projects, recentProjects, searchQuery, isSearchMode]);

	// Handle hotkeys
	useInput((input, _key) => {
		// Skip in test environment to avoid stdin.ref error
		if (!process.stdin.setRawMode) {
			return;
		}

		// Dismiss error on any key press when error is shown
		if (displayError && onDismissError) {
			onDismissError();
			return;
		}

		// Don't process other keys if in search mode (handled by useSearchMode)
		if (isSearchMode) {
			return;
		}

		const keyPressed = input.toLowerCase();

		// Handle number keys 0-9 for project selection
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			// Get all selectable items (recent + non-recent projects)
			const selectableItems = items.filter(item => item.project);
			if (
				index < Math.min(10, selectableItems.length) &&
				selectableItems[index]?.project
			) {
				onSelectProject(selectableItems[index].project!);
			}
			return;
		}

		switch (keyPressed) {
			case 'r':
				// Refresh project list
				loadProjects();
				break;
			case 'q':
			case 'x':
				// Trigger exit action
				onSelectProject({
					path: 'EXIT_APPLICATION',
					name: '',
					relativePath: '',
					isValid: false,
				});
				break;
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.value.startsWith('separator')) {
			// Do nothing for separators
		} else if (item.value === 'refresh') {
			loadProjects();
		} else if (item.value === 'exit') {
			// Handle exit
			onSelectProject({
				path: 'EXIT_APPLICATION',
				name: '',
				relativePath: '',
				isValid: false,
			});
		} else if (item.project) {
			onSelectProject(item.project);
		}
	};

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="green">
					CCManager - Multi-Project Mode
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select a project:</Text>
			</Box>

			{isSearchMode && (
				<Box marginBottom={1}>
					<Text>Search: </Text>
					<TextInputWrapper
						value={searchQuery}
						onChange={setSearchQuery}
						focus={true}
						placeholder="Type to filter projects..."
					/>
				</Box>
			)}

			{loading ? (
				<Box>
					<Text color="yellow">Loading projects...</Text>
				</Box>
			) : projects.length === 0 && !displayError ? (
				<Box>
					<Text color="yellow">No git repositories found in {projectsDir}</Text>
				</Box>
			) : isSearchMode && items.length === 0 ? (
				<Box>
					<Text color="yellow">No projects match your search</Text>
				</Box>
			) : isSearchMode ? (
				// In search mode, show the items as a list without SelectInput
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
					onSelect={handleSelect}
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
				{(isSearchMode || searchQuery) && (
					<Text dimColor>
						Projects: {items.filter(item => item.project).length} of{' '}
						{projects.length} shown
					</Text>
				)}
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

export default ProjectList;
