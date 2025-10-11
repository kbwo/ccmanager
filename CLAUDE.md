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

All service methods return Effect types to make errors explicit. **Note:** Legacy synchronous methods have been removed - all operations use Effect-based methods:

```typescript
class WorktreeService {
  /**
   * Get all worktrees using Effect-based error handling.
   * Returns Effect that must be executed with Effect.runPromise or Effect.match.
   */
  getWorktreesEffect(): Effect.Effect<Worktree[], GitError, never> {
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

  /**
   * Create a new worktree with Effect composition.
   * Chains path validation and worktree creation into a single Effect.
   */
  createWorktreeEffect(
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

  /**
   * Get default branch using Effect-based error handling.
   * Includes fallback logic for main/master detection.
   */
  getDefaultBranchEffect(): Effect.Effect<string, GitError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await execFile('git', ['symbolic-ref', 'refs/remotes/origin/HEAD']);
        const branch = result.stdout.trim().replace('refs/remotes/origin/', '');
        return branch || 'main';
      },
      catch: (error: any) => new GitError({
        command: 'git symbolic-ref',
        exitCode: error.code || 1,
        stderr: error.stderr || String(error)
      })
    });
  }

  /**
   * Get all branches using Effect-based error handling.
   * Returns empty array on failure (non-critical operation).
   */
  getAllBranchesEffect(): Effect.Effect<string[], GitError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await execFile('git', ['branch', '-a']);
        return result.stdout.split('\n')
          .map(b => b.trim())
          .filter(b => b.length > 0);
      },
      catch: (error: any) => new GitError({
        command: 'git branch',
        exitCode: error.code || 1,
        stderr: error.stderr || String(error)
      })
    });
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

React components execute Effects and handle results. The following patterns are demonstrated in real components like ConfigureShortcuts, Menu, and ProjectList:

```typescript
// Pattern 1: useEffect with Effect.match for loading configuration
// Example: ConfigureShortcuts.tsx loading config on mount
useEffect(() => {
  let cancelled = false;

  const loadConfig = async () => {
    const result = await Effect.runPromise(
      Effect.match(configurationManager.loadConfigEffect(), {
        onFailure: (err: AppError) => ({
          type: 'error' as const,
          error: err,
        }),
        onSuccess: config => ({type: 'success' as const, data: config}),
      }),
    );

    if (!cancelled) {
      if (result.type === 'error') {
        // Display error using TaggedError discrimination
        const errorMsg = formatError(result.error);
        setError(errorMsg);
      } else if (result.data.shortcuts) {
        setShortcuts(result.data.shortcuts);
      }
      setIsLoading(false);
    }
  };

  loadConfig().catch(err => {
    if (!cancelled) {
      setError(`Unexpected error loading config: ${String(err)}`);
      setIsLoading(false);
    }
  });

  return () => {
    cancelled = true;
  };
}, []);

// Pattern 2: Event handler with Effect.match for saving data
// Example: ConfigureShortcuts.tsx saving shortcuts
const handleSaveShortcuts = (shortcuts: ShortcutConfig) => {
  const saveConfig = async () => {
    const result = await Effect.runPromise(
      Effect.match(configurationManager.setShortcutsEffect(shortcuts), {
        onFailure: (err: AppError) => ({
          type: 'error' as const,
          error: err,
        }),
        onSuccess: () => ({type: 'success' as const}),
      }),
    );

    if (result.type === 'error') {
      // Display error using TaggedError discrimination
      const errorMsg = formatError(result.error);
      setError(errorMsg);
    } else {
      // Success - call onComplete
      onComplete();
    }
  };

  saveConfig().catch(err => {
    setError(`Unexpected error saving shortcuts: ${String(err)}`);
  });
};

// Pattern 3: Error formatting with TaggedError discrimination
// Example: Shared formatError function used across components
const formatError = (error: AppError): string => {
  switch (error._tag) {
    case 'FileSystemError':
      return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
    case 'ConfigError':
      return `Configuration error (${error.reason}): ${error.details}`;
    case 'ValidationError':
      return `Validation failed for ${error.field}: ${error.constraint}`;
    case 'GitError':
      return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
    case 'ProcessError':
      return `Process error: ${error.message}`;
  }
};

// Pattern 4: Effect.runPromise with try-catch (alternative pattern)
// Example: NewWorktree.tsx creating worktree
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

// Pattern 5: Loading state with Effect execution
// Example: ConfigureShortcuts.tsx with loading indicator
const [isLoading, setIsLoading] = useState<boolean>(true);

// Show loading while Effect executes
if (isLoading) {
  return (
    <Box flexDirection="column">
      <Text>Loading configuration...</Text>
    </Box>
  );
}

