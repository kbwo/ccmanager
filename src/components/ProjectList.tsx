import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {GitProject} from '../types/index.js';
import {MultiProjectService} from '../services/multiProjectService.js';
import {MENU_ICONS} from '../constants/statusIcons.js';

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
	const [worktreesLoaded, setWorktreesLoaded] = useState(false);
	const limit = 10;

	const loadProjects = async () => {
		setLoading(true);
		setLoadError(null);
		setWorktreesLoaded(false);

		try {
			const service = new MultiProjectService();
			const discoveredProjects = await service.discoverProjects(projectsDir);
			setProjects(discoveredProjects);

			// Load worktrees for the first few visible projects
			if (discoveredProjects.length > 0) {
				const visibleProjects = discoveredProjects.slice(0, 10);
				await service.loadProjectWorktrees(visibleProjects);
				setWorktreesLoaded(true);
			}
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
		// Build menu items from projects
		const menuItems: MenuItem[] = projects.map((project, index) => {
			// Only show numbers for first 10 projects (0-9)
			const numberPrefix = index < 10 ? `${index} ❯ ` : '❯ ';

			// Show worktree count if loaded
			const worktreeInfo =
				worktreesLoaded && project.worktrees.length > 0
					? ` (${project.worktrees.length} worktree${project.worktrees.length > 1 ? 's' : ''})`
					: '';

			return {
				label: numberPrefix + project.name + worktreeInfo,
				value: project.path,
				project,
			};
		});

		// Add menu options
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

		setItems(menuItems);
	}, [projects, worktreesLoaded]);

	// Handle hotkeys
	useInput((input, _key) => {
		// Skip in test environment to avoid stdin.ref error
		if (!process.stdin.setRawMode) {
			return;
		}

		// Dismiss error on any key press when error is shown
		if ((error || loadError) && onDismissError) {
			onDismissError();
			return;
		}

		const keyPressed = input.toLowerCase();

		// Handle number keys 0-9 for project selection (first 10 only)
		if (/^[0-9]$/.test(keyPressed)) {
			const index = parseInt(keyPressed);
			if (index < Math.min(10, projects.length) && projects[index]) {
				onSelectProject(projects[index]);
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
					worktrees: [],
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
				worktrees: [],
				isValid: false,
			});
		} else if (item.project) {
			onSelectProject(item.project);
		}
	};

	const displayError = error || loadError;

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

			{loading ? (
				<Box>
					<Text color="yellow">Loading projects...</Text>
				</Box>
			) : projects.length === 0 && !displayError ? (
				<Box>
					<Text color="yellow">No git repositories found in {projectsDir}</Text>
				</Box>
			) : (
				<SelectInput
					items={items}
					onSelect={handleSelect}
					isFocused={!displayError}
					limit={limit}
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
				<Text dimColor>Projects: {projects.length} found</Text>
				<Text dimColor>
					Controls: ↑↓ Navigate Enter Select | Hotkeys: 0-9 Quick Select (first
					10) R-Refresh Q-Quit
				</Text>
			</Box>
		</Box>
	);
};

export default ProjectList;
