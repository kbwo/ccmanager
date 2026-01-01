# Per-Project Configuration

CCManager supports per-project configuration through `.ccmanager.json` files placed in your git repository root. This allows teams to define repository-specific defaults for hooks, worktree settings, and other configurations while maintaining personal global settings.

## Overview

CCManager uses a two-tier configuration system:

1. **Global Configuration**: Stored in `~/.config/ccmanager/config.json` (Linux/macOS) or `%APPDATA%\ccmanager\config.json` (Windows)
2. **Project Configuration**: Stored in `.ccmanager.json` at the root of each git repository

When both exist, project settings override global settings on a per-field basis, allowing fine-grained control over which settings are customized per-project.

## Configuration File Location

Place `.ccmanager.json` in the **root directory of your git repository** (the same directory as `.git/`):

```
my-project/
├── .git/
├── .ccmanager.json    ← Project config here
├── src/
└── package.json
```

CCManager automatically detects the git repository root and loads the project configuration when working with worktrees.

## Configuration Structure

The `.ccmanager.json` file uses the same structure as the global config. You can override any of the following sections:

- **shortcuts**: Keyboard shortcuts for UI navigation
- **worktree**: Worktree creation defaults
- **worktreeHooks**: Hooks for worktree lifecycle events
- **statusHooks**: Hooks for session state changes
- **command**: Default command configuration
- **commandPresets**: Command presets
- **autoApproval**: Auto-approval settings

## Merge Behavior

Project configuration **merges** with global configuration using these rules:

### Simple Fields (Complete Override)
Fields like `shortcuts` and `command` are completely replaced when present in project config:

```json
// Global: ~/.config/ccmanager/config.json
{
  "command": {
    "command": "claude",
    "args": ["--global"]
  }
}

// Project: .ccmanager.json
{
  "command": {
    "command": "claude-dev",
    "args": ["--project"]
  }
}

// Result: Uses project command completely
{
  "command": {
    "command": "claude-dev",
    "args": ["--project"]
  }
}
```

### Nested Objects (Property-Level Merge)
Fields like `worktree`, `autoApproval`, `statusHooks`, and `worktreeHooks` merge at the property level:

```json
// Global config
{
  "worktree": {
    "autoDirectory": false,
    "copySessionData": true,
    "sortByLastSession": false
  },
  "worktreeHooks": {
    "post_creation": {
      "command": "echo 'global'",
      "enabled": true
    }
  }
}

// Project config
{
  "worktree": {
    "autoDirectory": true
    // Other fields not specified - use global
  },
  "worktreeHooks": {
    "post_creation": {
      "command": "npm install",
      "enabled": true
    }
  }
}

// Merged result
{
  "worktree": {
    "autoDirectory": true,        // From project
    "copySessionData": true,       // From global
    "sortByLastSession": false     // From global
  },
  "worktreeHooks": {
    "post_creation": {
      "command": "npm install",    // From project
      "enabled": true
    }
  }
}
```

## Common Use Cases

### 1. Project-Specific Post-Creation Hook

Automatically install dependencies when creating worktrees for a Node.js project:

```json
{
  "worktreeHooks": {
    "post_creation": {
      "command": "npm install",
      "enabled": true
    }
  }
}
```

For a Python project:

```json
{
  "worktreeHooks": {
    "post_creation": {
      "command": "python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt",
      "enabled": true
    }
  }
}
```

### 2. Enable Auto-Directory for Specific Projects

Automatically generate worktree directory names based on branch names:

```json
{
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "worktrees/{branch}"
  }
}
```

### 3. Project-Specific Status Hooks

Set up notifications for specific projects:

```json
{
  "statusHooks": {
    "waiting_input": {
      "command": "terminal-notifier -title 'My Project' -message 'Input needed'",
      "enabled": true
    }
  }
}
```

### 4. Disable Session Data Copying

For security-sensitive projects, disable automatic copying of Claude session data:

```json
{
  "worktree": {
    "copySessionData": false
  }
}
```

### 5. Custom Auto-Approval Verification

Use project-specific verification logic for auto-approval:

```json
{
  "autoApproval": {
    "enabled": true,
    "customCommand": "./scripts/verify-changes.sh",
    "timeout": 60
  }
}
```

## Security Considerations

**⚠️ Important Security Warning**

Project configuration files can execute **arbitrary commands** through hooks when users work with worktrees. This is similar to `.github/workflows` files or npm `postinstall` scripts.

### Security Best Practices

