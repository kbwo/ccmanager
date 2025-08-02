# Multi-Project Mode

CCManager's multi-project mode allows you to manage multiple git repositories from a single interface, making it easy to work across different projects without running multiple CCManager instances.

## Overview

In multi-project mode, CCManager discovers all git repositories within a specified root directory and presents them in an organized interface. You can quickly switch between projects, manage their worktrees, and maintain active AI assistant sessions across all projects simultaneously.

## Setup

### Environment Variable

Multi-project mode requires setting the `CCMANAGER_MULTI_PROJECT_ROOT` environment variable:

```bash
export CCMANAGER_MULTI_PROJECT_ROOT="/path/to/your/projects"
```

This should point to a directory containing your git repositories. CCManager will recursively search this directory for all git projects.

### Running in Multi-Project Mode

```bash
npx ccmanager --multi-project
```

If the environment variable is not set, CCManager will display an error message with instructions.

## Features

### Project Discovery

CCManager automatically discovers git repositories by:
- Recursively scanning the root directory
- Identifying directories containing `.git` folders
- Excluding git worktrees (they're managed separately within their parent project)
- Caching discovered projects for better performance

### Recent Projects

Frequently accessed projects are tracked and displayed at the top of the project list:
- Projects are automatically added to recent list when selected
- Recent projects persist between sessions
- Stored in `~/.config/ccmanager/recent-projects.json`
- No limit on the number of recent projects shown

### Search Functionality

Both the project list and worktree menu support Vi-like search:
- Press `/` to enter search mode
- Type to filter items in real-time
- Press `ESC` to cancel and clear the search
- Press `Enter` to exit search mode while keeping the current filter
- Use arrow keys to navigate filtered results

### Session Management

CCManager maintains separate session managers for each project:
- Sessions persist when switching between projects
- Each project tracks its own active, busy, and waiting sessions
- Session counts are displayed in the format `[active/busy/waiting]`
- Sessions continue running in the background when navigating away

### Navigation Flow

1. **Project List View**
   - Shows all discovered projects
   - Recent projects appear at the top
   - All other projects listed alphabetically below
   - Number keys (0-9) for quick selection
   - `R` to refresh project list
   - `Q` to quit

2. **Worktree Menu**
   - Shows all worktrees for the selected project
   - Session counts displayed for the project
   - Standard worktree operations available
   - `B` to go back to project list
   - Number keys (0-9) for quick worktree selection

3. **Session View**
   - Full terminal emulation with your AI assistant
   - Standard session controls apply

## Architecture

### Key Components

#### ProjectManager Service
- Handles project discovery and caching
- Manages recent projects list
- Provides project filtering and search

#### GlobalSessionOrchestrator
- Maintains session managers for all projects
- Coordinates session lifecycle across projects
- Provides session count aggregation

#### ProjectList Component
- Displays discovered projects with search
- Handles project selection
- Shows recent projects section

### Data Structures

```typescript
interface GitProject {
  path: string;        // Absolute path to git repository
  name: string;        // Project name (directory name)
  relativePath: string; // Path relative to root directory
  isValid: boolean;    // Whether it's a valid git repo
}

interface RecentProject {
  path: string;        // Absolute path
  name: string;        // Project name
  lastAccessed: number; // Unix timestamp
}
```

## Configuration

### Config Files

Multi-project configuration is stored in platform-specific locations:
- Linux/macOS: `~/.config/ccmanager/`
- Windows: `%APPDATA%/ccmanager/`

### Recent Projects File

The `recent-projects.json` file maintains the list of recently accessed projects:

```json
[
  {
    "path": "/home/user/projects/my-app",
    "name": "my-app",
    "lastAccessed": 1703001234567
  },
  {
    "path": "/home/user/projects/another-project",
    "name": "another-project",
    "lastAccessed": 1703001234566
  }
]
```

## Performance Considerations

### Project Discovery Optimization

- Projects are discovered in parallel using a worker pool pattern
- Discovery results are cached to avoid repeated filesystem operations
- Common ignore patterns (node_modules, .git internals) are skipped

### Session Management

- Only active project's sessions are in the foreground
- Background sessions consume minimal resources
- Session state is preserved when switching projects

## Troubleshooting

### Projects Not Appearing

1. Verify the directory contains a `.git` folder
2. Check that `CCMANAGER_MULTI_PROJECT_ROOT` points to the correct directory
3. Try refreshing the project list with `R`
4. Ensure you have read permissions for the directories

### Environment Variable Issues

If you see "CCMANAGER_MULTI_PROJECT_ROOT environment variable is not set":
1. Set the environment variable: `export CCMANAGER_MULTI_PROJECT_ROOT="/your/path"`
2. Add it to your shell profile for persistence
3. Ensure the path exists and is accessible

### Performance Issues

If project discovery is slow:
1. Consider using a more specific root directory
2. Exclude large non-project directories from the root path
3. Check for symbolic links causing circular references

## Best Practices

1. **Organize Projects**: Keep git repositories in a dedicated directory structure
2. **Use Recent Projects**: Take advantage of the recent projects feature for quick access
3. **Keyboard Navigation**: Learn the number key shortcuts for faster navigation
4. **Search Efficiently**: Use `/` search to quickly filter large project lists
5. **Session Management**: Be aware that sessions continue running when you switch projects

## Integration with Existing Features

Multi-project mode works seamlessly with all existing CCManager features:
- Command presets apply to all projects
- Status hooks work across all sessions
- Keyboard shortcuts remain consistent
- Worktree operations function normally within each project
- Devcontainer support works per-project

## Future Enhancements

Planned improvements for multi-project mode:
- Project grouping and categorization
- Global session overview across all projects
- Project-specific configuration overrides
- Batch operations across multiple projects
- Project templates and initialization