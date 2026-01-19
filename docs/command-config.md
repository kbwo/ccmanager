# Command Configuration Guide

## Overview

CCManager allows you to configure the command used to run code sessions, including arguments and fallback options. This is useful when you need to pass specific flags to Claude Code or have different configurations for different scenarios.

While the command itself can be changed for future compatibility with other tools like Codex, **we strongly recommend keeping the default `claude` command** as CCManager is specifically optimized for Claude Code's behavior and output patterns.

## Configuration Options

### Command
The main command to execute (default: `claude`)

### Arguments
Arguments to pass to the command. These are the primary arguments that will be tried first.

### Fallback Arguments
Alternative arguments to use if the command fails with the main arguments. This provides a safety net to ensure sessions can still be created even if the primary configuration doesn't work. We recommend not passing arguments that may cause errors as fallback arguments. The fallback should be a safe, minimal configuration that reliably starts the session

## Configuration Examples

### Basic Resume Configuration

Configure CCManager to use the `--resume` flag with automatic fallback:

1. Run `ccmanager`
2. Navigate to **Global Configuration** → **Configure Command Presets**
3. Set up the following:

**Command:** `claude`
**Arguments:** `--resume`
**Fallback Arguments:** (leave empty)

This configuration will:
- First try: `claude --resume`
- If that fails: `claude` (with no arguments)

### Multiple Arguments Configuration

**Command:** `claude`
**Arguments:** `--resume --model opus`
**Fallback Arguments:** `--model opus`

This configuration will:
- First try: `claude --resume --model opus`
- If that fails: `claude --model opus`

### Custom Command Configuration

While CCManager supports using different commands for future compatibility with tools like Codex or other command-line interfaces, **we recommend keeping the default `claude` command** for the best experience.

The ability to change the command is primarily intended for:
- Future support for alternative tools (e.g., Codex)
- Development and testing purposes
- Custom wrapper scripts around the main command

Example of custom command (not recommended for general use):

**Command:** `my-custom-wrapper`
**Arguments:** `--config /path/to/config`
**Fallback Arguments:** `--default-config`

**Note:** Changing from `claude` may result in unexpected behavior as CCManager is optimized for Claude Code's specific output patterns and behaviors.

## Configuration File

The command configuration is stored in the CCManager config file:

**Linux/macOS:** `~/.config/ccmanager/config.json`
**Windows:** `%APPDATA%\ccmanager\config.json`

Example configuration:
```json
{
  "command": {
    "command": "claude",
    "args": ["--resume", "--model", "opus"],
    "fallbackArgs": ["--model", "opus"]
  }
}
```
