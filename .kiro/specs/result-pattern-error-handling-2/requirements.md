# Requirements Document

## Introduction

CCManager currently uses try-catch blocks for error handling across services, utilities, and components. This approach has several limitations: errors are not type-safe, error handling logic is often inconsistent, and it's difficult to distinguish between expected operational failures and unexpected exceptions. This specification defines the migration to Effect-ts, a mature functional programming library that provides type-safe error handling through the Effect type system.

Effect-ts wraps operation outcomes in an Effect type that makes errors explicit, composable, and type-safe. This improves code reliability, makes error flows visible in the type system, and provides powerful composition utilities. The codebase already has a basic `GitOperationResult<T>` interface that will be migrated to Effect's `Either` or `Effect` types.

## Requirements

### Requirement 1: Effect-ts Integration
**Objective:** As a developer, I want Effect-ts integrated into the project, so that I can use its type-safe error handling capabilities throughout the codebase.

#### Acceptance Criteria

1. WHEN Effect-ts is added to the project THEN CCManager SHALL include `effect` package as a production dependency
2. WHEN TypeScript is configured THEN CCManager SHALL ensure TypeScript version compatibility with Effect-ts requirements (>=5.0)
3. WHEN Effect-ts is integrated THEN CCManager SHALL maintain existing build and development workflows without breaking changes
4. WHERE Effect-ts types are used THEN CCManager SHALL ensure proper type inference without explicit type annotations where possible
5. WHEN the integration is complete THEN CCManager SHALL document the Effect-ts version in the technology stack documentation

### Requirement 2: Core Effect Types Adoption
**Objective:** As a developer, I want to use Effect's core types for error handling, so that operations that can fail are type-safe and explicit.

#### Acceptance Criteria

1. WHEN a synchronous operation can fail THEN CCManager SHALL use `Either<E, A>` type where E is the error type and A is the success type
2. WHEN an asynchronous operation can fail THEN CCManager SHALL use `Effect<A, E, R>` type where A is success, E is error, and R is requirements/context
3. WHEN operations don't require dependency injection THEN CCManager SHALL use `Effect<A, E, never>` with never for requirements
4. WHERE operations have multiple possible error types THEN CCManager SHALL use union types for the error channel (e.g., `Effect<A, GitError | FileSystemError>`)
5. WHEN an operation cannot fail THEN CCManager SHALL use simple return types or `Effect<A, never>` to indicate infallibility
6. WHERE Effect types are used THEN CCManager SHALL leverage TypeScript's discriminated unions for type narrowing

### Requirement 3: Effect Constructors and Utilities
**Objective:** As a developer, I want to use Effect's built-in functions for creating and transforming Effects, so that error handling code is concise and composable.

#### Acceptance Criteria

1. WHEN creating a successful Effect THEN CCManager SHALL use `Effect.succeed(value)` or `Either.right(value)`
2. WHEN creating a failed Effect THEN CCManager SHALL use `Effect.fail(error)` or `Either.left(error)`
3. WHEN wrapping try-catch code THEN CCManager SHALL use `Effect.try()` with error mapping functions
4. WHEN working with Promises THEN CCManager SHALL use `Effect.tryPromise()` to convert Promise-based code to Effects
5. WHEN transforming success values THEN CCManager SHALL use `Effect.map()` or `Either.map()`
6. WHEN chaining Effect-returning operations THEN CCManager SHALL use `Effect.flatMap()` or `Either.flatMap()`
7. WHEN transforming error types THEN CCManager SHALL use `Effect.mapError()` or `Either.mapLeft()`
8. WHEN combining multiple Effects THEN CCManager SHALL use `Effect.all()` for parallel execution or sequential composition
9. WHEN providing fallback values THEN CCManager SHALL use `Effect.catchAll()` or `Either.getOrElse()`

### Requirement 4: Error Type Definitions
**Objective:** As a developer, I want well-defined error types that work with Effect's error channel, so that I can handle errors appropriately based on their type.

#### Acceptance Criteria

1. WHEN Git operations fail THEN CCManager SHALL provide a `GitError` class extending `Data.TaggedError` with command, exit code, and stderr output
2. WHEN file system operations fail THEN CCManager SHALL provide a `FileSystemError` class extending `Data.TaggedError` with path and operation details
3. WHEN configuration operations fail THEN CCManager SHALL provide a `ConfigError` class extending `Data.TaggedError` with validation or parsing details
4. WHEN PTY operations fail THEN CCManager SHALL provide a `ProcessError` class extending `Data.TaggedError` with process ID and error details
5. WHEN validation fails THEN CCManager SHALL provide a `ValidationError` class extending `Data.TaggedError` with field-level error information
6. WHEN an error type is defined THEN CCManager SHALL use Effect's `Data.TaggedError` or `Data.TaggedClass` for consistent error structure
7. WHERE errors need unique identification THEN CCManager SHALL include a `_tag` property for discriminated union type narrowing

### Requirement 5: Service Layer Migration
**Objective:** As a developer, I want all service layer functions to use Effect types, so that error handling is consistent and type-safe across business logic.

#### Acceptance Criteria

1. WHEN WorktreeService operations execute THEN CCManager SHALL return Effect or Either types for all public methods
2. WHEN SessionManager operations execute THEN CCManager SHALL return Effect types for session creation, management, and cleanup operations
3. WHEN ConfigurationManager operations execute THEN CCManager SHALL return Effect types for all configuration read and write operations
4. WHEN ProjectManager operations execute THEN CCManager SHALL return Effect types for project discovery and management operations
5. WHEN a service method encounters a Git command failure THEN CCManager SHALL return an Effect.fail with GitError containing command output and exit code
6. WHEN a service method encounters a file system error THEN CCManager SHALL return an Effect.fail with FileSystemError containing error details
7. WHERE service methods currently throw exceptions THEN CCManager SHALL convert them to return failed Effects instead
8. WHEN service methods have dependencies THEN CCManager SHALL use Effect's context/requirements channel for dependency injection

