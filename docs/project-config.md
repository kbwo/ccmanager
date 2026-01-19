# Per-Project Configuration Guide

## Overview

CCManager supports per-project configuration files that allow you to customize settings for individual projects. Project configurations are automatically merged with global settings, with project settings taking priority.

## How It Works

1. **Project config location**: Place a `.ccmanager.json` file in the git repository root
2. **Merge behavior**: Project config is merged with the global config (`~/.config/ccmanager/config.json`)
3. **Priority**: Project settings always take precedence over global settings

## Configuration Methods

You can configure project settings in two ways:

1. **Through the UI**: Select **Project Configuration** from the main menu
2. **Configuration file**: Directly edit `.ccmanager.json` in your project's git repository root

## Configuration File

Example `.ccmanager.json`:

```json
{
  "command": {
    "name": "gemini",
    "args": []
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

## Limitations

- **Multi-project mode**: Project configuration is not available when running CCManager with the `--multi-project` flag. In multi-project mode, only global configuration is used.
