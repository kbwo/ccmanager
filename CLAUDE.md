# CCManager - Claude Code Worktree Manager

## Overview

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees. It allows you to run Claude Code in parallel across different worktrees, switch between them seamlessly, and manage worktrees directly from the interface.

## Project Structure

```
ccmanager/
├── src/
│   ├── cli.tsx             # Entry point with CLI argument parsing
│   ├── components/         # UI components
│   ├── services/           # Business logic
│   ├── utils/              # Utility functions
│   ├── constants/          # Shared constants
│   └── types/              # TypeScript definitions
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

### Why TypeScript + Ink?

- **React Patterns**: Leverages familiar React concepts for UI development
- **Type Safety**: TypeScript provides compile-time type checking
- **Rich Ecosystem**: Access to npm packages for PTY, Git, and more
- **Rapid Development**: Hot reloading and component reusability
- **ES Modules**: Modern JavaScript module system for better tree-shaking

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

Claude Code states are detected by advanced output analysis in `promptDetector.ts`:

- **Waiting for input**: Detects various prompt patterns including "Do you want" questions
- **Busy**: Detects "ESC to interrupt" and active processing
- **Task complete**: Identifies when Claude is ready for new input
- **Bottom border tracking**: Handles prompt box UI elements

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
- **Customizable Shortcuts**: Configure keyboard shortcuts via UI or JSON file
- **Cross-Platform**: Works on Windows, macOS, and Linux

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
