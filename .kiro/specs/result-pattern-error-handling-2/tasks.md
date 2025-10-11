# Implementation Plan

- [x] 1. Establish Effect-ts foundation and error type system
- [x] 1.1 Integrate Effect-ts package into project dependencies
  - Add effect package as production dependency to package.json
  - Verify TypeScript version compatibility with Effect-ts requirements
  - Run build and development workflows to ensure no breaking changes
  - Document Effect-ts version in technology stack documentation
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 1.2 Define structured error types using Data.TaggedError
  - Create error type definitions file with GitError for git operation failures
  - Define FileSystemError for file system operation failures
  - Define ConfigError for configuration operation failures
  - Define ProcessError for PTY and process operation failures
  - Define ValidationError for input validation failures
  - Implement AppError union type for all application errors
  - Ensure all errors extend Data.TaggedError with _tag property for type narrowing
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 1.3 Create adapter utilities for backward compatibility
  - Implement conversion function from GitOperationResult to Either type
  - Implement conversion function from Either to GitOperationResult for legacy code
  - Create Promise conversion utilities for React component integration
  - Build error mapping utilities for transforming errors to user-friendly messages
  - Add JSDoc documentation explaining temporary nature of adapters
  - _Requirements: 9.3, 9.4_

- [x] 1.4 Document Effect-ts usage patterns and best practices
  - Update developer documentation with Effect.succeed and Effect.fail patterns
  - Document Effect.try and Effect.tryPromise for wrapping existing code
  - Provide examples of Effect.map and Effect.flatMap for composition
  - Include guidance on Effect.runPromise for React integration
  - Add code examples showing Effect usage in services, utilities, and components
  - Document when to use Effect vs Either for different operation types
  - _Requirements: 11.1, 11.3, 11.4, 11.5_

- [x] 2. Migrate utility layer to Effect types
- [x] 2.1 Convert Git status utilities to Effect-based error handling
  - Replace GitOperationResult return type with Effect type for status queries
  - Convert Promise-based exec calls to Effect.tryPromise
  - Wrap git command failures in GitError with command details and exit codes
  - Handle signal abortion using Effect's interruption mechanism
  - Implement synchronous parsing functions using Either type
  - Update concurrency-limited status operations to use Effect
  - Create temporary adapter for legacy callers during migration
  - _Requirements: 6.1, 6.5, 3.4, 2.1_

- [x] 2.2 Convert worktree configuration utilities to Effect-based operations
  - Transform git config read operations to return Effect with GitError
  - Transform git config write operations to return Effect with GitError
  - Handle missing config as success case returning null (not error)
  - Use Effect.tryPromise for asynchronous git config commands
  - _Requirements: 6.2, 6.5, 3.4_

