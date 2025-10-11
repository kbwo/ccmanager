# Remaining Migration Tasks - Effect-based Error Handling

## Context

During verification of the migration completion, legacy non-Effect code was discovered still present in the codebase. This task list documents the remaining work to fully complete the migration to Effect-based error handling.

## Legacy Code Locations

**WorktreeService legacy methods:**
- `getWorktrees()` - src/services/worktreeService.ts:62
- `getDefaultBranch()` - src/services/worktreeService.ts:156
- `getAllBranches()` - src/services/worktreeService.ts:190
- `getCurrentBranch()` - src/services/worktreeService.ts:136
- `hasClaudeDirectoryInBranch()` - src/services/worktreeService.ts:347

**Usage locations:**
- src/utils/hookExecutor.ts:194 - uses `getWorktrees()`
- src/components/Menu.tsx:125 - uses `getDefaultBranch()`
- src/components/NewWorktree.tsx:60-61 - uses `getAllBranches()` and `getDefaultBranch()`

## Tasks

- [x] 1. Create Effect-based branch query methods
- [x] 1.1 Create `getDefaultBranchEffect()` in WorktreeService
  - Return `Effect.Effect<string, GitError, never>`
  - Wrap git symbolic-ref command in Effect.try
  - Include fallback logic for main/master detection
  - Add JSDoc with @example showing Effect.match usage
  - _Related to: Requirement 5.1, 5.5_

- [x] 1.2 Create `getAllBranchesEffect()` in WorktreeService
  - Return `Effect.Effect<string[], GitError, never>`
  - Wrap git branch command in Effect.try
  - Return empty array on failure (non-critical operation)
  - Add JSDoc with @example showing Effect.runPromise usage
  - _Related to: Requirement 5.1, 5.5_

- [x] 1.3 Create `getCurrentBranchEffect()` in WorktreeService
  - Return `Effect.Effect<string, GitError, never>`
  - Wrap git rev-parse command in Effect.try
  - Make method public (currently private)
  - Add JSDoc with @example showing Effect usage
  - _Related to: Requirement 5.1, 5.5_

- [x] 2. Migrate hookExecutor.ts to use Effect-based methods
- [x] 2.1 Update `executeStatusHook()` to use `getWorktreesEffect()`
  - Replace `worktreeService.getWorktrees()` call on line 194
  - Use Effect.gen or Effect.flatMap to compose with existing Effect
  - Maintain hook execution flow (errors should not break main flow)
  - Update tests to verify Effect composition
  - _Location: src/utils/hookExecutor.ts:194_
  - _Related to: Requirement 6.3, 3.4_

- [ ] 3. Migrate Menu component to use Effect-based branch methods
- [ ] 3.1 Update Menu.tsx to use `getDefaultBranchEffect()`
  - Replace `worktreeService.getDefaultBranch()` call on line 125
  - Execute Effect within existing Effect.match block (after getWorktreesEffect)
  - Use Effect.flatMap to chain worktrees and defaultBranch loading
  - Handle GitError using existing error display pattern
  - Update state management to handle loading state properly
  - _Location: src/components/Menu.tsx:125_
  - _Related to: Requirement 8.1, 8.2, 7.1_

- [ ] 4. Migrate NewWorktree component to use Effect-based branch methods
- [ ] 4.1 Update NewWorktree.tsx to use Effect-based branch queries
  - Replace `getAllBranches()` and `getDefaultBranch()` in useMemo on lines 60-61
  - Move Effect execution to useEffect hook instead of useMemo
  - Add loading state for branch data initialization
  - Display error message if branch loading fails
  - Use Effect.all to load branches and defaultBranch in parallel
  - Update component to show loading indicator while branches load
  - _Location: src/components/NewWorktree.tsx:60-61_
  - _Related to: Requirement 8.1, 8.2, 8.4, 7.1_