### Requirement 6: Utility Layer Migration
**Objective:** As a developer, I want all utility functions to use Effect types, so that error handling is consistent across helper functions.

#### Acceptance Criteria

1. WHEN gitStatus utilities execute THEN CCManager SHALL return Effect types instead of the current `GitOperationResult<T>`
2. WHEN worktreeConfig utilities execute THEN CCManager SHALL return Effect types for configuration operations
3. WHEN hookExecutor utilities execute THEN CCManager SHALL return Effect types indicating hook execution success or failure
4. WHEN claudeDir utilities execute THEN CCManager SHALL return Effect types for directory resolution operations
5. WHERE utility functions currently use try-catch THEN CCManager SHALL replace them with Effect.try() or Effect.tryPromise()
6. WHERE utilities perform synchronous operations THEN CCManager SHALL use Either type for simpler operations without async requirements

### Requirement 7: Effect Execution and Integration
**Objective:** As a developer, I want clear patterns for executing Effects in the application, so that Effect-based code integrates seamlessly with existing React components.

#### Acceptance Criteria

1. WHEN executing an Effect at application boundaries THEN CCManager SHALL use `Effect.runPromise()` to convert to Promise for React integration
2. WHEN handling Effect errors at boundaries THEN CCManager SHALL use `Effect.match()` or `Either.match()` to handle both success and failure cases
3. WHEN Effects need error recovery THEN CCManager SHALL use `Effect.catchAll()`, `Effect.catchTag()`, or `Effect.catchTags()` for type-safe error handling
4. WHERE multiple Effects need execution THEN CCManager SHALL use `Effect.all()` with appropriate concurrency settings
5. WHEN Effects are used in React hooks THEN CCManager SHALL execute them in useEffect or event handlers and handle cleanup appropriately
6. WHERE synchronous execution is required THEN CCManager SHALL use `Effect.runSync()` or `Either.getOrThrow()` only when errors are truly unexpected

### Requirement 8: Component Layer Integration
**Objective:** As a developer, I want React components to handle Effect types gracefully, so that errors are displayed appropriately in the UI.

#### Acceptance Criteria

1. WHEN a component calls an Effect-returning function THEN CCManager SHALL execute the Effect and handle both success and error cases
2. WHEN a service operation returns a failed Effect THEN CCManager SHALL display error information to the user
3. WHEN displaying errors in the UI THEN CCManager SHALL extract error information from Error classes using pattern matching
4. WHERE components currently use try-catch blocks THEN CCManager SHALL replace them with Effect execution and matching
5. WHEN an async operation is pending THEN CCManager SHALL maintain existing loading state patterns
6. WHERE Effects are executed in components THEN CCManager SHALL properly handle cleanup and cancellation using Effect.runPromise abort signals

### Requirement 9: Backward Compatibility and Migration Strategy
**Objective:** As a developer, I want to migrate incrementally, so that I can refactor the codebase in manageable steps without breaking existing functionality.

#### Acceptance Criteria

1. WHEN Effect-ts is introduced THEN CCManager SHALL maintain existing `GitOperationResult<T>` interface temporarily during migration
2. WHEN migrating a module THEN CCManager SHALL ensure all tests continue to pass
3. WHEN both old and new patterns coexist THEN CCManager SHALL provide adapter functions to convert GitOperationResult to Either types
4. WHERE adapter functions are needed THEN CCManager SHALL create utilities to convert between Promise-based and Effect-based APIs
5. WHEN the migration is complete THEN CCManager SHALL remove the legacy `GitOperationResult<T>` type and adapter functions
6. WHERE breaking changes are introduced THEN CCManager SHALL update all calling code in the same change to maintain type safety

### Requirement 10: Testing and Validation
**Objective:** As a developer, I want comprehensive tests for Effect-based implementations, so that error handling behavior is verified and reliable.

#### Acceptance Criteria

1. WHEN Effect-based functions are implemented THEN CCManager SHALL include unit tests using Effect's testing utilities
2. WHEN services are migrated THEN CCManager SHALL update existing tests to verify Effect types are returned correctly
3. WHEN error cases are tested THEN CCManager SHALL use `Effect.runSync()` or `Either.getLeft()` to verify error contents
4. WHEN success cases are tested THEN CCManager SHALL use `Effect.runSync()` or `Either.getRight()` to verify success data
5. WHERE Effect composition is used THEN CCManager SHALL test that map, flatMap, and other combinators work correctly
6. WHEN testing error handling THEN CCManager SHALL verify that specific error types are returned using pattern matching

### Requirement 11: Documentation and Best Practices
**Objective:** As a developer, I want clear documentation on using Effect-ts in CCManager, so that I can apply it correctly in new code and understand migrated code.

#### Acceptance Criteria

1. WHEN Effect-ts is integrated THEN CCManager SHALL document Effect-ts usage patterns in CLAUDE.md
2. WHEN error types are defined THEN CCManager SHALL include JSDoc comments explaining when each error type is used
3. WHEN Effect utilities are used THEN CCManager SHALL document common patterns like Effect.try(), Effect.flatMap(), and Effect.all()
4. WHERE best practices exist THEN CCManager SHALL document them in the development guidelines section
5. WHEN the migration is complete THEN CCManager SHALL include example code showing Effect usage in services, utilities, and components
6. WHERE Effect-ts concepts need explanation THEN CCManager SHALL provide links to Effect-ts documentation for deeper understanding
