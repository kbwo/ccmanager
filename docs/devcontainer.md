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

### Basic Command

```bash
npx ccmanager --devc-up-command "devcontainer up --workspace-folder ." \
              --devc-exec-command "devcontainer exec --workspace-folder ."
```

### Custom Workspace Paths

```bash
npx ccmanager --devc-up-command "devcontainer up --workspace-folder /path/to/project" \
              --devc-exec-command "devcontainer exec --workspace-folder /path/to/project"
```

### With Additional Options

```bash
npx ccmanager --devc-up-command "devcontainer up --workspace-folder . --config .devcontainer/alternate.json" \
              --devc-exec-command "devcontainer exec --workspace-folder . --user vscode"
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

## Example Devcontainer Configuration

CCManager includes a sample devcontainer configuration optimized for AI assistant usage:

```json
{
  "name": "Claude Code Sandbox",
  "build": {
    "dockerfile": "Dockerfile"
  },
  "runArgs": [
    "--cap-add=NET_ADMIN",
    "--cap-add=NET_RAW"
  ],
  "remoteUser": "node",
  "postCreateCommand": "sudo /usr/local/bin/init-firewall.sh"
}
```

### Key Features

1. **Pre-installed Tools**: Node.js, git, Claude Code, and development utilities
2. **Network Restrictions**: Firewall rules limiting access to:
   - GitHub APIs
   - npm registry
   - Anthropic API endpoints
   - Local host network
3. **Persistent Storage**: Configuration and history preserved across container recreations

## Preset Support

All CCManager preset features work seamlessly with devcontainers:

```bash
# The preset command and args are automatically passed to the container
# If you have a preset "claude-opus" with args ["-m", "claude-3-opus"]
# CCManager will execute:
# devcontainer exec --workspace-folder . -- claude -m claude-3-opus
```

## Troubleshooting

### Container Fails to Start

Check the devcontainer up command output:
```bash
# Test manually
devcontainer up --workspace-folder .
```

### Session Creation Fails

Verify the exec command works:
```bash
# Test manually
devcontainer exec --workspace-folder . -- claude --version
```

### Network Issues in Container

The included devcontainer configuration restricts network access. To modify allowed domains:
1. Edit `.devcontainer/init-firewall.sh`
2. Add domains to the allowed list
3. Rebuild the container

## Best Practices

1. **Consistent Commands**: Use the same devcontainer commands across your team
2. **Version Control**: Include `.devcontainer` configuration in your repository
3. **Resource Limits**: Set appropriate CPU/memory limits in devcontainer.json
4. **Security**: Review and customize network restrictions for your needs

## Integration with CI/CD

The devcontainer integration can be used in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Start devcontainer
  run: devcontainer up --workspace-folder .

- name: Run CCManager session
  run: |
    npx ccmanager --devc-up-command "devcontainer up --workspace-folder ." \
                  --devc-exec-command "devcontainer exec --workspace-folder ." \
                  --auto-approve # hypothetical flag for CI
```