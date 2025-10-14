# Project Structure

## Root Directory Organization

```
ccmanager/
├── dist/                    # Compiled JavaScript output (generated)
├── docs/                    # Feature documentation
├── src/                     # TypeScript source code
├── node_modules/           # Dependencies (generated)
├── .kiro/                  # Kiro steering documents
├── .serena/                # Serena AI memories
├── package.json            # Package configuration and dependencies
├── tsconfig.json           # TypeScript compiler configuration
├── eslint.config.js        # Modern flat ESLint configuration
├── vitest.config.ts        # Vitest test configuration
├── CLAUDE.md               # Project instructions for Claude Code
├── README.md               # Main project documentation
└── shortcuts.example.json  # Example shortcut configuration
```

### Key Root Files
- **dist/cli.js**: Entry point defined in package.json bin
- **CLAUDE.md**: Project-specific instructions and architecture guide for AI assistants
- **README.md**: User-facing documentation with features and usage
- **eslint.config.js**: Modern flat ESLint config (v9+)

## Source Directory Structure (`src/`)

```
src/
├── cli.tsx                 # Application entry point with CLI argument parsing
├── components/             # React/Ink UI components
├── services/              # Business logic and core services
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions and helpers
├── hooks/                 # Custom React hooks
└── constants/             # Shared constants and configuration
```

### Components Directory (`src/components/`)

**Purpose**: React/Ink components for terminal UI

```
components/
├── App.tsx                          # Main application container with routing
├── Menu.tsx                         # Worktree list with status indicators
├── Session.tsx                      # PTY terminal rendering
├── ProjectList.tsx                  # Multi-project selection interface
├── Configuration.tsx                # Settings menu
├── ConfigureShortcuts.tsx          # Keyboard shortcut editor
├── ConfigureCommand.tsx            # Command preset configuration
├── ConfigureWorktree.tsx           # Worktree settings (session data copy)
├── ConfigureWorktreeHooks.tsx      # Worktree hooks configuration
├── ConfigureStatusHooks.tsx        # Status change hooks configuration
├── NewWorktree.tsx                 # Worktree creation form
├── DeleteWorktree.tsx              # Worktree deletion form
├── MergeWorktree.tsx               # Worktree merge form
├── RemoteBranchSelector.tsx        # Remote branch selection dialog
├── PresetSelector.tsx              # Command preset selection
├── Confirmation.tsx                # Generic confirmation dialog
├── DeleteConfirmation.tsx          # Delete-specific confirmation
├── TextInputWrapper.tsx            # Reusable text input component
└── *.test.tsx                      # Component tests
```

**Key Patterns**:
- One component per file
- Co-located test files with `.test.tsx` suffix
- Functional components with hooks
- Props interfaces defined inline or in types/

### Services Directory (`src/services/`)

**Purpose**: Business logic, state management, and external interactions

```
services/
├── sessionManager.ts                           # PTY session lifecycle management
├── worktreeService.ts                         # Git worktree operations
├── configurationManager.ts                    # User configuration persistence
├── shortcutManager.ts                         # Keyboard shortcut handling
├── stateDetector.ts                          # Session state detection strategies
├── projectManager.ts                         # Multi-project discovery and tracking
├── globalSessionOrchestrator.ts              # Cross-project session coordination
├── worktreeConfigManager.ts                  # Worktree-specific configuration
└── *.test.ts                                 # Service tests
```

**Key Services**:
- **sessionManager**: Spawns and manages node-pty processes, handles devcontainer integration
- **worktreeService**: Wraps Git commands for worktree management
- **stateDetector**: Strategy pattern for detecting AI assistant states from terminal output
- **globalSessionOrchestrator**: Maintains session state across multiple projects
- **projectManager**: Discovers git repos, tracks recent projects

### Types Directory (`src/types/`)

**Purpose**: Shared TypeScript type definitions

```
types/
└── index.ts                # Central type definitions export
```

**Key Types**:
- `Worktree`: Git worktree metadata
- `Session`: Active PTY session state
- `CommandPreset`: AI assistant command configuration
- `ShortcutConfig`: Keyboard shortcut definitions
- `StateDetectionStrategy`: 'claude' | 'gemini' | custom
- `SessionStatus`: 'idle' | 'busy' | 'waiting'
- `DevcontainerConfig`: Container integration settings
- `Project`: Git repository metadata for multi-project mode

### Utils Directory (`src/utils/`)

**Purpose**: Reusable utility functions and helpers

```
utils/
├── claudeDir.ts               # Claude Code directory resolution
├── gitStatus.ts               # Git status parsing and formatting
├── worktreeUtils.ts           # Worktree path manipulation
├── worktreeConfig.ts          # Git worktree config extension handling
├── promptDetector.ts          # Terminal output pattern matching
├── hookExecutor.ts            # Status/worktree hook execution
├── logger.ts                  # Logging utilities
├── concurrencyLimit.ts        # Async operation limiting
└── *.test.ts                  # Utility tests
```

**Key Utilities**:
- **claudeDir**: Resolves `~/.claude/projects/` paths for session data
- **gitStatus**: Parses git status for ahead/behind counts, file changes
- **promptDetector**: Pattern matching for AI assistant prompt detection
- **hookExecutor**: Executes user-defined hooks with environment variables

