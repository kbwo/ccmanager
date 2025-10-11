# Effect-Based Error Handling Migration

## Overview

This document describes the completed migration from traditional try-catch error handling to Effect-ts based error handling in CCManager. The migration provides type-safe, composable error handling with explicit error types in function signatures.

**Migration Completed:** October 2025
**Specification:** result-pattern-error-handling-2

## Migration Summary

### What Was Changed

1. **WorktreeService Fully Effect-Based**
   - All public methods now return `Effect.Effect<T, E, never>` types
   - Legacy synchronous methods removed
   - All git operations wrapped in `Effect.tryPromise` or `Effect.try`

2. **Legacy Methods Removed**
   - `getWorktrees()` → replaced by `getWorktreesEffect()`
   - `getDefaultBranch()` → replaced by `getDefaultBranchEffect()`
   - `getAllBranches()` → replaced by `getAllBranchesEffect()`
   - All callers updated to use Effect-based versions

3. **Component Integration**
   - All React components use `Effect.match` or `Effect.runPromise` for execution
   - Error handling uses TaggedError discrimination with `_tag` property
   - Loading states properly managed during Effect execution

4. **Test Coverage**
   - Comprehensive tests added for all Effect-based methods
   - Component tests updated to verify Effect composition
   - Tests use `Effect.runPromise` for execution
   - Error handling paths fully tested

## Remaining Synchronous Helpers

A small number of synchronous helper methods remain, with clear justification:

| Method | Location | Justification |
|--------|----------|---------------|
| `getAllRemotes()` | worktreeService.ts:296 | Simple utility for `resolveBranchReference`, no Effect needed |
| `resolveBranchReference()` | worktreeService.ts:233 | Called within Effect.gen but doesn't need to be Effect itself |
| `copyClaudeSessionData()` | worktreeService.ts:313 | Wrapped in Effect.try when called, keeping implementation simple |
| `getCurrentBranch()` | worktreeService.ts:136 | Marked @deprecated, only used as fallback in `getWorktreesEffect` |

These methods are either:
- Pure utility functions with no failure cases
- Called exclusively within Effect.gen or Effect.try blocks
- Marked as deprecated with migration plans documented

## Migration Benefits

### Type Safety

**Before:**
```typescript
// Error types not visible in signature
async getWorktrees(): Promise<Worktree[]> {
  try {
    // ...
  } catch (error) {
    // Unknown error type
    throw error;
  }
}
```

**After:**
```typescript
// Error types explicit in signature
getWorktreesEffect(): Effect.Effect<Worktree[], GitError, never> {
  return Effect.tryPromise({
    try: async () => { /* ... */ },
    catch: (error: any) => new GitError({ /* ... */ })
  });
}
```

### Composability

**Parallel Queries:**
```typescript
// Load branches and default branch in parallel
const loadBranchData = Effect.all([
  worktreeService.getAllBranchesEffect(),
  worktreeService.getDefaultBranchEffect()
], { concurrency: 2 });

const result = await Effect.runPromise(
  Effect.match(loadBranchData, {
    onFailure: (error) => ({ type: 'error', error }),
    onSuccess: ([branches, defaultBranch]) => ({
      type: 'success',
      data: { branches, defaultBranch }
    })
  })
);
```

**Sequential Composition:**
```typescript
// Chain validation and creation
createWorktreeEffect(branchName: string, path: string) {
  return Effect.flatMap(
    this.validatePath(path),
    (validPath) => this.performCreate(validPath, branchName)
  );
}
```

### Error Recovery

**Specific Error Handling:**
```typescript
// Recover from specific error types
const withRecovery = Effect.catchTag(
  createWorktreeEffect(path, branch),
  'GitError',
  (error) => {
    if (error.exitCode === 128) {
      // Branch exists, try alternative
      return createWorktreeEffect(path + '-2', branch + '-2');
    }
    return Effect.fail(error);
  }
);
```

**Fallback Values:**
```typescript
// Provide default if operation fails
const worktreesWithFallback = Effect.catchAll(
  worktreeService.getWorktreesEffect(),
  (error) => {
    console.error('Failed to get worktrees:', error);
    return Effect.succeed([defaultWorktree]);
  }
);
```

## Component Patterns

### Pattern 1: Loading Data with useEffect

```typescript
useEffect(() => {
  let cancelled = false;

  const loadData = async () => {
    const result = await Effect.runPromise(
      Effect.match(service.getDataEffect(), {
        onFailure: (err: AppError) => ({ type: 'error' as const, error: err }),
        onSuccess: (data) => ({ type: 'success' as const, data })
      })
    );

    if (!cancelled) {
      if (result.type === 'error') {
        setError(formatError(result.error));
      } else {
        setData(result.data);
      }
      setIsLoading(false);
    }
  };

  loadData().catch(err => {
    if (!cancelled) {
      setError(`Unexpected error: ${String(err)}`);
      setIsLoading(false);
    }
  });

  return () => { cancelled = true; };
}, []);
```

### Pattern 2: Event Handlers