- [ ] 5. Migrate internal WorktreeService methods to Effect
- [ ] 5.1 Update `hasClaudeDirectoryInBranch()` to use Effect-based methods
  - Currently calls `getWorktrees()` on line 349
  - Currently calls `getDefaultBranch()` on lines 356, 366
  - Convert method signature to return `Effect.Effect<boolean, GitError, never>`
  - Use Effect.flatMap to compose worktrees and defaultBranch queries
  - Update all callers to handle Effect return type
  - _Location: src/services/worktreeService.ts:347_
  - _Related to: Requirement 5.1, 5.5, 3.4_

- [ ] 5.2 Update `copyClaudeDirectoryFromBaseBranch()` to use Effect-based methods
  - Currently calls `getWorktrees()` on line 384
  - Currently calls `getDefaultBranch()` on line 391
  - Method is already called within Effect.try in createWorktreeEffect
  - Use Effect.flatMap to compose worktrees and defaultBranch queries
  - Keep synchronous file operations (cpSync) within Effect.try
  - _Location: src/services/worktreeService.ts:379_
  - _Related to: Requirement 5.1, 5.5, 3.4_

- [ ] 6. Remove legacy synchronous methods from WorktreeService
- [ ] 6.1 Remove `getWorktrees()` synchronous method
  - Delete method implementation on line 62
  - Verify no remaining callers exist
  - Keep only `getWorktreesEffect()` method
  - _Location: src/services/worktreeService.ts:62_
  - _Related to: Requirement 9.5, 9.6_

- [ ] 6.2 Remove `getDefaultBranch()` synchronous method
  - Delete method implementation on line 156
  - Verify no remaining callers exist
  - Keep only `getDefaultBranchEffect()` method
  - _Location: src/services/worktreeService.ts:156_
  - _Related to: Requirement 9.5, 9.6_

- [ ] 6.3 Remove `getAllBranches()` synchronous method
  - Delete method implementation on line 190
  - Verify no remaining callers exist
  - Keep only `getAllBranchesEffect()` method
  - _Location: src/services/worktreeService.ts:190_
  - _Related to: Requirement 9.5, 9.6_

- [ ] 6.4 Update `getCurrentBranch()` visibility and documentation
  - Keep method but mark as legacy helper for internal use only
  - Add comment explaining it's only used as fallback in getWorktreesEffect
  - Consider inlining into getWorktreesEffect if it's the only caller
  - _Location: src/services/worktreeService.ts:136_
  - _Related to: Requirement 11.2_

- [ ] 6.5 Remove or migrate other private helper methods
  - Review `getAllRemotes()` on line 296 - used by resolveBranchReference
  - Review `resolveBranchReference()` on line 233 - used by createWorktreeEffect
  - Review `copyClaudeSessionData()` on line 313 - used by createWorktreeEffect
  - Determine if these need Effect versions or can remain synchronous helpers
  - Document decision in code comments
  - _Related to: Requirement 11.2_

- [ ] 7. Update tests to verify migration completeness
- [ ] 7.1 Update WorktreeService tests for new Effect-based methods
  - Add tests for `getDefaultBranchEffect()`
  - Add tests for `getAllBranchesEffect()`
  - Add tests for `getCurrentBranchEffect()`
  - Verify legacy methods are removed
  - Use Effect.runSync or Effect.runPromise for test execution
  - _Related to: Requirement 10.1, 10.2, 10.3_

- [ ] 7.2 Update hookExecutor tests for Effect composition
  - Verify executeStatusHook uses getWorktreesEffect
  - Test error handling with GitError from worktree query
  - Verify hooks don't break main flow on worktree query failure
  - _Related to: Requirement 10.1, 10.2, 6.3_

- [ ] 7.3 Update Menu component tests for Effect integration
  - Test branch loading with Effect.match pattern
  - Test error display when getDefaultBranchEffect fails
  - Verify loading state management during Effect execution
  - Test Effect composition with getWorktreesEffect
  - _Related to: Requirement 10.1, 10.2, 8.1_

