# Requirements Document

## Introduction

CCManager currently performs several long-running promise-based operations without visual feedback, leaving users uncertain whether the application is processing their request or has frozen. This feature adds loading spinners using the Ink Spinner component to provide clear visual feedback during all asynchronous operations in the App component, improving user experience and reducing uncertainty during operations like session creation, worktree management, and command execution.

The implementation will follow CCManager's existing patterns: React/Ink UI components, Effect-ts error handling, and view-based navigation with proper state management.

## Requirements

### Requirement 1: Session Creation Loading Feedback
**Objective:** As a developer using CCManager, I want to see a loading spinner when creating AI assistant sessions, so that I know the application is actively working and haven't accidentally triggered an error.

#### Acceptance Criteria

1. WHEN a user selects a worktree without an existing session AND preset selector is disabled THEN App SHALL display a spinner with message "Creating session..." while executing createSessionWithEffect
2. WHEN a user selects a preset from PresetSelector THEN App SHALL display a spinner with message "Creating session with preset..." while executing createSessionWithEffect with the selected preset ID
3. WHEN session creation includes devcontainer initialization THEN App SHALL display enhanced message "Starting devcontainer and creating session..." to indicate the longer operation
4. WHEN Effect-based session creation completes successfully THEN App SHALL hide the spinner and navigate to the session view
5. WHEN Effect-based session creation fails with an error THEN App SHALL hide the spinner, display the error message, and return to the menu view
6. WHERE createSessionWithEffect is called from handleSelectWorktree THE App SHALL show loading state before awaiting the promise
7. WHERE createSessionWithEffect is called from handlePresetSelected THE App SHALL show loading state before awaiting the promise

### Requirement 2: Worktree Creation Loading Feedback
**Objective:** As a developer managing worktrees, I want to see a loading spinner during worktree creation operations, so that I understand the operation is in progress and can estimate completion time.

#### Acceptance Criteria

1. WHEN handleCreateWorktree executes worktreeService.createWorktreeEffect THEN App SHALL display existing "Creating worktree..." view with enhanced spinner component
2. WHILE worktree creation is processing the Effect operation THE App SHALL display an animated spinner alongside the "Creating worktree..." text
3. WHEN worktree creation with session data copy is requested THEN App SHALL display message "Creating worktree and copying session data..." to indicate additional processing
4. WHEN worktree creation succeeds THEN App SHALL hide the spinner and return to menu view
5. WHEN worktree creation fails with ambiguous branch error THEN App SHALL hide the spinner and navigate to remote-branch-selector view
6. WHEN worktree creation fails with other errors THEN App SHALL hide the spinner, display the error, and return to new-worktree form
7. WHERE handleRemoteBranchSelected retries worktree creation after disambiguation THE App SHALL display the spinner again during retry

### Requirement 3: Worktree Deletion Loading Feedback
**Objective:** As a developer deleting worktrees, I want to see progress feedback during deletion operations, so that I understand potentially long-running delete operations are progressing normally.

#### Acceptance Criteria

1. WHEN handleDeleteWorktrees executes sequential deletion operations THEN App SHALL display existing "Deleting worktrees..." view with enhanced spinner component
2. WHILE worktree deletion processes multiple paths sequentially THE App SHALL maintain the animated spinner to indicate ongoing work
3. WHEN deletion includes branch deletion (deleteBranch=true) THEN App SHALL display message "Deleting worktrees and branches..." to indicate additional scope
4. WHEN all deletions complete successfully THEN App SHALL hide the spinner and return to menu view
5. WHEN any deletion fails with an error THEN App SHALL hide the spinner, display the specific error message, and return to delete-worktree view
6. WHERE multiple worktrees are being deleted THE App SHALL continue showing spinner throughout the sequential loop

### Requirement 4: Consistent Loading Component
**Objective:** As a maintainer of CCManager, I want a reusable loading component that follows Ink best practices, so that loading states are implemented consistently and can be easily updated across all operations.

#### Acceptance Criteria

