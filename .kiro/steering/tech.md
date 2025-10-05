# Technology Stack

## Architecture

**Type**: Terminal User Interface (TUI) Application
**Pattern**: React-based CLI with PTY (pseudoterminal) process management
**Deployment**: npm package distributed globally or run via npx

### High-level Design
- **Frontend**: React components rendered to terminal via Ink
- **Process Management**: node-pty for spawning and managing AI assistant processes
- **State Management**: React hooks and context for session orchestration
- **Terminal Emulation**: @xterm/headless for processing terminal output

## Core Technologies

### Runtime & Language
- **Node.js**: >=16 required
- **TypeScript**: ^5.0.3 with strict type checking
- **Type Configuration**: Extends @sindresorhus/tsconfig

### UI Framework
- **Ink**: ^4.1.0 - React for CLIs, renders components to terminal
- **ink-select-input**: ^5.0.0 - Menu selection component
- **ink-text-input**: ^5.0.1 - Text input fields for forms

### Terminal & Process Management
- **node-pty**: ^1.0.0 - PTY (pseudoterminal) interface for spawning processes
- **@xterm/headless**: ^5.5.0 - Terminal emulator without DOM
- **strip-ansi**: ^7.1.0 - ANSI escape code processing

### Error Handling
- **effect**: ^3.18.2 - Type-safe, composable error handling with Effect-ts

### CLI Parsing
- **meow**: ^11.0.0 - CLI argument parsing with help text generation

### Build & Development Tools
- **TypeScript Compiler**: tsc for building and watch mode
- **Vitest**: ^3.2.2 - Modern test framework with native ESM support
- **ESLint**: ^9.28.0 - Modern flat config with TypeScript support
- **Prettier**: ^3.0.0 - Code formatting

### Testing Stack
- **vitest**: Unit and integration testing
- **ink-testing-library**: ^3.0.0 - Testing utilities for Ink components
- **@types/node**: TypeScript definitions for Node.js

## Development Environment

### Required Tools
- Node.js 16 or higher
- npm (package manager)
- Git (for worktree operations)

### Optional Tools
- Claude Code CLI (`claude` command)
- Gemini CLI (`gemini` command)
- Docker/Devcontainer CLI (for container integration)
- tmux or similar (optional, not required unlike Claude Squad)

### IDE Setup
- TypeScript language server recommended
- ESLint integration for linting
- Prettier integration for formatting

## Common Commands

### Installation
```bash
npm install -g ccmanager        # Global installation
npm install                     # Local development setup
```

### Development
```bash
npm run dev                     # Watch mode with auto-rebuild
npm run build                   # Compile TypeScript to dist/
npm start                       # Run compiled application
node dist/cli.js                # Direct execution
```

### Testing & Quality
```bash
npm test                        # Run tests in watch mode
npm run test:run                # Single test run
npm run lint                    # Run ESLint
npm run lint:fix                # Auto-fix linting issues
npm run typecheck               # TypeScript type checking
```

### Distribution
```bash
npm run prepublishOnly          # Pre-publish checks (lint, typecheck, test, build)
npx ccmanager                   # Run without installation
```

## Environment Variables

### Multi-Project Mode
- **CCMANAGER_MULTI_PROJECT_ROOT**: Root directory for automatic git repository discovery
  ```bash
  export CCMANAGER_MULTI_PROJECT_ROOT="/path/to/projects"
  ```

### Testing & Development
- **CLAUDE_COMMAND**: Override Claude Code command for testing
  ```bash
  export CLAUDE_COMMAND="./mock-claude"
  ```

### Platform-Specific
- **HOME** (Unix) / **APPDATA** (Windows): Used for configuration directory resolution
  - Config path: `~/.config/ccmanager/` (Unix)
  - Config path: `%APPDATA%/ccmanager/` (Windows)

## Configuration Files

### User Configuration
- **Location**: `~/.config/ccmanager/config.json`
- **Contents**: Shortcuts, command presets, worktree settings, hooks
- **Format**: JSON

### Recent Projects
- **Location**: `~/.config/ccmanager/recent-projects.json`
- **Contents**: Frequently accessed projects for multi-project mode
- **Format**: JSON array

### Legacy Migration
- `shortcuts.json` → Automatically migrated to `config.json` on first use

## Port Configuration

No network ports used - CCManager is a local CLI application that manages local processes.

## State Detection Strategies

### Strategy Pattern Implementation
- **BaseStateDetector**: Abstract base class with shared terminal output analysis
- **ClaudeStateDetector**: Claude Code specific prompt patterns
- **GeminiStateDetector**: Gemini CLI specific prompt patterns
- **Extensible**: New detectors can be added by extending BaseStateDetector

### Session States
- **Idle**: Ready for new input
- **Busy**: Processing a request (detecting escape/cancel prompts)
- **Waiting**: Awaiting user confirmation (detecting yes/no prompts)

## Key Architectural Decisions

### PTY vs Exec
Uses node-pty for full terminal emulation to support:
- ANSI color codes and formatting
- Interactive prompts and confirmations
- Real-time output streaming
- Proper signal handling (Ctrl+C, etc.)

### React for CLI
Ink provides:
- Component-based UI architecture
- State management with hooks
- Efficient terminal rendering
- Testing utilities for CLI apps

### Multi-Project Orchestration
- **GlobalSessionOrchestrator**: Manages session state across all projects
- **Per-Project SessionManagers**: Each project maintains its own sessions
- **Session Persistence**: Active sessions remain alive during project switching