- [ ] 7.4 Update NewWorktree component tests for Effect integration
  - Test branch initialization with useEffect and Effect.all
  - Test loading state display during branch queries
  - Test error handling when branch queries fail
  - Verify component behavior with empty branch list
  - _Related to: Requirement 10.1, 10.2, 8.1_

- [ ] 8. Update documentation
- [ ] 8.1 Update CLAUDE.md with final Effect patterns
  - Remove any references to legacy synchronous methods
  - Add examples of Effect.all for parallel branch queries
  - Document complete Error flow with no legacy fallbacks
  - Update "Complete Error Flow Example" to remove legacy patterns
  - _Related to: Requirement 11.2, 11.5_

- [ ] 8.2 Add migration completion notes to architecture documentation
  - Document that WorktreeService is fully Effect-based
  - Note that all try-catch blocks replaced with Effect.try
  - List any remaining synchronous helpers and justification
  - Add date of migration completion
  - _Related to: Requirement 11.2, 11.6_

- [ ] 8.3 Update JSDoc examples for new Effect-based methods
  - Ensure all Effect-returning methods have complete @example tags
  - Include both Effect.runPromise and Effect.match patterns
  - Show error discrimination with _tag property
  - Reference Effect-ts documentation links
  - _Related to: Requirement 11.3, 11.4, 11.5_

- [ ] 9. Final verification
- [ ] 9.1 Run full test suite to ensure all tests pass
  - Execute `npm test` and verify 100% pass rate
  - Check for any test warnings or deprecation notices
  - Verify no tests are skipped or pending
  - _Related to: Requirement 9.1, 10.2_

- [ ] 9.2 Search codebase for any remaining try-catch patterns
  - Run grep for `\btry\s*\{` in src/ directory (excluding tests)
  - Verify all remaining try-catch are within Effect.try calls
  - Document any legitimate try-catch usage (e.g., in test setup)
  - _Related to: Requirement 9.2_

- [ ] 9.3 Verify no legacy adapter utilities remain
  - Search for files matching `*adapter*` or `*legacy*`
  - Verify GitOperationResult type is removed
  - Check for any conversion functions between old and new patterns
  - _Related to: Requirement 9.5, 9.6_

- [ ] 9.4 Run build and verify no TypeScript errors
  - Execute `npm run build`
  - Execute `npm run typecheck`
  - Verify no compilation errors or warnings
  - _Related to: Requirement 9.1_

- [ ] 9.5 Update tasks.md to mark verification complete
  - Update task 5.5 status to fully completed
  - Add notes about remaining migration tasks completed
  - Document final state of codebase
  - _Related to: Requirement 9.1, 9.2_

## Migration Strategy

### Phase 1: Add New Effect-based Methods (Tasks 1.1-1.3)
Create Effect-based alternatives alongside existing methods to avoid breaking changes during development.

### Phase 2: Migrate Callers (Tasks 2.1-5.2)
Update all external and internal callers to use new Effect-based methods. This maintains functionality while transitioning.

### Phase 3: Remove Legacy (Tasks 6.1-6.5)
Once all callers migrated, safely remove legacy synchronous methods.

### Phase 4: Test and Document (Tasks 7.1-8.3)
Ensure quality through comprehensive testing and documentation updates.

### Phase 5: Final Verification (Tasks 9.1-9.5)
Validate complete migration success through automated checks and manual review.

## Success Criteria

- ✅ All WorktreeService public methods return Effect types
- ✅ No synchronous git operations outside Effect.try or Effect.tryPromise
- ✅ All components use Effect.runPromise or Effect.match for execution
- ✅ No legacy adapter utilities or conversion functions remain
- ✅ All tests pass with Effect-based implementations
- ✅ Documentation reflects Effect-only patterns
- ✅ Build and typecheck complete without errors
