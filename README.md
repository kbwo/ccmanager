# CCManager - AI Code Agent Session Manager

[![Mentioned in Awesome Gemini CLI](https://awesome.re/mentioned-badge.svg)](https://github.com/Piebald-AI/awesome-gemini-cli)

CCManager is a CLI application for managing multiple AI coding assistant sessions (Claude Code, Gemini CLI, Codex CLI) across Git worktrees and projects.

https://github.com/user-attachments/assets/15914a88-e288-4ac9-94d5-8127f2e19dbf

## Features

- Run multiple AI assistant sessions in parallel across different Git worktrees
- **Multi-project support**: Manage multiple git repositories from a single interface
- Support for multiple AI coding assistants (Claude Code, Gemini CLI)
- Switch between sessions seamlessly
- Visual status indicators for session states (busy, waiting, idle)
- Create, merge, and delete worktrees from within the app
- **Copy Claude Code session data** between worktrees to maintain conversation context
- Configurable keyboard shortcuts
- Command presets with automatic fallback support
- Configurable state detection strategies for different CLI tools
- Status change hooks for automation and notifications
- Devcontainer integration

## Why CCManager over Claude Squad?

Both tools solve the same problem - managing multiple Claude Code sessions - but take different approaches.

**If you love tmux-based workflows, stick with Claude Squad!** It's a great tool that leverages tmux's power for session management.

CCManager is for developers who want:

### 🚀 No tmux dependency
CCManager is completely self-contained. No need to install or configure tmux - it works out of the box. Perfect if you don't use tmux or want to keep your tmux setup separate from Claude Code management.

### 👁️ Real-time session monitoring
CCManager shows the actual state of each Claude Code session directly in the menu:
- **Waiting**: Claude is asking for user input
- **Busy**: Claude is processing
- **Idle**: Ready for new tasks

Claude Squad doesn't show session states in its menu, making it hard to know which sessions need attention. While Claude Squad offers an AutoYes feature, this bypasses Claude Code's built-in security confirmations - not recommended for safe operation.

### 🎯 Simple and intuitive interface
Following Claude Code's philosophy, CCManager keeps things minimal and intuitive. The interface is so simple you'll understand it in seconds - no manual needed.

## Install

```bash
npm install -g ccmanager
```

Or for local development:

```bash
npm install
npm run build
npm start
```

## Usage

```bash
ccmanager
```

Or run without installing:

```bash
npx ccmanager
```

## Keyboard Shortcuts

### Default Shortcuts

- **Ctrl+E**: Return to menu from active session
- **Escape**: Cancel/Go back in dialogs

### Customizing Shortcuts

You can customize keyboard shortcuts in two ways:

1. **Through the UI**: Select "Configuration" → "Configure Shortcuts" from the main menu
2. **Configuration file**: Edit `~/.config/ccmanager/config.json`

Example configuration:
```json
// config.json (new format)
{
  "shortcuts": {
    "returnToMenu": {
      "ctrl": true,
      "key": "r"
    },
    "cancel": {
      "key": "escape"
    }
  }
}
```

Note: Shortcuts from `shortcuts.json` will be automatically migrated to `config.json` on first use.

### Restrictions

- Shortcuts must use a modifier key (Ctrl) except for special keys like Escape
- The following key combinations are reserved and cannot be used:
  - Ctrl+C
  - Ctrl+D
  - Ctrl+[ (equivalent to Escape)

## Supported AI Assistants

CCManager now supports multiple AI coding assistants with tailored state detection:

### Claude Code (Default)
- Command: `claude`
- State detection: Built-in patterns for Claude's prompts and status messages

### Gemini CLI
- Command: `gemini`
- State detection: Custom patterns for Gemini's confirmation prompts
- Installation: [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)

Each assistant has its own state detection strategy to properly track:
- **Idle**: Ready for new input
- **Busy**: Processing a request
- **Waiting**: Awaiting user confirmation

See [Gemini Support Documentation](docs/gemini-support.md) for detailed configuration instructions.


## Command Configuration

![Screenshot From 2025-06-18 16-43-27](https://github.com/user-attachments/assets/47d62483-ce81-4340-8687-8afcae93d5db)


CCManager supports configuring the command and arguments used to run Claude Code sessions, with automatic fallback options for reliability.

### Features

- Configure the main command (default: `claude`)
- Set primary arguments (e.g., `--resume`)
- Define fallback arguments if the primary configuration fails
- Automatic retry with no arguments as final fallback

### Quick Start

1. Navigate to **Configuration** → **Configure Command Presets**
2. Set your desired arguments (e.g., `--resume` for resuming sessions)
3. Optionally set fallback arguments
4. Save changes

For detailed configuration options and examples, see [docs/command-config.md](docs/command-config.md).


## Session Data Copying

CCManager can copy Claude Code session data (conversation history, context, and project state) when creating new worktrees, allowing you to maintain context across different branches.

### Features

- **Seamless Context Transfer**: Continue conversations in new worktrees without losing context
- **Configurable Default**: Set whether to copy session data by default
- **Per-Creation Choice**: Decide on each worktree creation whether to copy data
- **Safe Operation**: Copying is non-fatal - worktree creation succeeds even if copying fails

### How It Works

When creating a new worktree, CCManager:
1. Asks whether to copy session data from the current worktree
2. Copies all session files from `~/.claude/projects/[source-path]` to `~/.claude/projects/[target-path]`
3. Preserves conversation history, project context, and Claude Code state
4. Allows immediate continuation of conversations in the new worktree

### Configuration

1. Navigate to **Configuration** → **Configure Worktree**
2. Toggle **Copy Session Data** to set the default behavior
3. Save changes

The default choice (copy or start fresh) will be pre-selected when creating new worktrees.

### Use Cases

- **Feature Development**: Copy session data when creating feature branches to maintain project context
- **Experimentation**: Start fresh when testing unrelated changes
- **Collaboration**: Share session state across team worktrees
- **Context Preservation**: Maintain long conversations across multiple development branches


## Status Change Hooks

CCManager can execute custom commands when Claude Code session status changes. This enables powerful automation workflows like desktop notifications, logging, or integration with other tools.

### Overview

Status hooks allow you to:
- Get notified when Claude needs your input
- Track time spent in different states
- Trigger automations based on session activity
- Integrate with notification systems like [noti](https://github.com/variadico/noti)

For detailed setup instructions, see [docs/state-hooks.md](docs/status-hooks.md).

## Worktree Hooks

Worktree hooks execute custom commands when worktrees are created, enabling automation of development environment setup.

### Features
- **Post-creation hook**: Run commands after a worktree is created
- **Environment variables**: Access worktree path, branch name, and git root
- **Non-blocking execution**: Hooks run asynchronously without delaying operations
- **Error resilience**: Hook failures don't prevent worktree creation

### Use Cases
- Set up development dependencies (`npm install`, `bundle install`)
- Configure IDE settings per branch
- Send notifications when worktrees are created
- Initialize branch-specific configurations

For configuration and examples, see [docs/worktree-hooks.md](docs/worktree-hooks.md).

## Automatic Worktree Directory Generation

CCManager can automatically generate worktree directory paths based on branch names, streamlining the worktree creation process.

- **Auto-generate paths**: No need to manually specify directories
- **Customizable patterns**: Use placeholders like `{branch}` in your pattern
- **Smart sanitization**: Branch names are automatically made filesystem-safe

For detailed configuration and examples, see [docs/worktree-auto-directory.md](docs/worktree-auto-directory.md).

## Devcontainer Integration

CCManager supports running AI assistant sessions inside devcontainers while keeping the manager itself on the host machine. This enables sandboxed development environments with restricted network access while maintaining host-level notifications and automation.

### Features

- **Host-based management**: CCManager runs on your host machine, managing sessions inside containers
- **Seamless integration**: All existing features (presets, status hooks, etc.) work with devcontainers
- **Security-focused**: Compatible with Anthropic's recommended devcontainer configurations
- **Persistent state**: Configuration and history persist across container recreations

### Usage

```bash
# Start CCManager with devcontainer support
npx ccmanager --devc-up-command "<your devcontainer up command>" \
              --devc-exec-command "<your devcontainer exec command>"
```

The devcontainer integration requires both commands:
- `--devc-up-command`: Any command to start the devcontainer
- `--devc-exec-command`: Any command to execute inside the container

### Benefits

- **Safe experimentation**: Run commands like `claude --dangerously-skip-permissions` without risk

For detailed setup and configuration, see [docs/devcontainer.md](docs/devcontainer.md).

## Multi-Project Mode

CCManager can manage multiple git repositories from a single interface, allowing you to organize and navigate between different projects and their worktrees efficiently.

### Quick Start

```bash
# Set the root directory containing your git projects
export CCMANAGER_MULTI_PROJECT_ROOT="/path/to/your/projects"

# Run CCManager in multi-project mode
npx ccmanager --multi-project
```

### Features

- **Automatic project discovery**: Recursively finds all git repositories
- **Recent projects**: Frequently used projects appear at the top
- **Vi-like search**: Press `/` to filter projects or worktrees
- **Session persistence**: Sessions remain active when switching projects
- **Visual indicators**: See session counts `[active/busy/waiting]` for each project

### Navigation

1. **Project List**: Select from all discovered git repositories
2. **Worktree Menu**: Manage worktrees for the selected project
3. **Session View**: Interact with your AI assistant

Use `B` key to navigate back from worktrees to project list.

For detailed configuration and usage, see [docs/multi-project.md](docs/multi-project.md).

## Git Worktree Configuration

CCManager can display enhanced git status information for each worktree when Git's worktree configuration extension is enabled.

```bash
# Enable enhanced status tracking
git config extensions.worktreeConfig true
```

With this enabled, you'll see:
- **File changes**: `+10 -5` (additions/deletions)
- **Commit tracking**: `↑3 ↓1` (ahead/behind parent branch)
- **Parent branch context**: Shows which branch the worktree was created from

For complete setup instructions and troubleshooting, see [docs/git-worktree-config.md](docs/git-worktree-config.md).

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test

# Run linter
npm run lint

# Run type checker
npm run typecheck
```
