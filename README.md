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

```bash
$ npx ccmanager
```

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

### Configuration

Configure hooks through the UI:
1. Select "Configuration" from the main menu
2. Choose "Configure Status Hooks"
3. Set commands for each state (idle, busy, waiting_input)

### Available Environment Variables

Your hook commands have access to these environment variables:
- `CCMANAGER_OLD_STATE`: Previous state
- `CCMANAGER_NEW_STATE`: New state (idle, busy, or waiting_input)
- `CCMANAGER_WORKTREE`: Path to the worktree
- `CCMANAGER_WORKTREE_BRANCH`: Git branch name
- `CCMANAGER_SESSION_ID`: Unique session identifier

### Example: Desktop Notifications

```bash
# Notify when Claude needs input
noti -t "Claude Code" -m "Needs your input on $CCMANAGER_WORKTREE_BRANCH"

# Alert when task completes
[ "$CCMANAGER_OLD_STATE" = "busy" ] && noti -t "Claude Done" -m "Task complete!"
```

For more examples and detailed setup instructions, see [docs/state-hooks.md](docs/state-hooks.md).

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
