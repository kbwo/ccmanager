# Per-Project Configuration Guide

## Overview

CCManager supports per-project configuration files that allow you to customize settings for individual projects. Project configurations are automatically merged with global settings, with project settings taking priority.

## How It Works

1. **Project config location**: Place a `.ccmanager.json` file in the git repository root
2. **Merge behavior**: Project config is merged with the global config (`~/.config/ccmanager/config.json`)
3. **Priority**: Project settings always take precedence over global settings

## Configuration Methods

You can configure project settings in three ways:

1. **Through the UI**: Select **Project Configuration** from the main menu
2. **Configuration file**: Directly edit `.ccmanager.json` in your project's git repository root
3. **With an AI coding agent**: install the [`ccmanager-config` skill](../plugins/ccmanager-config/README.md), which teaches Claude Code or Codex the full configuration schema and ships a validator

## Configuration File

Example `.ccmanager.json`:

```json
{
  "commandPresets": {
    "presets": [
      {
        "id": "gemini",
        "name": "Gemini",
        "command": "gemini",
        "detectionStrategy": "gemini"
      }
    ],
    "defaultPresetId": "gemini"
  },
  "shortcuts": {
    "returnToMenu": {
      "ctrl": true,
      "key": "e"
    }
  }
}
```

All options available in the global config can be used in the project config.

Note that CCManager reports nothing when a config file is wrong: a file that is not valid JSON is discarded whole, and unrecognized keys are ignored silently. To check a file before wondering why a setting has no effect:

```bash
node plugins/ccmanager-config/skills/ccmanager-config/scripts/validate-ccmanager-config.mjs .ccmanager.json
```

## Limitations

- **Multi-project mode**: Project configuration is not available when running CCManager with the `--multi-project` flag. In multi-project mode, only global configuration is used.
