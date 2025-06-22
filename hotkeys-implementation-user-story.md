# User Story: Implement Comprehensive Hotkeys Across All CCManager Menus

## Story Overview

**As a** CCManager user  
**I want** consistent hotkey support across all menu interfaces  
**So that** I can navigate efficiently without using arrow keys and Enter for every action

## Background

CCManager currently has partial hotkey implementation with only basic cancel/return functionality in some components. Users must rely on arrow key navigation and Enter selection for all menu interactions, which slows down workflow efficiency. This story implements comprehensive hotkey support across all 6 menu components.

## Acceptance Criteria

### 1. Main Menu Component (`Menu.tsx`)
- **AC1.1**: Press `N` to navigate directly to "New Worktree" 
- **AC1.2**: Press `M` to navigate directly to "Merge Worktree"
- **AC1.3**: Press `D` to navigate directly to "Delete Worktree" 
- **AC1.4**: Press `C` to navigate directly to "Configuration"
- **AC1.5**: Press `Q` or `X` to exit the application
- **AC1.6**: Press `R` to refresh the worktree list
- **AC1.7**: Display hotkey hints at bottom of menu: "Hotkeys: N-New M-Merge D-Delete C-Config Q-Quit R-Refresh"
- **AC1.8**: Hotkeys work when focus is on any menu item
- **AC1.9**: Original arrow key navigation remains functional

### 2. Configuration Menu Component (`Configuration.tsx`)
- **AC2.1**: Press `S` to navigate directly to "Configure Shortcuts"
- **AC2.2**: Press `H` to navigate directly to "Configure Status Hooks"  
- **AC2.3**: Press `W` to navigate directly to "Configure Worktree Settings"
- **AC2.4**: Press `C` to navigate directly to "Configure Command"
- **AC2.5**: Press `B` or `Escape` to return to main menu
- **AC2.6**: Display hotkey hints: "Hotkeys: S-Shortcuts H-Hooks W-Worktree C-Command B-Back"
- **AC2.7**: Hotkeys work when focus is on any menu item

### 3. New Worktree Component (`NewWorktree.tsx`)
- **AC3.1**: Press `Escape` to cancel (already implemented)
- **AC3.2**: Press `Ctrl+N` to start with next step (skip current field if valid)
- **AC3.3**: Press `Ctrl+B` to go back to previous step (when applicable)
- **AC3.4**: Press `Tab` to auto-complete branch name suggestions (when in branch field)
- **AC3.5**: Display hotkey hints: "Hotkeys: Esc-Cancel Ctrl+N-Next Ctrl+B-Back Tab-Autocomplete"
- **AC3.6**: Hotkeys work in all input steps (path, branch, base-branch selection)

### 4. Delete Worktree Component (`DeleteWorktree.tsx`)
- **AC4.1**: Press `Escape` to cancel and return to main menu
- **AC4.2**: Press `Ctrl+D` to proceed with deletion (skip selection step)
- **AC4.3**: Press `F` to toggle force deletion option
- **AC4.4**: Press `Enter` to confirm selected worktree for deletion
- **AC4.5**: Display hotkey hints: "Hotkeys: Esc-Cancel Ctrl+D-Delete F-Force Enter-Confirm"
- **AC4.6**: Hotkeys work when focus is on worktree selection

### 5. Merge Worktree Component (`MergeWorktree.tsx`)
- **AC5.1**: Press `Escape` to cancel and return to main menu
- **AC5.2**: Press `Ctrl+M` to proceed with merge (skip selection step)
- **AC5.3**: Press `Enter` to confirm selected worktree for merge
- **AC5.4**: Press `T` to cycle through target branch options
- **AC5.5**: Display hotkey hints: "Hotkeys: Esc-Cancel Ctrl+M-Merge T-Target Enter-Confirm"
- **AC5.6**: Hotkeys work when focus is on worktree selection

### 6. Confirmation Dialog Component (`Confirmation.tsx`)
- **AC6.1**: Press `Y` to confirm action
- **AC6.2**: Press `N` or `Escape` to cancel action
- **AC6.3**: Press `Enter` to select highlighted option
- **AC6.4**: Display hotkey hints: "Hotkeys: Y-Yes N/Esc-No Enter-Select"
- **AC6.5**: Hotkeys work regardless of current selection focus

## Technical Implementation Guide

### Architecture Overview
- **Risk Level**: Low - Adding useInput hooks to existing components
- **Estimated Time**: 2-3 hours development
- **Dependencies**: Existing shortcutManager service, ink useInput hook
- **Files Modified**: 6 React components, no new files required

### Implementation Approach

#### 1. Component Modification Pattern
Each component should follow this pattern:
```tsx
import { useInput } from 'ink';

const Component: React.FC<Props> = ({ ...props }) => {
  // Existing state and logic...

  useInput((input, key) => {
    // Handle component-specific hotkeys
    const keyPressed = input.toLowerCase();
    
    switch (keyPressed) {
      case 'n':
        // Handle N key action
        break;
      case 'escape':
        // Handle escape key
        break;
      // ... other hotkey handlers
    }
  });

  // Add hotkey hint display in render
  return (
    <Box flexDirection="column">
      {/* Existing component content */}
      
      <Box marginTop={1}>
        <Text dimColor>
          Hotkeys: N-New M-Merge D-Delete C-Config Q-Quit R-Refresh
        </Text>
      </Box>
    </Box>
  );
};
```

