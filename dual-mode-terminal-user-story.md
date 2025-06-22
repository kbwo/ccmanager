# User Story: Dual-Mode Terminal Feature

## User Story Statement

**As a** developer using CCManager to manage Claude Code sessions across multiple Git worktrees  
**I want** to switch between Claude Code and Bash terminal modes within the same session context  
**So that** I can run command-line tools (git, npm, tests, build scripts) without losing my Claude Code session context or switching to external terminal windows.

## Background & Context

CCManager currently provides isolated Claude Code sessions for each Git worktree, allowing developers to work on different branches simultaneously. However, developers frequently need to run command-line tools within the same worktree context (git operations, npm commands, running tests, etc.) and currently must use external terminal windows, losing the integrated workflow.

## Acceptance Criteria

### Core Functionality
1. **Mode Switching**
   - [ ] User can press `Ctrl+T` to toggle between Claude Code mode and Bash mode
   - [ ] Mode switching works in both directions (Claude→Bash, Bash→Claude)
   - [ ] Mode switching is instantaneous with no lag or visual glitches
   - [ ] Current mode is clearly indicated in the terminal interface

2. **Terminal Behavior**
   - [ ] In Claude Code mode, all input is routed to the Claude Code PTY process
   - [ ] In Bash mode, all input is routed to the Bash PTY process
   - [ ] Both modes maintain full terminal functionality (colors, cursor movement, etc.)
   - [ ] Terminal resize events are handled properly for both PTY instances

3. **Visual Indicators**
   - [ ] Status line or indicator shows current mode: "Claude" or "Bash"
   - [ ] Mode switch shortcut (Ctrl+T) is displayed in the status indicator
   - [ ] Visual differentiation between modes (e.g., different colored status line)

4. **Session Management**
   - [ ] Bash PTY is created on-demand when first switching to Bash mode
   - [ ] Bash PTY inherits the same working directory as the worktree
   - [ ] Both PTY instances are properly cleaned up when session ends
   - [ ] Mode state persists during session but resets to Claude mode on new sessions

### Integration Requirements
5. **Existing Shortcuts Preserved**
   - [ ] `Ctrl+E` (return to menu) works in both modes
   - [ ] All existing session management shortcuts remain functional
   - [ ] New `Ctrl+T` shortcut is configurable via shortcuts configuration

6. **State Management**
   - [ ] Session state detection continues to work for Claude Code mode
   - [ ] Bash mode shows appropriate status (always "idle" or separate bash state)
   - [ ] Mode switching doesn't interfere with Claude Code state detection

7. **Backward Compatibility**
   - [ ] No breaking changes to existing session behavior
   - [ ] Sessions without dual-mode continue to work identically
   - [ ] Configuration remains backward compatible

## Technical Implementation Details

### Architecture Changes

#### Session Type Extension
```typescript
// Add to src/types/index.ts
export type TerminalMode = 'claude' | 'bash';

export interface Session {
  // ... existing properties
  bashProcess?: IPty;           // Bash PTY instance (created on-demand)
  currentMode: TerminalMode;    // Current active mode
  bashHistory?: Buffer[];       // Bash output history for restoration
}
```

#### Session.tsx Component Updates
```typescript
// Add state management for dual-mode
const [currentMode, setCurrentMode] = useState<TerminalMode>('claude');
const [bashProcess, setBashProcess] = useState<IPty | null>(null);

// Enhanced input handler
const handleStdinData = (data: string) => {
  // Check for mode switch shortcut (Ctrl+T)
  if (data === '\x14') { // Ctrl+T
    toggleMode();
    return;
  }
  
  // Route input to appropriate PTY
  if (currentMode === 'claude') {
    session.process.write(data);
  } else {
    bashProcess?.write(data);
  }
};

// Mode switching logic
const toggleMode = () => {
  if (currentMode === 'claude') {
    // Switch to bash mode
    if (!bashProcess) {
      createBashProcess();
    }
    setCurrentMode('bash');
    displayModeIndicator('bash');
  } else {
    // Switch to claude mode
    setCurrentMode('claude');
    displayModeIndicator('claude');
  }
};
```

#### PTY Management
```typescript
// Bash PTY creation (on-demand)
const createBashProcess = () => {
  const bashPty = spawn('/bin/bash', [], {
    name: 'xterm-color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    cwd: session.worktreePath,
    env: process.env,
  });
  
  // Set up data handlers for bash PTY
  bashPty.onData((data: string) => {
    if (currentMode === 'bash') {
      stdout.write(data);
    }
    // Store bash history for session restoration
    storeBashHistory(data);
  });
  
  setBashProcess(bashPty);
};
```

