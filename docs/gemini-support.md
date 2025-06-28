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

## Usage

Once configured, CCManager will automatically use the appropriate state detection strategy when you start a session with that preset. The session states (idle, busy, waiting for input) will be detected based on the CLI tool's output patterns.

### Visual Indicators

The session state is displayed in the worktree list:
- 🟢 **Green**: Idle (ready for input)
- 🟡 **Yellow**: Waiting for user confirmation
- 🔴 **Red**: Busy (processing)

## Technical Details

### Architecture

The state detection system uses a strategy pattern with the following components:

1. **StateDetector Interface**: Defines the contract for state detection
2. **BaseStateDetector**: Provides common functionality for reading terminal output
3. **ClaudeStateDetector**: Implements Claude-specific pattern matching
4. **GeminiStateDetector**: Implements Gemini-specific pattern matching

### Adding New CLI Support

To add support for a new CLI tool:

1. Add the new strategy type to `StateDetectionStrategy` in `types/index.ts`
2. Create a new detector class extending `BaseStateDetector`
3. Implement the `detectState` method with tool-specific patterns
4. Add the new detector to the factory in `createStateDetector`
5. Update the UI to include the new option

### Testing

Each state detector has comprehensive tests to ensure accurate state detection:

```bash
npm test -- src/services/stateDetector.test.ts
```

## Migration Notes

- Existing presets default to the "Claude" detection strategy
- The detection strategy is optional and defaults to "Claude" if not specified
- All existing functionality remains unchanged for Claude Code users

## Troubleshooting

### Incorrect State Detection

If the session state isn't being detected correctly:

1. Verify you've selected the correct detection strategy for your CLI tool
2. Check that the CLI tool is outputting expected patterns
3. Ensure you're using a compatible version of the CLI tool

### Adding Custom Patterns

If your CLI tool uses different patterns, you can:

1. Fork the repository
2. Modify the appropriate state detector
3. Submit a pull request with your changes

## Future Enhancements

- Support for more CLI tools (Copilot CLI, Cody CLI, etc.)
- Customizable pattern matching via configuration
- Auto-detection of CLI tool based on command
- Pattern learning from user corrections