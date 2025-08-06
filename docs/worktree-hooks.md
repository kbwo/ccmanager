# Worktree Hooks

CCManager supports executing custom hooks when worktrees are created, allowing you to automate tasks like setting up development environments, creating configuration files, or sending notifications.

## Configuration

Worktree hooks are configured in the CCManager configuration file (`~/.config/ccmanager/config.json`). You can configure them through the UI or by editing the configuration file directly.

### Available Hooks

#### Post-Creation Hook

The `post_creation` hook is executed after a new worktree is successfully created.

```json
{
  "worktreeHooks": {
    "post_creation": {
      "command": "your-command-here",
      "enabled": true
    }
  }
}
```

## Environment Variables

When a worktree hook is executed, the following environment variables are available:

- `CCMANAGER_WORKTREE_PATH`: The absolute path to the newly created worktree
- `CCMANAGER_WORKTREE_BRANCH`: The branch name of the worktree
- `CCMANAGER_GIT_ROOT`: The root path of the git repository
- `CCMANAGER_BASE_BRANCH`: The base branch used to create the worktree (optional)

## Examples

### 1. Send Desktop Notification

```bash
# Linux (using notify-send)
notify-send "Worktree Created" "Branch: $CCMANAGER_WORKTREE_BRANCH"

# macOS (using osascript)
osascript -e "display notification \"Branch: $CCMANAGER_WORKTREE_BRANCH\" with title \"Worktree Created\""
```

### 2. Setup Development Environment

```bash
#!/bin/bash
cd "$CCMANAGER_WORKTREE_PATH"

# Install dependencies
npm install

# Copy environment files
cp .env.example .env

# Run database migrations
npm run migrate

echo "Development environment ready for $CCMANAGER_WORKTREE_BRANCH"
```

### 3. Create IDE Configuration

```bash
#!/bin/bash
# Create VS Code workspace settings
mkdir -p "$CCMANAGER_WORKTREE_PATH/.vscode"
cat > "$CCMANAGER_WORKTREE_PATH/.vscode/settings.json" << EOF
{
  "window.title": "\${activeEditorShort} - $CCMANAGER_WORKTREE_BRANCH",
  "workbench.colorCustomizations": {
    "titleBar.activeBackground": "#$(echo $CCMANAGER_WORKTREE_BRANCH | md5sum | cut -c1-6)"
  }
}
EOF
```

### 4. Git Configuration

```bash
#!/bin/bash
cd "$CCMANAGER_WORKTREE_PATH"

# Set branch-specific git config
git config user.email "branch-$CCMANAGER_WORKTREE_BRANCH@example.com"

# Setup pre-commit hooks
ln -sf ../../.githooks/pre-commit .git/hooks/pre-commit
```

### 5. Integration with Task Management

```bash
#!/bin/bash
# Create a task in your project management tool
curl -X POST https://api.example.com/tasks \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Working on $CCMANAGER_WORKTREE_BRANCH\",
    \"description\": \"Worktree created at $CCMANAGER_WORKTREE_PATH\",
    \"project\": \"$CCMANAGER_GIT_ROOT\"
  }"
```

## Best Practices

1. **Keep hooks fast**: Hooks should complete quickly to avoid delaying the worktree creation process
2. **Handle errors gracefully**: Hook failures won't prevent worktree creation, but should log meaningful errors
3. **Use absolute paths**: Always use absolute paths in your scripts, don't rely on relative paths
4. **Check for dependencies**: Verify required tools are installed before using them
5. **Make hooks idempotent**: Hooks should be safe to run multiple times

## Debugging

Hook output (stdout and stderr) is displayed in the CCManager console. To debug hooks:

1. Add echo statements to track execution
2. Redirect output to a log file: `echo "Debug: $CCMANAGER_WORKTREE_PATH" >> /tmp/ccmanager-hook.log`
3. Use `set -x` in bash scripts to trace execution

## Security Considerations

- Hooks are executed with the same permissions as CCManager
- Be cautious with hooks that accept user input or interact with external services
- Store sensitive data (API tokens, passwords) in environment variables or secure storage, not in the hook commands

## Comparison with Status Hooks

| Feature | Status Hooks | Worktree Hooks |
|---------|-------------|----------------|
| Trigger | Session state changes | Worktree operations |
| Frequency | Multiple times per session | Once per worktree |
| Context | Session and worktree info | Worktree and git info |
| Use Cases | Monitoring, notifications | Setup, configuration |