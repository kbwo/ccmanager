# CCManager - Claude Code Worktree Manager

## Overview

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees and projects. It allows you to run Claude Code in parallel across different worktrees, switch between them seamlessly, manage worktrees directly from the interface, and organize work across multiple git repositories through its multi-project mode.

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

## Error Handling

CCManager uses **Effect-ts** for type-safe, composable error handling. This approach makes errors explicit in function signatures, enables better composition, and provides powerful error recovery strategies.

### Effect-ts Patterns

#### When to Use Effect vs Either

- **Effect**: Use for asynchronous operations or operations with side effects
  - Git commands, file I/O, PTY spawning
  - Operations that return `Effect<SuccessType, ErrorType, never>`

- **Either**: Use for synchronous, pure operations
  - Configuration validation, path resolution
  - Operations that return `Either<ErrorType, SuccessType>`

#### Core Effect Functions

**Creating Effects:**

```typescript
// Success value
const success = Effect.succeed(42);

// Error value
const failure = Effect.fail(new GitError({
  command: 'git status',
  exitCode: 128,
  stderr: 'not a git repository'
}));

// Wrapping try-catch code
const wrappedSync = Effect.try({
  try: () => JSON.parse(data),
  catch: (error) => new ConfigError({
    configPath: path,
    reason: 'parse',
    details: String(error)
  })
});

// Wrapping Promises
const wrappedAsync = Effect.tryPromise({
  try: () => fs.promises.readFile(path, 'utf-8'),
  catch: (error) => new FileSystemError({
    operation: 'read',
    path,
    cause: String(error)
  })
});
```

**Transforming Effects:**

```typescript
// Transform success values
const mapped = Effect.map(effect, (value) => value * 2);

// Chain Effect-returning operations
const chained = Effect.flatMap(effect, (value) =>
  Effect.succeed(value + 1)
);

// Transform errors
const mappedError = Effect.mapError(effect, (error) =>
  `Failed: ${error.message}`
);
```

**Either Functions:**

```typescript
// Create Either values
const right = Either.right(42);
const left = Either.left('error message');

// Transform Either
const mapped = Either.map(either, (value) => value * 2);
const chained = Either.flatMap(either, (value) => Either.right(value + 1));
```

### Error Types

All errors extend `Data.TaggedError` for type-safe discrimination:

- **GitError**: Git command failures (command, exitCode, stderr, stdout?)
- **FileSystemError**: File operations (operation, path, cause)
- **ConfigError**: Configuration issues (configPath, reason, details)
- **ProcessError**: PTY/process failures (processId?, command, signal?, exitCode?, message)
- **ValidationError**: Input validation (field, constraint, receivedValue)

**Error Discrimination with `_tag`:**

```typescript
function handleError(error: AppError): string {
  switch (error._tag) {
    case 'GitError':
      return `Git ${error.command} failed (exit ${error.exitCode}): ${error.stderr}`;
    case 'FileSystemError':
      return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
    case 'ConfigError':
      return `Config error (${error.reason}): ${error.details}`;
    case 'ProcessError':
      return `Process error: ${error.message}`;
    case 'ValidationError':
      return `Validation failed for ${error.field}: ${error.constraint}`;
  }
}
```

### Effect Usage in Services

Service methods return Effect types to make errors explicit:

```typescript
class WorktreeService {
  getWorktrees(): Effect.Effect<Worktree[], GitError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await execFile('git', ['worktree', 'list', '--porcelain']);
        return parseWorktrees(result.stdout);
      },
      catch: (error: any) => new GitError({
        command: 'git worktree list',
        exitCode: error.code || 1,
        stderr: error.stderr || String(error)
      })
    });
  }

  createWorktree(
    branchName: string,
    path: string
  ): Effect.Effect<Worktree, GitError | FileSystemError, never> {
    return Effect.flatMap(
      this.validatePath(path),
      (validPath) => Effect.tryPromise({
        try: async () => {
          await execFile('git', ['worktree', 'add', validPath, branchName]);
          return { path: validPath, branch: branchName };
        },
        catch: (error: any) => new GitError({
          command: `git worktree add ${validPath} ${branchName}`,
          exitCode: error.code || 1,
          stderr: error.stderr || String(error)
        })
      })
    );
  }
}
```

