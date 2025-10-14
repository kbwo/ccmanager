# Product Overview

## Product Description

CCManager is a Terminal User Interface (TUI) application that enables developers to manage multiple AI coding assistant sessions across Git worktrees and projects. It provides a unified interface for running Claude Code, Gemini CLI, and other AI coding assistants in parallel, allowing seamless context switching between different branches and repositories.

## Core Features

- **Multi-Session Management**: Run multiple AI assistant sessions simultaneously across different Git worktrees
- **Multi-Project Support**: Manage multiple git repositories from a single interface with automatic project discovery
- **Worktree Operations**: Create, delete, and merge Git worktrees directly from the TUI
- **Real-time Session Monitoring**: Visual indicators showing session states (idle, busy, waiting for input)
- **Session Data Copying**: Transfer Claude Code conversation history and context between worktrees
- **Devcontainer Integration**: Run AI sessions inside containers while managing from the host machine
- **Git Status Visualization**: Real-time display of file changes, commits ahead/behind parent branch
- **Configurable Keyboard Shortcuts**: Customize navigation and actions via UI or JSON configuration
- **Command Presets**: Pre-configured commands with automatic fallback support for different AI assistants
- **Status Change Hooks**: Execute custom commands when session states change (for notifications, logging, etc.)
- **Worktree Hooks**: Automate environment setup when creating new worktrees
- **Vi-like Search**: Fast filtering of projects and worktrees with `/` key

## Target Use Cases

### Primary Use Case: Parallel Development with AI Assistance
Developers working on multiple features or bug fixes simultaneously can maintain separate Claude Code sessions for each worktree, preserving context and conversation history per branch.

### Key Scenarios:
- **Feature Development**: Create feature branches with copied session data to maintain project context
- **Code Review**: Compare implementations across worktrees with dedicated AI sessions
- **Experimentation**: Test different approaches in isolated worktrees with fresh AI contexts
- **Multi-Repository Workflows**: Navigate between different projects while keeping all AI sessions active
- **Sandboxed Development**: Use devcontainer integration for secure AI-assisted coding with network restrictions

## Key Value Propositions

### vs. Claude Squad
- **No tmux dependency**: Self-contained solution that works out of the box
- **Real-time session monitoring**: Immediate visibility into which sessions need attention (waiting/busy/idle)
- **Simple interface**: Minimal learning curve with intuitive navigation
- **Safety-first**: Preserves Claude Code's built-in security confirmations

### Unique Benefits
- **Context Preservation**: Maintain long-running AI conversations across branch switches
- **Parallel Productivity**: Work on multiple tasks simultaneously with dedicated AI assistance per task
- **Integrated Workflow**: Git worktree management and AI sessions in one tool
- **Flexible AI Support**: Works with Claude Code, Gemini CLI, and custom AI assistants through configurable detection strategies
- **Automation Ready**: Hooks system enables integration with notification tools, time tracking, and custom workflows

## Supported AI Assistants

- **Claude Code** (Default): Full support with built-in state detection
- **Gemini CLI**: Custom patterns for Gemini's confirmation prompts
- **Extensible**: State detection strategy pattern allows adding new AI assistants
