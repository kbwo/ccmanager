# CCManager Auto-pilot - Feature Overview

## ✈️ What is Auto-pilot?

Auto-pilot is an intelligent LLM-based watchdog that monitors Claude Code sessions in real-time and provides helpful guidance when Claude gets stuck, makes mistakes, or goes off-track.

## 🎯 Core Concept

**Simple LLM Watchdog**: 
- Watches Claude Code PTY output continuously
- Uses LLM analysis to detect when Claude needs help
- Sends brief, actionable guidance directly to Claude's terminal
- Can be toggled on/off instantly with a single keystroke

## 🚀 User Experience

### Activation
- Press `'p'` (for pilot) in any CCManager session
- Status changes to: `✈️ Auto-pilot: ACTIVE`
- Auto-pilot begins monitoring Claude Code output

### Monitoring
- Auto-pilot analyzes Claude's output every few seconds
- Looks for patterns like repetitive behavior, errors, or confusion
- Uses LLM intelligence for complex situation analysis

### Guidance
- When Claude needs help, auto-pilot provides brief guidance:
  ```
  ✈️ Auto-pilot: Try breaking this into smaller steps
  ```
- Guidance appears directly in Claude Code terminal
- Maximum 2-3 guidances per hour to avoid being annoying

### Status Display
```
┌─ Session: feature-auth-fix ─────────────────────────┐
│ ✈️ Auto-pilot: ACTIVE • 2 guidances provided       │
│                                                     │
│ [Claude Code output...]                             │
└─────────────────────────────────────────────────────┘
```

## 🧠 Intelligence Levels

### Level 1: Pattern Recognition (Fast)
- Detects repetitive behavior
- Spots obvious errors being ignored
- Identifies debug code left in place
- Recognizes when Claude is overthinking

### Level 2: LLM Analysis (Smart)
- Understands project context (React app, Node.js API, etc.)
- Provides framework-specific guidance
- Considers recent file changes and git status
- Adapts tone and suggestions to project type

## 🎮 User Controls

### Toggle
- **Activate**: Press `'p'` → Auto-pilot becomes ACTIVE
- **Deactivate**: Press `'p'` again → Auto-pilot goes to STANDBY

### Settings
- **Model Selection**: GPT-4 or Claude-3-Sonnet
- **Guidance Frequency**: How often auto-pilot can intervene
- **Context Awareness**: Enable project-specific guidance
- **Intervention Patterns**: Customize what triggers guidance

## 📊 Benefits

### For Users
- **Reduces frustration** when Claude gets stuck in loops
- **Catches errors early** before they compound
- **Keeps sessions productive** with gentle nudges
- **Learns project patterns** for better guidance over time

### For Development Flow
- **Maintains momentum** in coding sessions
- **Reduces need for manual intervention** 
- **Provides context-aware suggestions**
- **Works seamlessly** within existing CCManager workflow

## 🛠 Technical Approach

### Simple Integration
- Minimal changes to existing CCManager codebase
- Leverages existing PTY monitoring infrastructure
- Direct LLM API calls for analysis
- No external dependencies or services

### Lightweight Implementation
- Uses existing session management
- Builds on current keyboard shortcut system
- Integrates with settings service
- Maintains CCManager's TUI design patterns

---

**Next**: See `01-implementation-plan.md` for detailed implementation steps.