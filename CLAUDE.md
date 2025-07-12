# CCManager - Claude Code Worktree Manager

## Overview

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees. It allows you to run Claude Code in parallel across different worktrees, switch between them seamlessly, and manage worktrees directly from the interface.

## Project Structure

```
ccmanager/
├── docs/                    # Documentation
├── src/
│   ├── cli.tsx             # Entry point with CLI argument parsing
│   ├── components/         # UI components
│   ├── constants/          # Shared constants
│   ├── hooks/              # React hooks
│   ├── services/           # Business logic
│   ├── types/              # TypeScript definitions
│   └── utils/              # Utility functions
├── package.json
├── tsconfig.json
├── eslint.config.js        # Modern flat ESLint configuration
├── vitest.config.ts        # Vitest test configuration
└── shortcuts.example.json  # Example shortcut configuration
```

## Key Dependencies

- **ink** - React for CLI apps
- **ink-select-input** - Menu selection component
- **ink-text-input** - Text input fields for forms
- **ink-spinner** - Loading indicators
- **node-pty** - PTY for interactive sessions
- **vitest** - Modern testing framework

## Commands

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run

```bash
npm start
# or directly
npx ccmanager
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

### Type Check

```bash
npm run typecheck
```

## Architecture Decisions

### Session Management

- Each worktree maintains its own Claude Code process
- Sessions are managed via `node-pty` for full terminal emulation
- Process lifecycle tracked in React state with automatic cleanup
- Session states tracked with sophisticated prompt detection

### UI Components

- **App Component**: Main application container with view routing
- **Menu Component**: Worktree list with status indicators and actions
- **Session Component**: Full PTY rendering with ANSI color support
- **Worktree Management**: Create, delete, and merge worktrees via dedicated forms
- **Shortcut Configuration**: Customizable keyboard shortcuts with visual editor

### State Detection

Session states are detected using a strategy pattern that supports multiple CLI tools:

#### Architecture
- **StateDetector Interface**: Common contract for all detectors
- **BaseStateDetector**: Shared functionality for terminal output analysis
- **ClaudeStateDetector**: Claude Code specific patterns
- **GeminiStateDetector**: Gemini CLI specific patterns

#### Claude Code Detection
- **Waiting for input**: `│ Do you want`, `│ Would you like`
- **Busy**: `ESC to interrupt` (case insensitive)
- **Idle**: Default state when no patterns match

#### Gemini CLI Detection
- **Waiting for input**: `│ Apply this change?`, `│ Allow execution?`, `│ Do you want to proceed?`
- **Busy**: `esc to cancel` (case insensitive)
- **Idle**: Default state when no patterns match

#### Adding New CLI Support
1. Add new strategy type to `StateDetectionStrategy` in `types/index.ts`
2. Create detector class extending `BaseStateDetector`
3. Add to factory in `createStateDetector`
4. Update UI components to include new option

### Keyboard Shortcuts

- Fully configurable shortcuts stored in `~/.config/ccmanager/config.json`
- Platform-aware configuration paths (Windows uses `%APPDATA%`)
- Default shortcuts for common actions (back, quit, refresh, etc.)
- Visual configuration UI accessible from main menu

## Development Guidelines

### Component Structure

```tsx
// Example component pattern
const MyComponent: React.FC<Props> = ({prop1, prop2}) => {
	const [state, setState] = useState<State>(initialState);

	useEffect(() => {
		// Side effects
	}, [dependencies]);

	return (
		<Box flexDirection="column">
			<Text>Content</Text>
		</Box>
	);
};
```

### Command Presets

```typescript
interface CommandPreset {
  id: string;
  name: string;
  command: string;
  args?: string[];
  fallbackArgs?: string[];
  detectionStrategy?: StateDetectionStrategy; // 'claude' | 'gemini'
}
```

Presets support:
- Multiple command configurations
- Automatic fallback on failure
- Per-preset state detection strategy
- Default preset selection

### Testing Sessions

```typescript
// Mock Claude Code for testing
process.env.CLAUDE_COMMAND = './mock-claude';

// Create mock-claude script
const mockScript = `#!/usr/bin/env node
console.log('Claude Code Mock');
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt() {
  rl.question('> ', (answer) => {
    console.log(\`Processing: \${answer}\`);
    setTimeout(prompt, 1000);
  });
}
prompt();
`;
```

### Keyboard Handling

```tsx
useInput((input, key) => {
	const shortcuts = shortcutManager.getShortcuts();

	if (shortcutManager.matchesShortcut(shortcuts.back, input, key)) {
		// Return to menu
	}

	if (shortcutManager.matchesShortcut(shortcuts.quit, input, key)) {
		// Exit application
	}
});
```

### Worktree Management

```typescript
// List worktrees
const worktrees = await worktreeService.listWorktrees();

