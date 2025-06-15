# Status Change Hooks Example with Noti

This example demonstrates how to use [noti](https://github.com/variadico/noti) to receive desktop notifications when Claude Code session status changes.

## Prerequisites

First, install noti:

```bash
# macOS
brew install noti

# Linux
go install github.com/variadico/noti/cmd/noti@latest

# Or download from releases
# https://github.com/variadico/noti/releases
```

## Configuration Examples

### Basic Notifications

Configure CCManager to send notifications for each status:

1. Run `ccmanager`
2. Navigate to **Configuration** → **Configure Status Hooks**
3. Set up the following hooks:

**Idle Hook:**
```bash
noti -t "Claude Code" -m "Session is now idle in $CCMANAGER_WORKTREE_BRANCH"
```

**Busy Hook:**
```bash
noti -t "Claude Code" -m "Session is now busy on branch $CCMANAGER_WORKTREE_BRANCH"
```

**Waiting for Input Hook:**
```bash
noti -t "Claude Code" -m "Claude is waiting for your input in $CCMANAGER_WORKTREE_BRANCH branch"
```

### Advanced Examples

#### Play Sound on Status Change

**Idle Hook (with sound):**
```bash
noti -t "Claude Code" -m "Session idle" && afplay /System/Library/Sounds/Glass.aiff
```

**Waiting for Input (urgent):**
```bash
noti -t "Claude Code - Action Required" -m "Claude needs your input!" && afplay /System/Library/Sounds/Ping.aiff
```

#### Log Status Changes

Create a status change logger:

```bash
echo "$(date): $CCMANAGER_NEW_STATE (from $CCMANAGER_OLD_STATE) in $CCMANAGER_WORKTREE" >> ~/.ccmanager/status.log && noti -t "CCManager" -m "Status: $CCMANAGER_NEW_STATE"
```

#### Smart Notifications (only notify on specific transitions)

**Notify only when Claude becomes idle after being busy:**
```bash
[ "$CCMANAGER_OLD_STATE" = "busy" ] && noti -t "Claude Code Complete" -m "Task finished on $CCMANAGER_WORKTREE_BRANCH branch"
```

**Notify only when waiting for input after being busy:**
```bash
[ "$CCMANAGER_OLD_STATE" = "busy" ] && noti -t "Claude Code" -m "Claude needs your decision on $CCMANAGER_WORKTREE_BRANCH" -s
```

**Branch-specific notifications:**
```bash
[[ "$CCMANAGER_WORKTREE_BRANCH" == "main" ]] && noti -t "⚠️ Main Branch" -m "Claude is $CCMANAGER_NEW_STATE on main!"
```

#### Integration with Other Tools

**Send to Slack (using webhook):**
```bash
curl -X POST -H 'Content-type: application/json' --data '{"text":"Claude is now '"$CCMANAGER_NEW_STATE"' in '"$CCMANAGER_WORKTREE"'"}' YOUR_SLACK_WEBHOOK_URL
```

**Update tmux status:**
```bash
tmux set -g status-right "Claude: $CCMANAGER_NEW_STATE" && noti -t "Claude Status" -m "$CCMANAGER_NEW_STATE"
```

## Platform-Specific Examples

### macOS with Native Notifications

```bash
# Using osascript for more control
osascript -e 'display notification "Session is '"$CCMANAGER_NEW_STATE"'" with title "Claude Code" subtitle "'"$CCMANAGER_WORKTREE"'"'
```

### Linux with notify-send

```bash
# If you prefer notify-send over noti
notify-send "Claude Code" "Status: $CCMANAGER_NEW_STATE in $CCMANAGER_WORKTREE" --icon=dialog-information
```

### Windows with PowerShell

```bash
# For Windows users
powershell -Command "New-BurntToastNotification -Text 'Claude Code', 'Status: $env:CCMANAGER_NEW_STATE'"
```

## Best Practices

1. **Don't Over-Notify**: Consider which transitions actually need your attention
2. **Use Sounds Sparingly**: Only for important status changes like "waiting_input"
3. **Log for Analysis**: Keep logs to understand your Claude usage patterns
4. **Test Your Hooks**: Use simple echo commands first to ensure they work

## Example Workflow

Here's a complete setup for a productive workflow:

1. **Idle Hook**: Log only (no notification needed)
   ```bash
   echo "$(date): Idle" >> ~/.ccmanager/status.log
   ```

2. **Busy Hook**: Visual indicator only
   ```bash
   noti -t "Claude Code" -m "Working..." || true
   ```

3. **Waiting Input Hook**: Urgent notification with sound
   ```bash
   noti -t "Claude Code - Action Required" -m "Needs your input in $CCMANAGER_WORKTREE" && afplay /System/Library/Sounds/Ping.aiff
   ```

This setup ensures you're notified when Claude needs attention without being overwhelmed by status updates.

## Troubleshooting

- Ensure noti is in your PATH
- Test commands in terminal first before adding to CCManager
- Check CCManager logs if hooks aren't firing
- Remember that hooks run in the worktree directory context

## Environment Variables Reference

- `CCMANAGER_OLD_STATE`: Previous state (idle, busy, waiting_input)
- `CCMANAGER_NEW_STATE`: New state (idle, busy, waiting_input)
- `CCMANAGER_WORKTREE`: Path to the worktree where status changed
- `CCMANAGER_WORKTREE_BRANCH`: Git branch name of the worktree
- `CCMANAGER_SESSION_ID`: Unique session identifier