// Pattern 6: Effect composition in components
// Example: Load config, then save modified version
const loadAndUpdateConfig = async () => {
  const workflow = Effect.flatMap(
    configurationManager.loadConfigEffect(),
    config => {
      const updatedShortcuts = {...config.shortcuts, newKey: 'value'};
      return configurationManager.setShortcutsEffect(updatedShortcuts);
    },
  );

  const result = await Effect.runPromise(
    Effect.match(workflow, {
      onFailure: (err: AppError) => ({type: 'error' as const, error: err}),
      onSuccess: () => ({type: 'success' as const}),
    }),
  );

  if (result.type === 'error') {
    setError(formatError(result.error));
  } else {
    setSuccess('Configuration updated successfully');
  }
};
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

// Parallel execution with git status
const parallel = Effect.all([
  getGitStatus(path1),
  getGitStatus(path2),
  getGitStatus(path3)
], { concurrency: 3 });

// Parallel branch queries - load all branches and default branch simultaneously
const loadBranchData = Effect.all([
  worktreeService.getAllBranchesEffect(),
  worktreeService.getDefaultBranchEffect()
], { concurrency: 2 });

// Execute parallel branch queries in component
const result = await Effect.runPromise(
  Effect.match(loadBranchData, {
    onFailure: (error: GitError) => ({
      type: 'error' as const,
      message: `Failed to load branch data: ${error.stderr}`
    }),
    onSuccess: ([branches, defaultBranch]) => ({
      type: 'success' as const,
      data: { branches, defaultBranch }
    })
  })
);

if (result.type === 'success') {
  console.log(`Loaded ${result.data.branches.length} branches`);
  console.log(`Default branch: ${result.data.defaultBranch}`);
}

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

### Effect-ts Documentation Links

For deeper understanding of Effect-ts concepts and APIs:

- **Official Effect-ts Documentation**: https://effect.website/docs/introduction
- **Effect Type**: https://effect.website/docs/effect/effect-type
- **Either Type**: https://effect.website/docs/either/either
- **Error Management**: https://effect.website/docs/error-management/error-handling
- **Tagged Errors**: https://effect.website/docs/error-management/expected-errors#tagged-errors
- **Effect Execution**: https://effect.website/docs/guides/running-effects
- **Error Recovery**: https://effect.website/docs/error-management/fallback
- **Effect Composition**: https://effect.website/docs/guides/pipeline
- **Testing with Effect**: https://effect.website/docs/guides/testing

### Complete Error Flow Example

Here's a complete example showing error flow from service layer through utilities to UI:

