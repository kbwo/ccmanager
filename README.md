# CCManager - Claude Code Worktree Manager

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees.



https://github.com/user-attachments/assets/a6d80e73-dc06-4ef8-849d-e3857f6c7024



## Features

- Run multiple Claude Code sessions in parallel across different Git worktrees
- Switch between sessions seamlessly
- Visual status indicators for session states (busy, waiting, idle)
- Create, merge, and delete worktrees from within the app
- Configurable keyboard shortcuts

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
