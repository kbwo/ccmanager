import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {GitProject} from '../types/index.js';
import {MultiProjectService} from '../services/multiProjectService.js';
import {MENU_ICONS} from '../constants/statusIcons.js';
import TextInputWrapper from './TextInputWrapper.js';
import {useSearchMode} from '../hooks/useSearchMode.js';

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
	const [items, setItems] = useState<MenuItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const limit = 10;

	// Use the search mode hook
	const displayError = error || loadError;
	const {isSearchMode, searchQuery, selectedIndex, setSearchQuery} =
		useSearchMode(items.length, {
			isDisabled: !!displayError,
		});

	const loadProjects = async () => {
		setLoading(true);
		setLoadError(null);

		try {
			const service = new MultiProjectService();
			const discoveredProjects = await service.discoverProjects(projectsDir);
			setProjects(discoveredProjects);
		} catch (err) {
			setLoadError((err as Error).message);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadProjects();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectsDir]);

	useEffect(() => {
		// Filter projects based on search query
		const filteredProjects = searchQuery
			? projects.filter(project =>
					project.name.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: projects;

		// Build menu items from filtered projects
		const menuItems: MenuItem[] = filteredProjects.map((project, index) => {
			// Only show numbers for first 10 projects (0-9) when not in search mode
			const numberPrefix = !isSearchMode && index < 10 ? `${index} ❯ ` : '❯ ';

			return {
				label: numberPrefix + project.name,
				value: project.path,
				project,
			};
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
	}, [projects, searchQuery, isSearchMode]);

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

		// Handle number keys 0-9 for project selection (first 10 only)
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			// Get filtered projects based on search query
			const filteredProjects = searchQuery
				? projects.filter(project =>
						project.name.toLowerCase().includes(searchQuery.toLowerCase()),
					)
				: projects;
			if (
				index < Math.min(10, filteredProjects.length) &&
				filteredProjects[index]
			) {
				onSelectProject(filteredProjects[index]);
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
		if (item.value === 'separator') {
			// Do nothing for separator
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
				<Text dimColor>
					Projects: {items.filter(item => item.project).length} of{' '}
					{projects.length} shown
				</Text>
				<Text dimColor>
					{isSearchMode
						? 'Search Mode: Type to filter, Enter to exit search, ESC to exit search'
						: searchQuery
							? `Filtered: "${searchQuery}" | ↑↓ Navigate Enter Select | /-Search ESC-Clear 0-9 Quick Select R-Refresh Q-Quit`
							: 'Controls: ↑↓ Navigate Enter Select | Hotkeys: 0-9 Quick Select (first 10) /-Search R-Refresh Q-Quit'}
				</Text>
			</Box>
		</Box>
	);
};

export default ProjectList;