```typescript
// ============================================
// 1. Utility Layer: Git status with Effect
// ============================================
import {Effect} from 'effect';
import {GitError} from './types/errors.js';

function getGitStatus(
  worktreePath: string
): Effect.Effect<GitStatus, GitError> {
  return Effect.tryPromise({
    try: async () => {
      const result = await execFile('git', ['status', '--porcelain'], {
        cwd: worktreePath
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

// ============================================
// 2. Service Layer: Worktree operations
// ============================================
import {Effect} from 'effect';
import {GitError, FileSystemError} from './types/errors.js';

class WorktreeService {
  getWorktreesEffect(): Effect.Effect<Worktree[], GitError, never> {
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

  createWorktreeEffect(
    path: string,
    branch: string,
    baseBranch: string
  ): Effect.Effect<Worktree, GitError | FileSystemError, never> {
    // Composition: chain multiple Effects
    return Effect.flatMap(
      this.validatePath(path),
      (validPath) => Effect.tryPromise({
        try: async () => {
          await execFile('git', ['worktree', 'add', validPath, branch]);
          return {path: validPath, branch};
        },
        catch: (error: any) => new GitError({
          command: `git worktree add ${validPath} ${branch}`,
          exitCode: error.code || 1,
          stderr: error.stderr || String(error)
        })
      })
    );
  }

  private validatePath(
    path: string
  ): Effect.Effect<string, FileSystemError, never> {
    return Effect.try({
      try: () => {
        if (!fs.existsSync(path)) {
          throw new Error('Path does not exist');
        }
        return path;
      },
      catch: (error) => new FileSystemError({
        operation: 'stat',
        path,
        cause: String(error)
      })
    });
  }
}

// ============================================
// 3. Component Layer: React/Ink UI with Effect execution
// ============================================
import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
import {Effect} from 'effect';
import {WorktreeService} from './services/worktreeService.js';
import {AppError, GitError, FileSystemError} from './types/errors.js';

const Menu: React.FC = () => {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const worktreeService = new WorktreeService();

  // Load worktrees on mount with Effect.match for type-safe handling
  useEffect(() => {
    let cancelled = false;

    const loadWorktrees = async () => {
      const result = await Effect.runPromise(
        Effect.match(worktreeService.getWorktreesEffect(), {
          onFailure: (error: GitError) => ({
            type: 'error' as const,
            message: formatGitError(error)
          }),
          onSuccess: (worktrees: Worktree[]) => ({
            type: 'success' as const,
            data: worktrees
          })
        })
      );

      if (!cancelled) {
        if (result.type === 'error') {
          setError(result.message);
        } else {
          setWorktrees(result.data);
        }
        setIsLoading(false);
      }
    };

    loadWorktrees().catch(err => {
      if (!cancelled) {
        setError(`Unexpected error: ${String(err)}`);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Create worktree with error discrimination
  const handleCreateWorktree = async (
    path: string,
    branch: string,
    baseBranch: string
  ) => {
    const result = await Effect.runPromise(
      Effect.match(
        worktreeService.createWorktreeEffect(path, branch, baseBranch),
        {
          onFailure: (error: GitError | FileSystemError) => ({
            type: 'error' as const,
            message: formatError(error)
          }),
          onSuccess: (worktree: Worktree) => ({
            type: 'success' as const,
            data: worktree
          })
        }
      )
    );

    if (result.type === 'error') {
      setError(result.message);
    } else {
      setWorktrees([...worktrees, result.data]);
    }
  };

  // Format errors using TaggedError discrimination
  const formatError = (error: AppError): string => {
    switch (error._tag) {
      case 'GitError':
        return formatGitError(error);
      case 'FileSystemError':
        return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
      case 'ConfigError':
        return `Config error (${error.reason}): ${error.details}`;
      case 'ProcessError':
        return `Process error: ${error.message}`;
      case 'ValidationError':
        return `Validation failed for ${error.field}: ${error.constraint}`;
    }
  };

  const formatGitError = (error: GitError): string => {
    return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
  };

  if (isLoading) {
    return (
      <Box>
        <Text>Loading worktrees...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Worktrees ({worktrees.length})</Text>
      {worktrees.map(wt => (
        <Text key={wt.path}>{wt.branch} - {wt.path}</Text>
      ))}
    </Box>
  );
};

// ============================================
// 4. Advanced: Effect Recovery Strategies
// ============================================

// Retry with exponential backoff
const withRetry = await Effect.runPromise(
  Effect.retry(
    worktreeService.getWorktreesEffect(),
    {
      times: 3,
      schedule: Schedule.exponential('100 millis')
    }
  )
);

// Fallback to default value
const worktreesWithFallback = await Effect.runPromise(
  Effect.catchAll(
    worktreeService.getWorktreesEffect(),
    (error: GitError) => {
      console.error('Failed to get worktrees:', error.stderr);
      // Return fallback: single worktree for current directory
      return Effect.succeed([{
        path: process.cwd(),
        branch: 'main',
        isMainWorktree: true,
        hasSession: false
      }]);
    }
  )
);

// Recover from specific error types
const withSpecificRecovery = await Effect.runPromise(
  Effect.catchTag(
    worktreeService.createWorktreeEffect('./new-feature', 'feature', 'main'),
    'GitError',
    (error) => {
      if (error.exitCode === 128) {
        // Branch already exists, try different name
        return worktreeService.createWorktreeEffect(
          './new-feature-2',
          'feature-2',
          'main'
        );
      }
      // Re-throw for other git errors
      return Effect.fail(error);
    }
  )
);

// Parallel execution with error collection
const allWorktreeStatus = await Effect.runPromise(
  Effect.all([
    getGitStatus('/worktree1'),
    getGitStatus('/worktree2'),
    getGitStatus('/worktree3')
  ], {
    concurrency: 3,
    mode: 'either' // Collect both successes and failures
  })
);

// Check results - Either.isRight() for success, Either.isLeft() for error
allWorktreeStatus.forEach((result, index) => {
  if (Either.isRight(result)) {
    console.log(`Worktree ${index + 1} status:`, result.right);
  } else {
    console.error(`Worktree ${index + 1} failed:`, result.left.stderr);
  }
});
```

This example demonstrates:
1. **Utility layer**: Git operations wrapped in Effects with GitError
2. **Service layer**: Effect composition with flatMap, multiple error types
3. **Component layer**: Effect execution with Effect.match, error discrimination
4. **Recovery strategies**: Retry, fallback, specific error handling, parallel execution

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

- **result-pattern-error-handling-2**: ✅ **COMPLETED** (Migration completed: October 2025)
  - All WorktreeService methods migrated to Effect-based error handling
  - Legacy synchronous methods removed (`getWorktrees()`, `getDefaultBranch()`, `getAllBranches()`)
  - All try-catch blocks replaced with `Effect.try` or `Effect.tryPromise`
  - Components updated to use `Effect.match` and `Effect.runPromise` patterns
  - Comprehensive tests added for all Effect-based methods
  - Remaining synchronous helpers documented with clear justification:
    - `getAllRemotes()`: Simple utility for `resolveBranchReference`, no Effect needed
    - `resolveBranchReference()`: Called within Effect.gen but doesn't need to be Effect itself
    - `copyClaudeSessionData()`: Wrapped in Effect.try when called, keeping implementation simple
    - `getCurrentBranch()`: Marked @deprecated, only used as fallback in `getWorktreesEffect`

## Future Enhancements

- Session recording and playback
- Split pane view for multiple sessions
- Integration with Claude Code's `-r` flag
- Theme customization
- Plugin system for extensions
- Session history and search
- Worktree templates