```typescript
const handleSave = async () => {
  const result = await Effect.runPromise(
    Effect.match(service.saveEffect(data), {
      onFailure: (err: AppError) => ({ type: 'error' as const, error: err }),
      onSuccess: () => ({ type: 'success' as const })
    })
  );

  if (result.type === 'error') {
    setError(formatError(result.error));
  } else {
    onComplete();
  }
};
```

### Pattern 3: Error Formatting

```typescript
const formatError = (error: AppError): string => {
  switch (error._tag) {
    case 'GitError':
      return `Git command failed: ${error.command} (exit ${error.exitCode})\n${error.stderr}`;
    case 'FileSystemError':
      return `File ${error.operation} failed for ${error.path}: ${error.cause}`;
    case 'ConfigError':
      return `Configuration error (${error.reason}): ${error.details}`;
    case 'ProcessError':
      return `Process error: ${error.message}`;
    case 'ValidationError':
      return `Validation failed for ${error.field}: ${error.constraint}`;
  }
};
```

## Testing Approach

### Service Tests

```typescript
describe('WorktreeService', () => {
  it('should get worktrees using Effect', async () => {
    const worktrees = await Effect.runPromise(
      worktreeService.getWorktreesEffect()
    );
    expect(worktrees).toHaveLength(3);
  });

  it('should handle git errors', async () => {
    const result = await Effect.runPromise(
      Effect.either(worktreeService.getWorktreesEffect())
    );

    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe('GitError');
    }
  });
});
```

### Component Tests

```typescript
it('should display error when getWorktreesEffect fails', async () => {
  mockWorktreeService.getWorktreesEffect.mockReturnValue(
    Effect.fail(new GitError({
      command: 'git worktree list',
      exitCode: 128,
      stderr: 'not a git repository'
    }))
  );

  const { findByText } = render(<Menu />);

  const error = await findByText(/not a git repository/i);
  expect(error).toBeDefined();
});
```

## Architecture Decisions

### Why Effect-ts?

1. **Explicit Error Types**: Function signatures declare all possible errors
2. **Composability**: Chain and combine Effects naturally
3. **Type Safety**: TypeScript ensures all error cases are handled
4. **Recovery Strategies**: Rich API for error recovery and fallbacks
5. **Testability**: Easy to test both success and failure paths

### Why Not Traditional try-catch?

1. **Hidden Errors**: No way to know what errors a function might throw
2. **Difficult Composition**: Hard to chain async operations with proper error handling
3. **Missing Cases**: Easy to forget error handling at call sites
4. **Testing Complexity**: Harder to test error paths systematically

### When to Use Effect vs Either

- **Effect**: Asynchronous operations or operations with side effects
  - Git commands, file I/O, PTY spawning
  - Returns `Effect.Effect<T, E, never>`

- **Either**: Synchronous, pure operations
  - Configuration validation, path resolution
  - Returns `Either.Either<E, T>`

## Performance Considerations

The migration to Effect-ts has minimal performance impact:

1. **Effect Execution**: Effect.runPromise has negligible overhead
2. **Parallel Execution**: Effect.all enables efficient concurrent operations
3. **Memory**: No significant memory increase from Effect wrappers
4. **Bundle Size**: Effect-ts adds ~50KB to bundle (minified + gzipped)

## Future Work

### Potential Enhancements

1. **Effect.gen Usage**: Convert more Effect.flatMap chains to Effect.gen syntax
2. **Structured Errors**: Add more specific error types for different failure modes
3. **Retry Policies**: Implement smart retry strategies for transient failures
4. **Effect Layers**: Use Effect layers for dependency injection in services
5. **Stream Support**: Consider Effect.Stream for streaming git operations

### Migration Patterns for New Code

When adding new code to CCManager:

1. **Service Methods**: Always return Effect types for operations that can fail
2. **Components**: Use Effect.match in useEffect and event handlers
3. **Utilities**: Use Effect for async, Either for sync validation
4. **Tests**: Test both success and failure paths with Effect.runPromise
5. **Documentation**: Include @example tags showing Effect usage

## References

- [Effect-ts Official Documentation](https://effect.website/docs/introduction)
- [Error Management Guide](https://effect.website/docs/error-management/error-handling)
- [Tagged Errors](https://effect.website/docs/error-management/expected-errors#tagged-errors)
- [Effect Composition](https://effect.website/docs/guides/pipeline)
- [Testing with Effect](https://effect.website/docs/guides/testing)

## Verification Checklist

The following verification steps were completed to ensure migration success:

- ✅ All WorktreeService public methods return Effect types
- ✅ No synchronous git operations outside Effect.try or Effect.tryPromise
- ✅ All components use Effect.runPromise or Effect.match for execution
- ✅ No legacy adapter utilities or conversion functions remain
- ✅ All tests pass with Effect-based implementations
- ✅ Documentation reflects Effect-only patterns
- ✅ Build and typecheck complete without errors
- ✅ No remaining try-catch patterns outside Effect.try calls
- ✅ Remaining synchronous helpers documented with clear justification

## Conclusion

The migration to Effect-ts based error handling is complete and provides CCManager with:
- Type-safe error handling throughout the codebase
- Better composition and error recovery strategies
- Improved testability with explicit error paths
- Clear documentation and examples for future development

This migration establishes Effect-ts as the standard for error handling in CCManager, ensuring consistent, safe, and composable error management across all services and components.