// Create new worktree
await worktreeService.createWorktree(branchName, path);

// Delete worktree
await worktreeService.deleteWorktree(worktreePath, { force: true });

// Merge worktree branch
await worktreeService.mergeWorktree(worktreePath, targetBranch);
```

### Devcontainer Integration

CCManager supports running sessions inside devcontainers while maintaining host-level management:

#### CLI Arguments
```bash
npx ccmanager --devc-up-command "<your devcontainer up command>" \
              --devc-exec-command "<your devcontainer exec command>"
```

Both arguments must be provided together and accept any valid commands/options:
- `--devc-up-command`: Any command to start the devcontainer
- `--devc-exec-command`: Any command to execute inside the container

#### Design Rationale: Why Full Command Flexibility?

The decision to accept complete commands rather than just arguments was deliberate:

1. **Tool Agnostic**: Not everyone uses the `devcontainer` CLI directly. Some may use:
   - `mise exec devcontainer up` for version management
   - Custom wrapper scripts
   - Alternative container management tools

2. **Command Variations**: Different workflows require different commands:
   - `devcontainer up` vs `devcontainer set-up` for different initialization strategies
   - Custom scripts that handle pre/post container setup

3. **User Control**: While the full command can be lengthy, users can:
   - Create shell aliases for frequently used commands
   - Use shell scripts to wrap complex command sequences
   - Maintain their existing workflow without CCManager dictating the approach

This design ensures CCManager remains a flexible tool that adapts to users' existing workflows rather than forcing a specific approach.

#### Implementation
```typescript
// Create session with devcontainer support
await sessionManager.createSessionWithDevcontainer(
  worktreePath,
  {
    upCommand: 'devcontainer up --workspace-folder .',
    execCommand: 'devcontainer exec --workspace-folder .'
  },
  presetId // optional
);
```

The implementation:
1. Executes the up command to start the container
2. Parses the exec command to extract arguments
3. Appends preset command with `--` separator
4. Spawns PTY process inside the container

#### Testing Devcontainer Features
```typescript
// Mock devcontainer commands
const devcontainerConfig: DevcontainerConfig = {
  upCommand: 'devcontainer up --workspace-folder .',
  execCommand: 'devcontainer exec --workspace-folder .'
};

// Test session creation
await sessionManager.createSessionWithDevcontainer(
  '/test/worktree',
  devcontainerConfig
);
```

## Common Issues

### PTY Compatibility

- Use `node-pty` prebuilt binaries for cross-platform support
- Handle Windows ConPTY vs Unix PTY differences
- Test on WSL, macOS, and Linux

### React Reconciliation

- Use `key` prop for session components
- Memoize expensive renders with `React.memo`
- Avoid recreating PTY instances unnecessarily

### Process Management

- Clean up PTY instances on unmount
- Handle orphaned processes gracefully
- Implement proper signal handling

### Prompt Detection

- Handle various Claude Code output formats
- Track prompt box borders and UI elements
- Maintain state history for accurate detection

### Configuration Management

- Create config directory if it doesn't exist
- Handle platform-specific paths correctly
- Provide sensible defaults for shortcuts

## Features

### Core Features

- **Multi-Session Management**: Run Claude Code in multiple worktrees simultaneously
- **Worktree Operations**: Create, delete, and merge worktrees from the UI
- **Session State Tracking**: Visual indicators for session states (idle, busy, waiting)
- **Git Status Visualization**: Real-time display of file changes and ahead/behind counts
- **Customizable Shortcuts**: Configure keyboard shortcuts via UI or JSON file
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Devcontainer Integration**: Run sessions inside containers while managing from host

### User Interface

- **Main Menu**: Lists all worktrees with status indicators
- **Session View**: Full terminal emulation with Claude Code
- **Forms**: Text input for creating worktrees and configuring settings
- **Confirmation Dialogs**: Safety prompts for destructive actions

## Future Enhancements

- Session recording and playback
- Split pane view for multiple sessions
- Integration with Claude Code's `-r` flag
- Theme customization
- Plugin system for extensions
- Session history and search
- Worktree templates
