# CCManager - Claude Code Worktree Manager

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees.

https://github.com/user-attachments/assets/a6d80e73-dc06-4ef8-849d-e3857f6c7024

## Features

- Run multiple Claude Code sessions in parallel across different Git worktrees
- Switch between sessions seamlessly
- Visual status indicators for session states (busy, waiting, idle)
- Create, merge, and delete worktrees from within the app
- Configurable keyboard shortcuts

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

## Keyboard Shortcuts

### Default Shortcuts

- **Ctrl+E**: Return to menu from active session
- **Escape**: Cancel/Go back in dialogs

### Customizing Shortcuts

You can customize keyboard shortcuts in two ways:

1. **Through the UI**: Select "Configure Shortcuts" from the main menu
2. **Configuration file**: Edit `~/.config/ccmanager/shortcuts.json`

Example configuration:
```json
{
  "returnToMenu": {
    "ctrl": true,
    "key": "r"
  },
  "exitApp": {
    "ctrl": true,
    "key": "x"
  },
  "cancel": {
    "key": "escape"
  }
}
```

### Restrictions

- Shortcuts must use a modifier key (Ctrl) except for special keys like Escape
- The following key combinations are reserved and cannot be used:
  - Ctrl+C
  - Ctrl+D
  - Ctrl+[ (equivalent to Escape)

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