#### 2. ShortcutManager Integration
- Leverage existing `shortcutManager.matchesShortcut()` for Escape and Ctrl combinations
- Use direct key matching for single-letter hotkeys
- Maintain backward compatibility with existing shortcuts

#### 3. Component-Specific Implementation Details

**Menu.tsx**:
```tsx
useInput((input, key) => {
  const keyPressed = input.toLowerCase();
  
  switch (keyPressed) {
    case 'n':
      // Trigger new worktree action
      onSelectWorktree({ path: '', branch: '', isMainWorktree: false, hasSession: false });
      break;
    case 'm':
      // Trigger merge worktree action  
      onSelectWorktree({ path: 'MERGE_WORKTREE', branch: '', isMainWorktree: false, hasSession: false });
      break;
    case 'd':
      // Trigger delete worktree action
      onSelectWorktree({ path: 'DELETE_WORKTREE', branch: '', isMainWorktree: false, hasSession: false });
      break;
    case 'c':
      // Trigger configuration action
      onSelectWorktree({ path: 'CONFIGURATION', branch: '', isMainWorktree: false, hasSession: false });
      break;
    case 'q':
    case 'x':
      // Trigger exit action
      onSelectWorktree({ path: 'EXIT_APPLICATION', branch: '', isMainWorktree: false, hasSession: false });
      break;
    case 'r':
      // Trigger refresh - force re-render by updating key or state
      break;
  }
});
```

**Configuration.tsx**:
```tsx
useInput((input, key) => {
  const keyPressed = input.toLowerCase();
  
  switch (keyPressed) {
    case 's':
      setView('shortcuts');
      break;
    case 'h':
      setView('hooks');
      break;
    case 'w':
      setView('worktree');
      break;
    case 'c':
      setView('command');
      break;
    case 'b':
      onComplete();
      break;
  }
  
  if (shortcutManager.matchesShortcut('cancel', input, key)) {
    onComplete();
  }
});
```

**NewWorktree.tsx (enhanced)**:
```tsx
useInput((input, key) => {
  // Existing cancel logic
  if (shortcutManager.matchesShortcut('cancel', input, key)) {
    onCancel();
    return;
  }
  
  // New hotkey logic
  if (key.ctrl && input.toLowerCase() === 'n') {
    // Skip to next step if current input is valid
    if (step === 'path' && path.trim()) {
      setStep('branch');
    } else if (step === 'branch' && branch.trim()) {
      setStep('base-branch');
    }
  }
  
  if (key.ctrl && input.toLowerCase() === 'b') {
    // Go back to previous step
    if (step === 'base-branch') {
      setStep('branch');
    } else if (step === 'branch' && !isAutoDirectory) {
      setStep('path');
    }
  }
});
```

#### 4. Testing Strategy

**Unit Tests** (create test files):
```typescript
// Menu.test.tsx
describe('Menu hotkeys', () => {
  it('should trigger new worktree on N key press', () => {
    // Test implementation
  });
  
  it('should trigger exit on Q key press', () => {
    // Test implementation  
  });
});
```

**Integration Tests**:
- Test hotkey functionality with ink-testing-library
- Verify hotkeys work with different focus states
- Test hotkey conflicts and resolution

**Manual Testing Checklist**:
- [ ] All hotkeys work in each component
- [ ] Hotkey hints display correctly
- [ ] No conflicts between hotkeys
- [ ] Original navigation still works
- [ ] Hotkeys work with different terminal environments
- [ ] Accessibility not impacted

## Definition of Done

### Functional Requirements
- [ ] All 6 components implement specified hotkeys
- [ ] Hotkey hints display in all components
- [ ] All hotkeys tested and working
- [ ] No regression in existing functionality
- [ ] Performance impact negligible

### Code Quality Requirements  
- [ ] Code follows existing patterns and conventions
- [ ] TypeScript types maintained
- [ ] Error handling implemented
- [ ] Unit tests written for new hotkey functionality
- [ ] Integration tests updated

### Documentation Requirements
- [ ] Hotkey mappings documented in component comments
- [ ] User-facing hotkey hints clear and consistent
- [ ] Technical documentation updated if needed

### Deployment Requirements
- [ ] Build succeeds without errors
- [ ] All tests pass
- [ ] Manual testing completed
- [ ] No breaking changes to existing users

## Implementation Priority

1. **Phase 1**: Main Menu hotkeys (highest impact)
2. **Phase 2**: Configuration Menu hotkeys  
3. **Phase 3**: Form component hotkeys (New/Delete/Merge)
4. **Phase 4**: Confirmation dialog hotkeys
5. **Phase 5**: Testing and refinement

## Risk Mitigation

- **Input Conflicts**: Use consistent key mapping strategy
- **Focus Issues**: Test hotkeys work regardless of SelectInput focus
- **Accessibility**: Ensure screen readers can announce hotkeys
- **Terminal Compatibility**: Test across different terminal emulators

## Success Metrics

- **Efficiency**: 50% reduction in keystrokes for common actions
- **User Satisfaction**: Improved workflow speed for power users  
- **Adoption**: Hotkeys used in >70% of user sessions
- **Regression**: Zero breaking changes to existing functionality

---

**Story Points**: 3  
**Epic**: User Experience Improvements  
**Sprint**: Current  
**Assignee**: Ready for developer pickup  
**Labels**: enhancement, ui/ux, hotkeys, low-risk