#### Status Indicator
```typescript
// Visual mode indicator
const displayModeIndicator = (mode: TerminalMode) => {
  const indicator = mode === 'claude' 
    ? '\x1b[44m Claude \x1b[0m \x1b[90m(Ctrl+T: Bash)\x1b[0m'
    : '\x1b[42m Bash \x1b[0m \x1b[90m(Ctrl+T: Claude)\x1b[0m';
  
  // Display in status line (top or bottom of terminal)
  stdout.write(`\x1b[s\x1b[1;1H${indicator}\x1b[u`);
};
```

### Resource Management
- Bash PTY created only when needed (lazy initialization)
- Both PTY instances cleaned up in session cleanup
- Memory-efficient history management for both modes
- Proper resize handling for both PTY instances

### Configuration Integration
- Add `toggleMode` shortcut to ShortcutConfig with default `Ctrl+T`
- Maintain existing shortcut configuration system
- Allow customization via shortcuts.json configuration

## Definition of Done

### Code Quality
- [ ] All TypeScript types properly defined with no `any` usage
- [ ] Code follows existing project patterns and conventions
- [ ] Error handling implemented for PTY creation and management
- [ ] Memory leaks prevented with proper cleanup logic
- [ ] Code coverage maintained at current levels

### Testing
- [ ] Unit tests for mode switching logic
- [ ] Integration tests for PTY management
- [ ] Manual testing across different terminal environments
- [ ] Performance testing for mode switching speed
- [ ] Memory usage testing for dual PTY instances

### Documentation
- [ ] Update README with new feature description
- [ ] Add configuration examples for dual-mode shortcuts
- [ ] Update CLAUDE.md with architecture changes
- [ ] Add troubleshooting guide for dual-mode issues

### User Experience
- [ ] Mode switching feels instantaneous (< 100ms)
- [ ] Visual indicators are clear and non-intrusive
- [ ] Feature works consistently across macOS, Linux, and Windows
- [ ] No regression in existing session performance

## Testing Scenarios

### Happy Path Testing
1. **Basic Mode Switching**
   - Start Claude Code session
   - Press Ctrl+T to switch to Bash
   - Verify Bash prompt appears and commands work
   - Press Ctrl+T to switch back to Claude
   - Verify Claude session is restored properly

2. **Command Execution in Both Modes**
   - In Claude mode: Execute Claude Code commands
   - Switch to Bash mode: Run `git status`, `npm test`, `ls -la`
   - Switch back to Claude: Continue Claude Code conversation
   - Verify both modes maintain their context

3. **Session Lifecycle**
   - Create new session (starts in Claude mode)
   - Switch to Bash mode (creates Bash PTY)
   - Return to menu and re-enter session
   - Verify session restoration for both modes

### Edge Case Testing
4. **Resource Management**
   - Create multiple sessions with dual-mode usage
   - Monitor memory usage and PTY cleanup
   - Force session termination and verify cleanup

5. **Terminal Resize Handling**
   - Resize terminal window in Claude mode
   - Switch to Bash mode, verify proper display
   - Resize again in Bash mode
   - Switch back to Claude, verify no visual artifacts

6. **Rapid Mode Switching**
   - Rapidly press Ctrl+T multiple times
   - Verify mode switching remains stable
   - Check for memory leaks or orphaned processes

### Error Scenarios
7. **Bash PTY Creation Failure**
   - Simulate bash unavailable or permission denied
   - Verify graceful fallback or error message
   - Ensure Claude mode remains functional

8. **Existing Shortcut Conflicts**
   - Test with custom shortcut configurations
   - Verify Ctrl+T can be remapped
   - Test with conflicting shortcut definitions

## Success Metrics

- **Performance**: Mode switching completes in < 100ms
- **Stability**: No crashes or memory leaks during extended usage
- **Usability**: Users can complete common CLI tasks without leaving sessions
- **Adoption**: Feature usage tracked via telemetry (if available)

## Future Enhancements (Out of Scope)

- Multiple terminal tabs/panes within single session
- Custom shell selection (zsh, fish, etc.)
- Terminal multiplexer integration (tmux, screen)
- Session recording/playback for both modes
- Split-screen view showing both modes simultaneously

---

**Implementation Size Estimate**: ~40 lines of code changes to Session.tsx component  
**Risk Level**: Low - Minimal changes to existing architecture  
**Breaking Changes**: None - Fully backward compatible