1. **Review before trusting**: Always review `.ccmanager.json` in repositories you clone, especially from untrusted sources
2. **Inspect hooks**: Check `worktreeHooks.post_creation` and `statusHooks` for potentially malicious commands
3. **Use .gitignore for sensitive configs**: Don't commit configs that contain secrets or machine-specific paths
4. **Team repositories**: Only commit hooks that the entire team needs and has reviewed
5. **Disable hooks temporarily**: If unsure, you can temporarily disable hooks in the UI (Configuration → Configure Worktree Hooks)

### Example Security Review

Before running operations in a new repository:

```bash
# Check if .ccmanager.json exists
cat .ccmanager.json

# Look for suspicious commands in hooks
grep -A 5 "post_creation" .ccmanager.json
```

**What to watch for:**
- Commands that download and execute scripts (`curl | bash`)
- Commands that access sensitive data or credentials
- Commands that make network requests to unknown hosts
- Overly complex or obfuscated shell commands

If you're unsure about a hook command, ask the repository maintainer or disable hooks before creating worktrees.

## Version Control Considerations

### Should You Commit `.ccmanager.json`?

This depends on your team's needs:

**Commit it when:**
- Your team wants shared defaults for the project
- Hooks are essential for the project workflow (e.g., `npm install`)
- You want consistent worktree configuration across all developers

**Add to `.gitignore` when:**
- Configuration is personal preference
- Settings contain machine-specific paths or credentials
- Different team members need different configurations

### Example `.gitignore` Entry

```gitignore
# CCManager project config (if you don't want to commit it)
.ccmanager.json
```

### Committed Example

Many teams find it useful to commit a basic `.ccmanager.json` with sensible defaults:

```json
{
  "worktreeHooks": {
    "post_creation": {
      "command": "npm install && npm run build",
      "enabled": true
    }
  },
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "../{branch}"
  }
}
```

Then individual developers can override this in their global config if needed.

## Configuration Examples

### Minimal Project Config

```json
{
  "worktreeHooks": {
    "post_creation": {
      "command": "make setup",
      "enabled": true
    }
  }
}
```

### Comprehensive Project Config

```json
{
  "worktree": {
    "autoDirectory": true,
    "autoDirectoryPattern": "worktrees/{branch}",
    "copySessionData": false,
    "sortByLastSession": true
  },
  "worktreeHooks": {
    "post_creation": {
      "command": "npm ci && npm run build",
      "enabled": true
    }
  },
  "statusHooks": {
    "waiting_input": {
      "command": "osascript -e 'display notification \"Input needed in CCManager\" with title \"Claude Code\"'",
      "enabled": true
    },
    "idle": {
      "command": "echo \"Session idle: $(date)\" >> ~/.ccmanager-activity.log",
      "enabled": true
    }
  },
  "autoApproval": {
    "enabled": true,
    "customCommand": "./scripts/verify-safe.sh",
    "timeout": 45
  }
}
```

## Troubleshooting

### Configuration Not Loading

1. **Verify file location**: The `.ccmanager.json` must be at the git repository root (same level as `.git/`)
2. **Check JSON syntax**: Use a JSON validator to ensure the file is valid JSON
3. **Check file permissions**: Ensure the file is readable
4. **Check logs**: Invalid configs are logged with warnings but won't break CCManager

### How to Test Configuration

1. Create a minimal `.ccmanager.json` in your repo:
   ```json
   {
     "worktree": {
       "autoDirectory": true
     }
   }
   ```

2. Run CCManager and create a worktree
3. Check that the project setting is being used (directory should be auto-generated)

### Debugging Merge Behavior

To understand what configuration is being used:

1. Check global config: `cat ~/.config/ccmanager/config.json`
2. Check project config: `cat .ccmanager.json`
3. Remember: Project properties override global properties, but unspecified properties fall back to global

## Cache Behavior

Project configurations are cached by git repository root path for performance. The cache automatically invalidates when:

- The `.ccmanager.json` file is modified (detected via mtime)
- You manually clear the cache (rare)

This means configuration changes take effect immediately - just save `.ccmanager.json` and the next operation will use the new settings.

## Related Documentation

- [Worktree Hooks](./worktree-hooks.md) - Details on worktree lifecycle hooks
- [Status Hooks](./status-hooks.md) - Details on session state hooks
- [Command Configuration](./command-config.md) - Details on command presets
- [Worktree Auto-Directory](./worktree-auto-directory.md) - Details on automatic directory generation

## Best Practices

1. **Start minimal**: Only override what you need to change
2. **Document hooks**: Add comments (in commit messages or README) explaining what project hooks do
3. **Test hooks**: Verify post-creation hooks work before committing
4. **Consider teammates**: If committing config, make sure hooks work across platforms
5. **Use relative paths**: In hook commands, use relative paths when possible for portability
6. **Validate JSON**: Always validate JSON syntax before committing

## Schema Reference

For a complete schema of all available configuration options, see [Configuration Schema](./configuration-schema.md).
