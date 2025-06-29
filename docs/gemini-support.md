# Gemini CLI Support

CCManager now supports [Gemini CLI](https://github.com/google-gemini/gemini-cli) in addition to Claude Code, allowing you to manage sessions with different AI coding assistants.

## Overview

The new state detection strategy feature allows CCManager to properly track the state of different CLI tools by recognizing their unique output patterns. Each CLI tool has different prompts and status indicators, and CCManager can now adapt to these differences.

## State Detection Strategies

### Claude (Default)

Claude Code uses the following patterns for state detection:

- **Waiting for Input**: 
  - `│ Do you want...`
  - `│ Would you like...`
- **Busy**: 
  - `ESC to interrupt` (case insensitive)
- **Idle**: Any other state

### Gemini

Gemini CLI uses different patterns:

- **Waiting for Input**:
  - `│ Apply this change?`
  - `│ Allow execution?`
  - `│ Do you want to proceed?`
- **Busy**:
  - `esc to cancel` (case insensitive)
- **Idle**: Any other state

## Configuration

### Setting Detection Strategy for a Preset

1. From the main menu, select **"Configure Command Presets"**
2. Choose an existing preset to edit or create a new one
3. When creating/editing a preset, you'll see a **"Detection Strategy"** option
4. Select either **"Claude"** or **"Gemini"** based on the CLI tool you're using

### Example Preset Configuration

```
Name: Gemini Development
Command: gemini
Arguments: --model gemini-pro
Fallback Arguments: (none)
Detection Strategy: Gemini
```