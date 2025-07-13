# Devcontainer Integration

CCManager supports running AI assistant sessions inside devcontainers while keeping the manager itself on the host machine. This provides isolated development environments with enhanced security while maintaining host-level features like notifications.

## Overview

The devcontainer integration allows you to:
- Run Claude Code or other AI assistants in isolated container environments
- Keep CCManager on the host for status notifications and management
- Use project-specific dependencies and tools without conflicts
- Apply network restrictions for enhanced security

## Prerequisites

- [VS Code Devcontainer CLI](https://code.visualstudio.com/docs/devcontainers/cli) installed on host
- Docker or compatible container runtime
- CCManager installed on the host machine

## Usage

```bash
npx ccmanager --devc-up-command "<your devcontainer up command>" \
              --devc-exec-command "<your devcontainer exec command>"
```

Both arguments accept any valid devcontainer commands with any options or arguments you need. The commands are executed as-is, giving you full flexibility to customize based on your project's requirements.

### Why Full Commands Instead of Just Arguments?

CCManager accepts complete commands (not just arguments) for maximum flexibility:

- **Alternative tools**: Use `mise exec devcontainer up` or other wrapper tools
- **Command variations**: Choose between `devcontainer up` or `devcontainer set-up` based on your needs  
- **Custom workflows**: Integrate with your existing scripts and aliases

If the command length bothers you, simply create a shell alias:
```bash
alias ccm-dev='npx ccmanager --devc-up-command "devcontainer up --workspace-folder ." --devc-exec-command "devcontainer exec --workspace-folder ."'
```

## How It Works

1. **Container Startup**: When you select a worktree, CCManager executes the `--devc-up-command` to ensure the container is running
2. **Session Creation**: The AI assistant command is executed inside the container using `--devc-exec-command`
3. **Command Construction**: CCManager automatically appends the preset command after `--` separator:
   ```
   devcontainer exec --workspace-folder . -- claude -m claude-3-opus
   ```
4. **Host Management**: CCManager remains on the host, managing the PTY session and triggering status hooks

## Benefits

### Security
- **Network Isolation**: Containers can restrict network access to approved domains only
- **Filesystem Isolation**: Each project's dependencies are isolated
- **Reproducible Environments**: Consistent setup across team members

### Functionality
- **Host Notifications**: Status hooks run on host, enabling desktop notifications
- **Performance**: No need to install CCManager in every container
- **Flexibility**: Mix and match different tool versions per project
- **Risk-free Operations**: Safely run commands like `claude --dangerously-skip-permissions` within isolated container environments

## Devcontainer Configuration

For optimal devcontainer setup with Claude Code, refer to Anthropic's official documentation:
[Development containers - Anthropic](https://docs.anthropic.com/en/docs/claude-code/devcontainer)

## Preset Support

All CCManager preset features work seamlessly with devcontainers:

```bash
# The preset command and args are automatically passed to the container
# If you have a preset "claude-opus" with args ["--dangerously-skip-permissions", "-m", "claude-3-opus"]
# CCManager will execute:
devcontainer exec --workspace-folder . -- claude --dangerously-skip-permissions -m claude-3-opus
```

## Troubleshooting

### Container Fails to Start

Test your devcontainer up command manually to ensure it works correctly.

### Session Creation Fails

Verify your devcontainer exec command works by testing it manually with a simple command.