### Effect Usage in Utilities

Utility functions use Effect or Either based on operation type:

```typescript
// Synchronous validation with Either
function validateConfig(data: unknown): Either.Either<ValidationError, Config> {
  if (!isValidConfig(data)) {
    return Either.left(new ValidationError({
      field: 'config',
      constraint: 'must be valid configuration object',
      receivedValue: data
    }));
  }
  return Either.right(data as Config);
}

// Asynchronous operations with Effect
function getGitStatus(
  worktreePath: string,
  signal: AbortSignal
): Effect.Effect<GitStatus, GitError, never> {
  return Effect.tryPromise({
    try: async () => {
      const result = await execFile('git', ['status', '--porcelain'], {
        cwd: worktreePath,
        signal
      });
      return parseGitStatus(result.stdout);
    },
    catch: (error: any) => new GitError({
      command: 'git status',
      exitCode: error.code || 1,
      stderr: error.stderr || String(error)
    })
  });
}
```

### Effect Usage in Components

React components execute Effects and handle results:

```typescript
// Pattern 1: Effect.runPromise with try-catch
const handleCreateWorktree = async (branchName: string, path: string) => {
  try {
    const worktree = await Effect.runPromise(
      worktreeService.createWorktree(branchName, path)
    );
    setWorktrees([...worktrees, worktree]);
  } catch (error) {
    if (error instanceof GitError) {
      setError(`Git error: ${error.stderr}`);
    } else if (error instanceof FileSystemError) {
      setError(`File system error: ${error.cause}`);
    } else {
      setError('Unknown error occurred');
    }
  }
};

// Pattern 2: Effect.match for type-safe handling
const handleLoadConfig = async () => {
  const result = await Effect.runPromise(
    Effect.match(configManager.loadConfig(), {
      onFailure: (error) => ({ success: false as const, error }),
      onSuccess: (config) => ({ success: true as const, config })
    })
  );

  if (result.success) {
    setConfig(result.config);
  } else {
    setError(handleError(result.error));
  }
};

// Pattern 3: useEffect with cleanup
useEffect(() => {
  let cancelled = false;

  Effect.runPromise(projectManager.loadRecentProjects())
    .then(projects => {
      if (!cancelled) setProjects(projects);
    })
    .catch(error => {
      if (!cancelled) setError(String(error));
    });

  return () => {
    cancelled = true;
  };
}, []);
```

### Error Recovery Strategies

Effect-ts provides powerful error recovery options:

```typescript
// Catch specific error types
const withRecovery = Effect.catchTag(effect, 'GitError', (error) => {
  if (error.exitCode === 128) {
    return Effect.succeed(defaultValue);
  }
  return Effect.fail(error);
});

// Catch all errors
const withFallback = Effect.catchAll(effect, (error) => {
  console.error('Operation failed:', error);
  return Effect.succeed(fallbackValue);
});

// Provide alternative Effect
const withAlternative = Effect.orElse(effect, () =>
  alternativeEffect
);

// Retry with policy
const withRetry = Effect.retry(effect, {
  times: 3,
  schedule: Schedule.exponential('100 millis')
});
```

### Effect Composition

Combine multiple Effects efficiently:

```typescript
// Sequential composition
const sequential = Effect.flatMap(
  firstEffect,
  (first) => Effect.flatMap(
    secondEffect,
    (second) => Effect.succeed({ first, second })
  )
);

// Parallel execution
const parallel = Effect.all([
  getGitStatus(path1),
  getGitStatus(path2),
  getGitStatus(path3)
], { concurrency: 3 });

// Conditional execution
const conditional = Effect.if(
  shouldExecute,
  {
    onTrue: () => effect1,
    onFalse: () => effect2
  }
);
```

