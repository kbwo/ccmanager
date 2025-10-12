# Implementation Plan

## Overview
This implementation plan breaks down the loading spinner feature into incremental tasks following Test-Driven Development (TDD) methodology. Each task builds on previous work, ensuring proper integration and no orphaned code.

## Task Sequence

- [x] 1. Create reusable loading spinner component with animation
- [x] 1.1 Build core LoadingSpinner component with Unicode animation
  - Create LoadingSpinner component accepting message, spinnerType, and color props
  - Implement useEffect-based animation with 120ms interval using Unicode frames (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
  - Implement ASCII fallback animation frames (- \ | /) for limited terminal support
  - Create Box layout with flexDirection="row" containing animated spinner and message text
  - Ensure proper cleanup of animation interval on component unmount
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.1, 8.2, 8.3_

- [x] 1.2 Write comprehensive unit tests for LoadingSpinner component
  - Test component renders with default props and displays message with cyan spinner
  - Test component renders with custom color prop (yellow for devcontainer operations)
  - Test animation frame updates every 120ms using fake timers
  - Test cleanup function clears interval on component unmount to prevent memory leaks
  - Test message text preservation throughout animation lifecycle
  - Test spinner type variations (dots vs line) render correctly
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 2. Enhance existing worktree creation and deletion loading views
- [x] 2.1 Integrate LoadingSpinner into worktree creation view
  - Enhance 'creating-worktree' view rendering to include LoadingSpinner component
  - Implement message composition logic checking copySessionData flag
  - Display "Creating worktree and copying session data..." when session data copy is enabled
  - Display "Creating worktree..." for standard worktree creation
  - Preserve existing view structure and Box/Text component layout
  - Use cyan color for normal worktree creation operations
  - _Requirements: 2.1, 2.2, 2.3, 6.1, 6.3_

- [x] 2.2 Integrate LoadingSpinner into worktree deletion view
  - Enhance 'deleting-worktree' view rendering to include LoadingSpinner component
  - Implement message composition logic checking deleteBranch flag
  - Display "Deleting worktrees and branches..." when branch deletion is enabled
  - Display "Deleting worktrees..." for standard worktree deletion
  - Preserve existing view structure and maintain existing color scheme
  - Ensure spinner persists throughout sequential deletion loop
  - _Requirements: 3.1, 3.2, 3.3, 6.2, 6.3_

- [x] 2.3 Write integration tests for enhanced worktree views
  - Test worktree creation view displays correct message without session data copy
  - Test worktree creation view displays enhanced message with session data copy enabled
  - Test worktree deletion view displays correct message without branch deletion
  - Test worktree deletion view displays enhanced message with branch deletion enabled
  - Test loading state clears properly on successful worktree creation
  - Test loading state clears properly on worktree creation error
  - Test loading state persists throughout multiple sequential worktree deletions
  - Test loading state clears on deletion error and navigates to appropriate error view
  - _Requirements: 2.4, 2.5, 2.6, 2.7, 3.4, 3.5, 3.6, 9.6_

- [x] 3. Add session creation loading states to App component
- [x] 3.1 Extend View union type with new session loading states
  - Add 'creating-session' view state to View union type in App.tsx
  - Add 'creating-session-preset' view state to View union type
  - Update TypeScript compilation to verify exhaustive View handling
  - Ensure no breaking changes to existing View type consumers
  - _Requirements: 6.4, 6.5_

- [x] 3.2 Implement session creation loading view rendering
  - Add 'creating-session' view case to App component rendering logic
  - Implement message composition checking devcontainerConfig presence
  - Display "Starting devcontainer and creating session..." for devcontainer initialization
  - Display "Creating session..." for standard session creation
  - Use yellow color for devcontainer operations to indicate longer duration
  - Use cyan color for standard session creation
  - _Requirements: 1.1, 1.2, 1.3, 4.4_

- [x] 3.3 Implement preset session creation loading view rendering
  - Add 'creating-session-preset' view case to App component rendering logic
  - Display "Creating session with preset..." message for preset selection flow
  - Use appropriate color based on devcontainer configuration if present
  - Ensure consistent layout with other loading views
  - _Requirements: 1.2, 6.4_

- [x] 4. Update session creation handlers with loading state management
- [x] 4.1 Enhance handleSelectWorktree with loading state for session creation
  - Set view to 'creating-session' before calling createSessionWithEffect
  - Ensure loading state is set before awaiting the promise
  - Implement proper state cleanup in success path (navigate to session view)
  - Implement proper state cleanup in error path (display error and return to menu)
  - Use cancellation flag pattern to prevent state updates on unmounted component
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 5.1, 5.3, 5.4, 5.5_

- [x] 4.2 Enhance handlePresetSelected with loading state for preset session creation
  - Set view to 'creating-session-preset' before calling createSessionWithEffect with preset ID
  - Ensure loading state is set before awaiting the promise
  - Implement proper state cleanup in success path (navigate to session view)
  - Implement proper state cleanup in error path (display error and return to menu)
  - Clear selectedWorktree state after operation completes
  - _Requirements: 1.2, 1.4, 1.5, 1.7, 5.1, 5.3, 5.4_

- [x] 4.3 Write integration tests for session creation loading states
  - Test handleSelectWorktree sets 'creating-session' view before async operation
  - Test loading view displays correct message for standard session creation
  - Test loading view displays enhanced message for devcontainer session creation
  - Test loading state clears on successful session creation and navigates to session view
  - Test loading state clears on session creation error and displays error message
  - Test handlePresetSelected sets loading view before async operation with preset ID
  - Test cancellation flag prevents state updates on unmounted component during async operation
  - _Requirements: 1.4, 1.5, 5.5, 9.2, 9.3, 9.4_

- [ ] 5. Implement error handling with loading state cleanup
- [x] 5.1 Ensure Effect-based error handling properly clears loading states
  - Verify all Effect.runPromise calls with Effect.either handle both success and error paths
  - Ensure formatErrorMessage is called for all AppError types during loading operations
  - Verify loading state cleanup occurs in both success and error branches
  - Test ProcessError handling during session creation displays specific error details
  - Test ConfigError handling shows clear configuration-related error messages
  - _Requirements: 5.3, 5.4, 7.1, 7.2, 7.4_

- [x] 5.2 Handle GitError and FileSystemError during loading operations
  - Verify GitError during worktree creation displays command, exit code, and stderr
  - Test ambiguous branch error during worktree creation clears loading and navigates to branch selector
  - Verify FileSystemError displays operation, path, and cause information
  - Ensure error state is preserved and displayed above form for user context
  - Test error handling stops sequential operations on first failure
  - _Requirements: 2.5, 2.6, 7.3, 7.5, 7.6_

- [x] 5.3 Write error handling integration tests for all loading scenarios
  - Test session creation with ProcessError clears loading and displays error message
  - Test worktree creation with GitError clears loading and returns to form with error
  - Test worktree deletion with error on second deletion stops loop and displays specific error
  - Test handleRemoteBranchSelected retry displays loading spinner again during retry
  - Test error display transitions from loading view to error display in one render cycle
  - _Requirements: 1.5, 2.5, 2.6, 3.5, 9.6_

- [ ] 6. Enhance accessibility and user experience
- [x] 6.1 Implement terminal compatibility detection for spinner characters
  - Detect Unicode support in terminal environment
  - Implement graceful fallback to ASCII characters for limited terminal support
  - Test spinner animation on various terminal emulators
  - Verify appropriate frame rate (100-150ms per frame) balances visibility and performance
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 6.2 Enhance loading messages for user clarity
  - Ensure all loading messages are clear, concise, and accurately describe operations
  - Add indication for operations expected to take longer than 5 seconds (devcontainer startup)
  - Test message wrapping and truncation for narrow terminal widths
  - Verify messages remain visible and readable across different terminal sizes
  - _Requirements: 8.4, 8.5, 8.6_

- [ ] 6.3 Verify loading state input handling and cancellation behavior
  - Ensure user input is properly handled during loading state (ESC continues showing spinner)
  - Verify operations cannot be interrupted mid-execution as per requirements
  - Test that conflicting operations are prevented while async operation executes
  - Document that loading continues until operation completes naturally
  - _Requirements: 5.2, 5.6_

- [ ] 7. Write comprehensive end-to-end tests using ink-testing-library
- [ ] 7.1 Test LoadingSpinner visual rendering in terminal
  - Use render() from ink-testing-library to mount LoadingSpinner component
  - Verify findByText locates message text in rendered output
  - Verify spinner character is visible in terminal output
  - Test that animation frames update correctly over time
  - _Requirements: 9.1, 9.5_

- [ ] 7.2 Test complete loading state lifecycle for all async operations
  - Test session creation flow from worktree selection through loading to session view
  - Test worktree creation flow from form submission through loading to menu view
  - Test worktree deletion flow from confirmation through loading to menu view
  - Verify lastFrame() contains spinner character during loading state
  - Verify spinner no longer present in lastFrame() after operation completes
  - _Requirements: 9.2, 9.3, 9.5_

- [ ] 7.3 Test error scenarios with visual verification
  - Render App component with failing mocks for each async operation type
  - Trigger async operation and wait for Effect failure
  - Verify error message appears in lastFrame() after loading completes
  - Verify spinner is no longer present when error is displayed
  - Test that appropriate error view is rendered after loading state clears
  - _Requirements: 9.4, 9.6_

- [ ] 8. Final integration and validation
- [ ] 8.1 Integrate all loading states into complete application flow
  - Verify all async operation entry points use appropriate loading views
  - Test navigation flow preserves loading state transitions correctly
  - Ensure navigateWithClear() works identically with new loading views
  - Verify backwards compatibility with existing functionality remains intact
  - Run full application test suite to check for regressions
  - _Requirements: 5.1, 6.3, 6.4, 6.5_

- [ ] 8.2 Perform manual testing across terminal environments
  - Test loading spinners on macOS Terminal with Unicode support
  - Test loading spinners on Linux terminal emulators (gnome-terminal, alacritty)
  - Test loading spinners on Windows Terminal and WSL
  - Verify ASCII fallback works on terminals with limited Unicode support
  - Test loading behavior with various async operation durations
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

- [ ] 8.3 Validate performance and memory management
  - Test animation frame rate maintains 120ms interval under normal conditions
  - Verify no memory leaks from setInterval after 100 component mount/unmount cycles
  - Test that concurrent operations are prevented by view state enforcement
  - Verify error path cleanup completes within single render cycle
  - Profile application to ensure loading animations don't impact performance
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

## Requirements Coverage

All requirements from requirements.md are mapped to tasks above:
- **Requirement 1 (Session Creation)**: Tasks 3.1-3.3, 4.1-4.3, 5.1, 5.3
- **Requirement 2 (Worktree Creation)**: Tasks 2.1, 2.3, 5.2, 5.3
- **Requirement 3 (Worktree Deletion)**: Tasks 2.2, 2.3, 5.2, 5.3
- **Requirement 4 (Consistent Component)**: Tasks 1.1-1.2, 3.2-3.3
- **Requirement 5 (State Management)**: Tasks 4.1-4.3, 5.1, 8.1, 8.3
- **Requirement 6 (Backwards Compatibility)**: Tasks 2.1-2.2, 3.1, 8.1
- **Requirement 7 (Error Handling)**: Tasks 5.1-5.3
- **Requirement 8 (Accessibility/UX)**: Tasks 1.1, 6.1-6.2, 8.2
- **Requirement 9 (Testing)**: Tasks 1.2, 2.3, 4.3, 5.3, 7.1-7.3

## Implementation Notes

1. **Test-Driven Development**: Each task should begin by writing tests first (red), then implementing functionality (green), then refactoring (refactor)
2. **Incremental Integration**: Each sub-task produces working, tested code that integrates with the existing system
3. **No Orphaned Code**: Every component and feature connects to the application through proper view rendering and handler integration
4. **Backwards Compatibility**: All enhancements preserve existing functionality and follow established patterns
5. **Effect-ts Error Handling**: All async operations use Effect.runPromise with Effect.either for consistent error handling