### Hooks Directory (`src/hooks/`)

**Purpose**: Custom React hooks for shared logic

```
hooks/
├── useSearchMode.ts           # Vi-like search functionality
├── useGitStatus.ts           # Git status polling and state
└── *.test.ts                 # Hook tests
```

**Key Hooks**:
- **useSearchMode**: Manages search mode state, filtering, and key handlers
- **useGitStatus**: Polls git status with configurable intervals

### Constants Directory (`src/constants/`)

**Purpose**: Application-wide constants

```
constants/
├── statusIcons.ts            # Session status visual indicators
├── statePersistence.ts       # State persistence configuration
├── error.ts                  # Error messages and codes
└── env.ts                    # Environment variable names
```

## Code Organization Patterns

### Component Pattern
```tsx
// components/ExampleComponent.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';

interface Props {
  title: string;
  onAction: () => void;
}

const ExampleComponent: React.FC<Props> = ({ title, onAction }) => {
  useInput((input, key) => {
    if (key.return) {
      onAction();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>{title}</Text>
    </Box>
  );
};

export default ExampleComponent;
```

### Service Pattern
```typescript
// services/exampleService.ts
export class ExampleService {
  async performAction(): Promise<Result> {
    // Implementation
  }
}

export const createExampleService = () => new ExampleService();
```

### Strategy Pattern (State Detection)
```typescript
// services/stateDetector.ts
interface StateDetector {
  detectState(output: string): SessionStatus;
}

class BaseStateDetector implements StateDetector {
  // Shared implementation
}

class ClaudeStateDetector extends BaseStateDetector {
  // Claude-specific patterns
}
```

## File Naming Conventions

### Source Files
- **Components**: PascalCase (e.g., `ConfigureShortcuts.tsx`)
- **Services**: camelCase (e.g., `sessionManager.ts`)
- **Types**: camelCase (e.g., `index.ts` in types/)
- **Utils**: camelCase (e.g., `gitStatus.ts`)
- **Hooks**: camelCase with `use` prefix (e.g., `useSearchMode.ts`)

### Test Files
- **Unit/Integration**: `*.test.ts` or `*.test.tsx`
- **Integration tests**: Placed in `src/integration-tests/`
- **Co-located**: Test files next to source files

### Configuration Files
- **TypeScript**: `*.ts` for config (e.g., `vitest.config.ts`)
- **JSON**: Lowercase with hyphens (e.g., `shortcuts.example.json`)
- **JavaScript**: Kebab-case for configs (e.g., `eslint.config.js`)

## Import Organization

### Import Order (by convention)
1. External dependencies (React, Ink, node-pty, etc.)
2. Internal components (relative imports from `components/`)
3. Internal services (relative imports from `services/`)
4. Internal types (relative imports from `types/`)
5. Internal utils (relative imports from `utils/`)
6. Internal constants (relative imports from `constants/`)

### Path Style
- **Relative imports**: Used throughout the codebase (`../services/sessionManager`)
- **No path aliases**: Project does not use TypeScript path mapping

### Module System
- **ESM**: `"type": "module"` in package.json
- **Extensions**: `.ts`, `.tsx` for source; `.js` for compiled output
- **Imports**: Use explicit extensions in compiled output

## Documentation Structure

### Main Documentation (`docs/`)
```
docs/
├── command-config.md                        # Command preset documentation
├── status-hooks.md                          # Status change hooks guide
├── worktree-hooks.md                        # Worktree hooks guide
├── worktree-auto-directory.md              # Auto-directory generation
├── devcontainer.md                          # Devcontainer integration
├── multi-project.md                         # Multi-project mode guide
├── git-worktree-config.md                  # Git worktree config extension
├── gemini-support.md                        # Gemini CLI integration
├── always-alternate-screen-implementation.md
└── alternate-screen-buffer-implementation.md
```

**Documentation Standards**:
- Markdown format with code examples
- Feature-specific guides in separate files
- Installation and setup instructions included
- Configuration examples provided

### AI Assistant Context
- **CLAUDE.md**: Project instructions and architecture for Claude Code
- **.serena/memories/**: Serena AI memories for project context
- **.kiro/steering/**: Kiro steering documents for spec-driven development

## Key Architectural Principles

### 1. Component-Based UI
- React/Ink components for terminal rendering
- Hooks for state and side effects
- Functional component pattern throughout

### 2. Service-Oriented Architecture
- Business logic isolated in service classes
- Clear separation between UI and logic
- Dependency injection via context or props

### 3. Strategy Pattern for Extensibility
- State detection supports multiple AI assistants
- New strategies added without modifying existing code
- Factory pattern for detector creation

### 4. Test Co-location
- Tests next to source files for discoverability
- Integration tests in dedicated directory
- Vitest for modern ESM-compatible testing

### 5. Configuration Management
- JSON-based user configuration
- Platform-aware config paths (Unix/Windows)
- Migration support for config format changes

### 6. Process Isolation
- Each AI session in separate PTY process
- Session cleanup on component unmount
- Proper signal handling for process termination

### 7. Multi-Project Orchestration
- Global orchestrator for cross-project state
- Per-project session managers for isolation
- Recent projects tracking for UX optimization