### Best Practices

1. **Always use Effect/Either for operations that can fail**
   - Makes errors explicit in type signatures
   - Enables better composition and error handling

2. **Use pattern matching on `_tag` for error discrimination**
   - TypeScript narrows types automatically
   - Ensures all error types are handled

3. **Prefer Effect.match over try-catch at boundaries**
   - More explicit about success and failure paths
   - Better type inference

4. **Use Effect.catchTag for specific error recovery**
   - Type-safe error handling
   - Automatic type narrowing

5. **Keep Effects pure and composable**
   - Avoid side effects in map/flatMap callbacks
   - Use Effect.sync or Effect.tryPromise for side effects

6. **Execute Effects at application boundaries**
   - Components, event handlers, useEffect hooks
   - Keep business logic in Effect-returning functions

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
- **Multi-Project Support**: Manage multiple git repositories from a single interface

### Multi-Project Features

CCManager supports managing multiple git repositories through multi-project mode:

#### Enabling Multi-Project Mode

```bash
# Set the root directory for project discovery
export CCMANAGER_MULTI_PROJECT_ROOT="/path/to/your/projects"

# Run CCManager in multi-project mode
npx ccmanager --multi-project
```

#### Project Discovery and Management

- **Automatic Discovery**: Recursively finds all git repositories in the specified root directory
- **Project Caching**: Discovered projects are cached for improved performance
- **Recent Projects**: Frequently accessed projects appear at the top of the list
- **Persistent State**: Recent projects are saved to `~/.config/ccmanager/recent-projects.json`

#### Navigation Flow

1. **Project List View**: Initial screen showing all discovered projects
   - Recent projects displayed at the top
   - All other projects listed below
   - Vi-like search with `/` key
   - Number keys (0-9) for quick selection

2. **Menu View**: After selecting a project, shows worktrees for that project
   - Back to project list option (`B` key)
   - Session counts displayed per project `[active/busy/waiting]`
   - Standard worktree operations available

3. **Session View**: Terminal emulation with selected Claude Code session

#### Search Functionality

Both Project List and Menu support Vi-like search:
- Press `/` to enter search mode
- Type to filter items in real-time
- Press `ESC` to cancel search
- Press `Enter` to exit search and keep filter

#### Session Orchestration

- **GlobalSessionOrchestrator**: Manages session state across all projects
- **Per-Project SessionManagers**: Each project maintains its own session manager
- **Session Persistence**: Sessions remain active when navigating between projects
- **Visual Indicators**: Session counts shown as `[2/1/0]` format:
  - First number: Total active sessions
  - Second number: Busy sessions
  - Third number: Waiting sessions

#### Implementation Details

```typescript
// Project discovery
const projectManager = new ProjectManager(rootPath);
const projects = await projectManager.getProjects();

// Session management across projects
const orchestrator = new GlobalSessionOrchestrator();
const sessionManager = orchestrator.getOrCreateSessionManager(projectPath);

// Recent projects tracking
await projectManager.addRecentProject(project);
const recentProjects = await projectManager.getRecentProjects();
```

### User Interface

- **Project List**: Shows all discovered git repositories with search functionality
- **Main Menu**: Lists all worktrees with status indicators and session counts
- **Session View**: Full terminal emulation with Claude Code
- **Forms**: Text input for creating worktrees and configuring settings
- **Confirmation Dialogs**: Safety prompts for destructive actions

## Active Specifications

- **result-pattern-error-handling-2**: Replace try-catch based error handling with Result pattern for more effective and type-safe error management

## Future Enhancements

- Session recording and playback
- Split pane view for multiple sessions
- Integration with Claude Code's `-r` flag
- Theme customization
- Plugin system for extensions
- Session history and search
- Worktree templates