- [x] 2.3 Convert hook executor utilities to Effect-based execution
  - Wrap hook spawn operations in Effect.tryPromise
  - Capture hook failures in ProcessError with exit code and stderr
  - Implement error logging without propagating failures (hooks shouldn't break main flow)
  - Use Effect.catchAll with success fallback for non-critical hook errors
  - Update worktree post-creation hook execution to return Effect
  - Update session status change hook execution to return Effect
  - _Requirements: 6.3, 6.5, 3.4_

- [x] 2.4 Convert Claude directory utilities to Effect and Either types
  - Implement directory path resolution using Either for synchronous validation
  - Use Effect for asynchronous directory existence checks
  - Wrap FileSystemError for file system access failures
  - Handle invalid HOME directory with ValidationError
  - _Requirements: 6.4, 6.6, 2.1, 2.2_

- [x] 3. Migrate service layer to Effect types
- [x] 3.1 Convert WorktreeService to Effect-based operations
  - Transform worktree listing to return Effect with GitError
  - Transform worktree creation to return Effect with GitError or FileSystemError
  - Transform worktree deletion to return Effect with GitError
  - Transform worktree merge to return Effect with GitError
  - Use Effect.catchTag for specific error recovery strategies
  - Replace internal try-catch blocks with Effect.try and Effect.tryPromise
  - Maintain existing class-based service structure
  - _Requirements: 5.1, 5.5, 5.7, 3.1, 3.2, 3.4, 3.6_

- [x] 3.2 Convert ConfigurationManager to Effect-based operations
  - Transform configuration loading to return Effect with FileSystemError or ConfigError
  - Transform configuration saving to return Effect with FileSystemError
  - Implement synchronous validation using Either with ValidationError
  - Convert JSON parse failures to ConfigError with parse details
  - Handle migration failures with ConfigError including migration reason
  - Implement preset lookup using Either for synchronous validation
  - Use Effect.tryPromise for file I/O operations
  - Maintain singleton pattern for configuration manager
  - _Requirements: 5.3, 5.6, 5.7, 3.3, 3.4, 2.1_

- [x] 3.3 Convert SessionManager to Effect-based operations
  - Transform session creation with preset to return Effect with ProcessError or ConfigError
  - Transform session creation with devcontainer to return Effect with ProcessError or ConfigError
  - Transform session termination to return Effect with ProcessError
  - Wrap PTY spawn failures in ProcessError with command and error details
  - Wrap devcontainer command failures in ProcessError with container context
  - Use Effect.catchAll for cleanup guarantees on failure
  - Maintain EventEmitter pattern for session lifecycle events
  - Use Effect.tryPromise for Promise-based PTY operations
  - _Requirements: 5.2, 5.5, 5.6, 5.7, 3.4, 3.9_

- [x] 3.4 Convert ProjectManager to Effect-based operations
  - Transform project discovery to return Effect with FileSystemError or GitError
  - Transform recent projects loading to return Effect with FileSystemError or ConfigError
  - Transform recent projects saving to return Effect with FileSystemError
  - Transform project refresh to return Effect with FileSystemError or GitError
  - Use Effect.all with concurrency control for parallel project discovery
  - Implement cache failure fallback using Effect.catchAll to return empty cache
  - Use Effect.tryPromise for async directory traversal
  - _Requirements: 5.4, 5.5, 5.6, 3.4, 3.8_

- [ ] 4. Integrate Effect execution in React components
- [x] 4.1 Update Menu component for Effect-based error handling
  - Execute worktree listing Effect using Effect.runPromise
  - Handle GitError display using pattern matching on _tag
  - Transform error information into user-friendly messages
  - Maintain existing loading state patterns
  - Replace try-catch blocks with Effect execution and matching
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 7.1, 7.2_

- [x] 4.2 Update worktree management forms for Effect execution
  - Execute worktree creation Effect in NewWorktree form event handlers
  - Execute worktree deletion Effect in DeleteWorktree form event handlers
  - Execute worktree merge Effect in MergeWorktree form event handlers
  - Use Effect.match for type-safe success and failure handling
  - Display GitError and FileSystemError with context-specific messages
  - Replace try-catch blocks with Effect.runPromise
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 7.1, 7.2_

- [x] 4.3 Update Session component for Effect-based session management
  - Execute session creation Effects in component lifecycle
  - Handle ProcessError from PTY spawn failures with user-friendly messages
  - Use _tag discrimination for error type identification
  - Maintain loading indicators during Effect execution
  - Handle Effect cleanup on component unmount
  - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

- [x] 4.4 Update ProjectList component for Effect-based project discovery
  - Execute project discovery Effect in component initialization
  - Handle FileSystemError gracefully with fallback messages
  - Handle GitError from project validation failures
  - Use Effect.runPromise for async project loading
  - Implement cancellation flag for cleanup on unmount
  - _Requirements: 8.1, 8.2, 8.4, 8.6_

- [x] 4.5 Update Configuration component for Effect-based config operations
  - Execute configuration load Effect on component mount
  - Execute configuration save Effect on user actions
  - Display ValidationError for invalid shortcuts with field-level details
  - Display ConfigError for parse or migration failures
  - Handle FileSystemError for config file access issues
  - Use Effect.match for success and error case handling
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 4.6 Update custom hooks for Effect execution patterns
  - Convert useGitStatus hook to execute Effects in useEffect
  - Handle Effect cancellation on hook cleanup
  - Transform Effect results into hook state
  - Use Effect.runPromise for async status polling
  - Maintain existing polling interval behavior
  - _Requirements: 8.1, 8.5, 8.6, 7.5_

- [ ] 5. Complete migration with testing and cleanup
- [x] 5.1 Update test suites for Effect-based implementations
  - Migrate utility layer tests to use Effect.runSync for success cases
  - Update service layer tests to verify Effect types are returned
  - Test error cases using Effect.runSync or Either pattern matching
  - Test Effect composition with map, flatMap, and other combinators
  - Verify specific error types using _tag pattern matching
  - Create test utilities for common Effect execution patterns
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 5.2 Update component tests for Effect integration
  - Test component error display for each TaggedError type
  - Verify error messages include actionable context (command, path, reason)
  - Test Effect execution in event handlers and useEffect hooks
  - Verify cleanup and cancellation behavior
  - Test error recovery patterns in components
  - _Requirements: 10.1, 10.2, 10.6, 8.1, 8.2_

- [ ] 5.3 Remove backward compatibility layer
  - Remove adapter utilities file after all code migrated
  - Remove legacy GitOperationResult type definition
  - Remove all adapter function calls from codebase
  - Verify no legacy result types remain
  - Run full test suite to validate removal
  - _Requirements: 9.5, 9.6_

- [ ] 5.4 Finalize documentation and examples
  - Update architecture documentation with final Effect patterns
  - Add JSDoc examples to all Effect-returning functions
  - Document error type usage with when-to-use guidance
  - Provide links to Effect-ts documentation for deeper understanding
  - Include example code showing complete Error flow from service to UI
  - _Requirements: 11.2, 11.5, 11.6_

- [ ] 5.5 Validate migration completeness
  - Run full test suite to ensure all tests pass
  - Verify all requirements are covered by implementation
  - Check that all try-catch blocks have been replaced
  - Validate that error handling is consistent across all layers
  - Ensure backward compatibility requirements are met during migration
  - _Requirements: 9.1, 9.2, 10.2_