1. WHEN implementing loading feedback THE App SHALL use Ink Spinner component from ink package if available, otherwise use a custom animated text solution
2. WHERE spinner is displayed THE component SHALL include both the animated spinner visual and descriptive status text
3. WHEN displaying spinner THE App SHALL use flexDirection="row" layout with appropriate spacing between spinner and message
4. WHERE spinner color is specified THE App SHALL use "cyan" for normal operations and "yellow" for longer operations (devcontainer, data copy)
5. IF ink-spinner package is not available THEN App SHALL implement simple animated text fallback using rotating characters (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
6. WHEN creating reusable loading component THEN component SHALL accept props: message (string), spinnerType (optional, "dots" | "line" default "dots"), color (optional, default "cyan")

### Requirement 5: Loading State Management
**Objective:** As a developer using CCManager, I want loading states to be properly managed and cleaned up, so that the UI doesn't get stuck in loading state or show incorrect loading indicators.

#### Acceptance Criteria

1. WHEN entering a loading state THEN App SHALL set a dedicated loading boolean flag or navigate to a loading view variant
2. WHILE async operation is executing THE App SHALL prevent user input that could trigger conflicting operations
3. WHEN async operation completes (success or failure) THEN App SHALL clear the loading state immediately
4. WHERE Effect.runPromise is used THE App SHALL ensure loading state cleanup happens in both success and error paths
5. IF component unmounts during async operation THEN App SHALL use cancellation flag pattern to prevent state updates on unmounted component
6. WHEN user presses ESC or cancel during loading THEN App SHALL continue showing spinner until operation completes (operations cannot be interrupted mid-execution)

### Requirement 6: Backwards Compatibility with Existing Loading Views
**Objective:** As a CCManager user, I want the new loading spinner feature to enhance existing loading views without breaking current functionality, so that the upgrade is seamless and risk-free.

#### Acceptance Criteria

1. WHERE App currently displays "Creating worktree..." view (view === 'creating-worktree') THE enhanced version SHALL add spinner component while preserving existing text
2. WHERE App currently displays "Deleting worktrees..." view (view === 'deleting-worktree') THE enhanced version SHALL add spinner component while preserving existing text and color
3. WHEN adding loading spinner to existing views THEN App SHALL maintain the existing Box and Text component structure with minimal modifications
4. WHERE new loading states are required for session creation THE App SHALL follow the same view-based navigation pattern as existing loading views
5. IF session creation requires new view states THEN new View type values SHALL be added to the View union type following existing naming conventions

### Requirement 7: Error Handling During Loading Operations
**Objective:** As a developer, I want errors during async operations to be clearly displayed and properly logged, so that I can diagnose issues and understand what went wrong.

#### Acceptance Criteria

1. WHEN an Effect-based operation fails during loading THEN App SHALL use formatErrorMessage function to convert AppError to user-friendly string
2. WHERE session creation fails with ProcessError or ConfigError THEN App SHALL display specific error details from the tagged error
3. WHEN worktree operations fail with GitError or FileSystemError THEN App SHALL display the command, exit code, and stderr information
4. IF error occurs during loading state THEN App SHALL transition from loading view to error display view in one render cycle
5. WHERE multiple sequential operations execute (e.g., deleting multiple worktrees) THE App SHALL stop on first error and display that specific error message
6. WHEN returning to form view after error THEN error state SHALL be preserved and displayed above the form for user context

### Requirement 8: Accessibility and User Experience
**Objective:** As a user with different terminal capabilities, I want loading indicators that work across various terminal emulators and configurations, so that I can use CCManager regardless of my environment.

#### Acceptance Criteria

1. WHERE terminal supports Unicode THE App SHALL display animated spinner characters for smooth loading indication
2. IF terminal has limited Unicode support THEN App SHALL fall back to ASCII characters (-, \\, |, /) for spinner animation
3. WHEN spinner is animating THE App SHALL use appropriate frame rate (100-150ms per frame) to balance visibility and performance
4. WHERE loading message is displayed THE text SHALL be clear, concise, and accurately describe the operation in progress
5. WHEN operation is expected to take longer than 5 seconds THEN message SHOULD include indication of extended duration (e.g., "Starting devcontainer (this may take a moment)...")
6. IF terminal width is narrow THEN loading message SHALL wrap appropriately or truncate gracefully without breaking layout

### Requirement 9: Testing Requirements
**Objective:** As a maintainer, I want comprehensive tests for loading states and spinner components, so that loading feedback remains reliable across code changes and refactoring.

#### Acceptance Criteria

1. WHEN creating loading spinner component THEN unit tests SHALL verify component renders with correct message and spinner type
2. WHERE async operations are tested THE tests SHALL verify loading state is set before async operation starts
3. WHEN async operation completes in tests THEN tests SHALL verify loading state is cleared properly
4. WHERE Effect-based operations are mocked in tests THE mocks SHALL simulate both success (Right) and error (Left) outcomes
5. IF tests use ink-testing-library THEN tests SHALL verify presence of spinner component using findByText or equivalent
6. WHEN testing error scenarios THEN tests SHALL verify loading state transitions to error display correctly
