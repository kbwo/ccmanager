# CCManager - Claude Code Session Manager

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees.

https://github.com/user-attachments/assets/a6d80e73-dc06-4ef8-849d-e3857f6c7024

## Features

- Run multiple Claude Code sessions in parallel across different Git worktrees
- Switch between sessions seamlessly
- Visual status indicators for session states (busy, waiting, idle)
- Create, merge, and delete worktrees from within the app
- Configurable keyboard shortcuts
- Status change hooks for automation and notifications

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
$ npm install
$ npm run build
$ npm start
```

## Usage

### Basic Usage

```bash
$ npx ccmanager
```

### CLI Options

CCManager supports command-line options to directly open specific worktrees:

```bash
# Open a specific worktree by path
$ npx ccmanager --worktree /path/to/worktree
$ npx ccmanager -w ../feature-branch

# Create a new branch and worktree
$ npx ccmanager --branch feature/new-feature
$ npx ccmanager -b hotfix/critical

# Create new branch from specific base branch
$ npx ccmanager --branch feature/auth --from-branch develop
$ npx ccmanager -b hotfix/security -f main

# Open existing worktree (if branch already exists)
$ npx ccmanager --worktree /path/to/existing/worktree
```

### Default Worktree Directory

CCManager automatically creates and uses `~/.ccmanager/worktrees` as the default directory for new worktrees. When creating a new worktree:

- **Leave path empty**: Uses `~/.ccmanager/worktrees/{sanitized-branch-name}`
- **Specify custom path**: Uses your custom path
- **Override default location**: Set `CCMANAGER_DEFAULT_WORKTREE_DIR` environment variable

## Environment Variables

### CCMANAGER_CLAUDE_ARGS

You can pass additional arguments to Claude Code sessions by setting the `CCMANAGER_CLAUDE_ARGS` environment variable:

```bash
# Start Claude Code with specific arguments for all sessions
export CCMANAGER_CLAUDE_ARGS="--resume"
npx ccmanager

# Or set it inline
CCMANAGER_CLAUDE_ARGS="--resume" npx ccmanager
```

The arguments are applied to all Claude Code sessions started by CCManager.

### CCMANAGER_DEFAULT_WORKTREE_DIR

Override the default worktree directory location:

```bash
# Use a custom default directory
export CCMANAGER_DEFAULT_WORKTREE_DIR="~/dev/worktrees"
npx ccmanager

# Or set it inline
CCMANAGER_DEFAULT_WORKTREE_DIR="~/dev/worktrees" npx ccmanager
```

When this variable is set:
- New worktrees created with empty paths will use this directory
- The UI will show this as the default location
- The directory will be created automatically if it doesn't exist

If not set, defaults to `~/.ccmanager/worktrees`.

## Terminal Integration

### Ghostty Profile

For Ghostty users, you can create a dedicated profile for CCManager with custom worktree directories. Here's a suggested profile configuration:

**Profile name suggestion**: `ccmanager-dev` or `claude-worktrees`

Add this to your Ghostty configuration:

```toml
# ~/.config/ghostty/config
[profile.ccmanager-dev]
command = ["npx", "ccmanager"]
title = "CCManager - Claude Code Worktrees"

# Set custom default worktree directory
env = [
    "CCMANAGER_DEFAULT_WORKTREE_DIR=~/dev/claude-worktrees"
]

# Optional: Custom appearance for CCManager sessions
theme = "dark"
window-height = 40
window-width = 120

# Optional: Auto-start in a specific directory
working-directory = "~/dev"
```

Usage:
```bash
# Launch CCManager with the profile
ghostty --profile=ccmanager-dev

# Or create an alias
alias ccm="ghostty --profile=ccmanager-dev"
```

This setup provides:
- Dedicated CCManager environment
- Custom worktree directory location
- Optimized window size for the TUI
- Consistent working directory

## Keyboard Shortcuts

### Default Shortcuts

- **Ctrl+E**: Return to menu from active session
- **Escape**: Cancel/Go back in dialogs

### Customizing Shortcuts

You can customize keyboard shortcuts in two ways:

1. **Through the UI**: Select "Configuration" → "Configure Shortcuts" from the main menu
2. **Configuration file**: Edit `~/.config/ccmanager/config.json` (or legacy `~/.config/ccmanager/shortcuts.json`)

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

// shortcuts.json (legacy format, still supported)
{
  "returnToMenu": {
    "ctrl": true,
    "key": "r"
  },
  "cancel": {
    "key": "escape"
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

## Status Change Hooks

CCManager can execute custom commands when Claude Code session status changes. This enables powerful automation workflows like desktop notifications, logging, or integration with other tools.

### Overview

Status hooks allow you to:
- Get notified when Claude needs your input
- Track time spent in different states
- Trigger automations based on session activity
- Integrate with notification systems like [noti](https://github.com/variadico/noti)

For detailed setup instructions, see [docs/state-hooks.md](docs/state-hooks.md).

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
