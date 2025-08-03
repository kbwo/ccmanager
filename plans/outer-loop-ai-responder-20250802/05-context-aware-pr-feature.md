# Context-Aware PR Auto-Pilot Design Document

## Overview

The Context-Aware PR feature enhances CCManager's auto-pilot system to automatically create well-structured pull requests that analyze session history, enforce project-specific compliance patterns, and generate meaningful PR descriptions based on Claude Code session interactions.

## Current Foundation

### ✅ Implemented Infrastructure (PR1-PR3)

**Core Auto-pilot System:**
- `autopilotMonitor.ts`: Session monitoring with LLM-based analysis
- `llmClient.ts`: Multi-provider LLM integration (OpenAI, Anthropic)
- `ConfigureAutopilot.tsx`: UI-based configuration management
- Project context reading (CLAUDE.md, README.md, package.json)
- Session history tracking with 10MB Buffer storage
- Global session orchestration across multiple projects

**Git Integration:**
- `gitStatus.ts`: File change tracking and branch status
- Worktree management with ahead/behind status
- Multi-project git repository support

## Architecture Design

### Core Components

```
Context-Aware PR System
├── Enhanced Context Intelligence
│   ├── ProjectTypeDetector
│   ├── ContextBuilder (enhanced)
│   └── SessionComplianceValidator
├── GitHub Integration Layer
│   ├── GitHubService
│   ├── PRContextBuilder
│   └── AutomatedPRWorkflow
├── Session Analysis Engine
│   ├── StructuredHistoryAnalyzer
│   ├── ChangesetSummarizer
│   └── ComplianceReporter
└── UI Integration
    ├── CreateContextAwarePR
    └── Enhanced Menu Integration
```

## Implementation Phases

### Phase 1: Enhanced Context Intelligence

#### 1.1 Project Type Detection System

**File:** `src/services/projectTypeDetector.ts`

```typescript
interface ProjectType {
  framework: 'react' | 'node' | 'typescript' | 'vue' | 'next' | 'express' | 'unknown';
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
  buildSystem: 'npm' | 'yarn' | 'pnpm' | 'webpack' | 'vite' | 'rollup';
  testFramework?: 'jest' | 'vitest' | 'mocha' | 'cypress' | 'playwright';
  patterns: ArchitecturalPattern[];
}

interface ArchitecturalPattern {
  type: 'mvc' | 'component-based' | 'microservice' | 'monorepo';
  confidence: number;
  indicators: string[];
}

class ProjectTypeDetector {
  async detectProjectType(projectPath: string): Promise<ProjectType> {
    // Analyze package.json, tsconfig.json, file structure
    // Detect framework patterns and architectural decisions
    // Return comprehensive project classification
  }

  async getCompliancePatterns(projectType: ProjectType): Promise<CompliancePattern[]> {
    // Return framework-specific compliance rules
    // Load project-specific patterns from CLAUDE.md
    // Merge with standard patterns for the detected type
  }

  async detectArchitecturalPatterns(projectPath: string): Promise<ArchitecturalPattern[]> {
    // Analyze folder structure and import patterns
    // Detect architectural decisions and conventions
    // Return confidence-scored architectural patterns
  }
}
```

**Compliance Pattern Examples:**
```typescript
const compliancePatterns = {
  react: [
    {
      id: 'react-hooks-pattern',
      pattern: /componentDidMount|componentWillMount/,
      severity: 'warning',
      message: 'Consider using React hooks instead of class lifecycle methods',
      suggestion: 'Use useEffect hook for lifecycle logic'
    },
    {
      id: 'typescript-any-usage',
      pattern: /:\s*any(?!\s*\/\/.*@ts-ignore)/,
      severity: 'error',
      message: "Avoid 'any' type - use specific types",
      autofix: true
    }
  ],
  typescript: [
    {
      id: 'console-log-production',
      pattern: /console\.log(?!\s*\/\/.*debug)/,
      severity: 'warning',
      message: 'Remove console.log statements in production code',
      autofix: true
    }
  ]
};
```

#### 1.2 Enhanced Context Builder

**File:** `src/services/contextBuilder.ts` (Enhancement)

```typescript
interface PRContext {
  projectType: ProjectType;
  sessionSummary: SessionSummary;
  changes: ChangeAnalysis;
  compliance: ComplianceReport;
  gitContext: GitContext;
  recommendations: Recommendation[];
}

interface SessionSummary {
  duration: number;
  commandsExecuted: string[];
  filesModified: string[];
  errorsEncountered: ErrorSummary[];
  testsRun: TestSummary[];
  insights: SessionInsight[];
}

class ContextBuilder {
  // Extend existing functionality
  async buildPRContext(sessionHistory: Buffer[], projectPath: string): Promise<PRContext> {
    const projectType = await this.projectDetector.detectProjectType(projectPath);
    const sessionSummary = await this.analyzeSessionHistory(sessionHistory);
    const gitContext = await this.buildGitContext(projectPath);
    const compliance = await this.validateCompliance(sessionSummary, projectType);
    
    return {
      projectType,
      sessionSummary,
      changes: await this.analyzeCodeChanges(gitContext.diff, projectType),
      compliance,
      gitContext,
      recommendations: await this.generateRecommendations(compliance, sessionSummary)
    };
  }

  async analyzeCodeChanges(gitDiff: string, projectType: ProjectType): Promise<ChangeAnalysis> {
    // Parse git diff for meaningful changes
    // Categorize changes by type (feature, bugfix, refactor, etc.)
    // Analyze impact and complexity
  }

  async validateComplianceRules(changes: ChangeAnalysis, projectType: ProjectType): Promise<ComplianceReport> {
    // Run compliance patterns against changes
    // Check against project-specific rules
    // Generate compliance score and violations
  }
}
```

#### 1.3 Session Compliance Validator

**File:** `src/services/sessionComplianceValidator.ts`

```typescript
interface ComplianceRule {
  id: string;
  pattern: RegExp | string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  category: 'security' | 'performance' | 'maintainability' | 'style';
  autofix?: boolean;
  autofixSuggestion?: string;
}

interface ComplianceViolation {
  rule: ComplianceRule;
  location: {
    file: string;
    line?: number;
    context: string;
  };
  severity: 'error' | 'warning' | 'info';
  suggested_fix?: string;
}

interface ComplianceReport {
  score: number; // 0-100
  violations: ComplianceViolation[];
  passedRules: string[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  recommendations: string[];
}

class SessionComplianceValidator {
  async validateSession(sessionHistory: Buffer[], rules: ComplianceRule[]): Promise<ComplianceReport> {
    // Parse session output for code changes and decisions
    // Apply compliance rules to identified patterns
    // Generate comprehensive compliance report
  }

  async extractViolations(output: string, rules: ComplianceRule[]): Promise<ComplianceViolation[]> {
    // Extract code snippets and file references from output
    // Match against compliance patterns
    // Return violations with context and suggestions
  }

  async suggestFixes(violations: ComplianceViolation[]): Promise<Fix[]> {
    // Generate actionable fix suggestions
    // Prioritize by severity and impact
    // Include automated fix commands where possible
  }
}
```

### Phase 2: GitHub Integration Layer

#### 2.1 GitHub Service Integration

**File:** `src/services/githubService.ts`

```typescript
interface GitHubPROptions {
  title: string;
  body: string;
  branch: string;
  baseBranch?: string;
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
}

interface PRResult {
  success: boolean;
  prNumber?: number;
  url?: string;
  error?: string;
}

class GitHubService {
  private ghCliAvailable: boolean = false;

  async validateRepository(): Promise<boolean> {
    // Check if current directory is a GitHub repository
    // Verify gh CLI is installed and authenticated
    // Return readiness status
  }

  async createPR(options: GitHubPROptions): Promise<PRResult> {
    // Use gh CLI to create pull request
    // Handle authentication and repository validation
    // Return PR creation result with URL
  }

  async getExistingPRs(branch: string): Promise<PR[]> {
    // Check for existing PRs on the branch
    // Prevent duplicate PR creation
    // Return list of existing PRs
  }

  async addLabelsFromCompliance(prNumber: number, compliance: ComplianceReport): Promise<void> {
    // Auto-add labels based on compliance score
    // Add severity-based labels for violations
    // Tag with change categories (feature, bugfix, etc.)
  }

  async updatePRDescription(prNumber: number, newDescription: string): Promise<boolean> {
    // Update PR description with enhanced context
    // Append compliance reports and session insights
    // Maintain existing description structure
  }
}
```

#### 2.2 PR Context Builder

**File:** `src/services/prContextBuilder.ts`

```typescript
interface ChangesSummary {
  newFeatures: FeatureChange[];
  bugFixes: BugFix[];
  refactoring: RefactorChange[];
  documentation: DocChange[];
  tests: TestChange[];
  dependencies: DependencyChange[];
  configuration: ConfigChange[];
}

interface SessionInsight {
  type: 'file_created' | 'file_modified' | 'test_run' | 'build_command' | 'error_fixed' | 'dependency_added';
  timestamp: Date;
  description: string;
  files: string[];
  context: string;
  impact: 'low' | 'medium' | 'high';
}

class PRContextBuilder {
  async buildFromSession(sessionHistory: Buffer[], projectPath: string): Promise<PRContext> {
    // Analyze session history for meaningful changes
    // Extract insights and categorize activities
    // Build comprehensive context for PR creation
  }

  async generateTitle(changes: ChangesSummary, sessionInsights: SessionInsight[]): Promise<string> {
    // Generate concise, descriptive PR title
    // Follow conventional commit patterns when applicable
    // Prioritize most significant changes
  }

  async generateDescription(context: PRContext): Promise<string> {
    // Generate structured PR description
    // Include change summary, compliance status, and session insights
    // Format for GitHub markdown rendering
  }

  async extractKeyChanges(sessionOutput: Buffer[]): Promise<ChangesSummary> {
    // Parse Claude Code outputs for file operations
    // Identify test runs, builds, and error resolutions
    // Categorize changes by type and impact
  }

  private formatPRDescription(context: PRContext): string {
    return `## Summary
${this.generateChangeSummary(context.changes)}

## Changes Made
${this.formatChangesList(context.sessionSummary.changes)}

## Compliance Status
${this.formatComplianceReport(context.compliance)}

## Session Insights
${this.formatSessionInsights(context.sessionSummary.insights)}

## Testing
${this.formatTestResults(context.sessionSummary.testsRun)}

---
*This PR was generated using CCManager's Context-Aware Auto-pilot*
*Session Duration: ${context.sessionSummary.duration}ms*
*Compliance Score: ${context.compliance.score}/100*`;
  }
}
```

#### 2.3 Automated PR Workflow

**File:** `src/services/automatedPRWorkflow.ts`

```typescript
interface PRCreationOptions {
  sessionId: string;
  title?: string;
  description?: string;
  draft?: boolean;
  baseBranch?: string;
  skipValidation?: boolean;
}

interface PRCreationResult {
  success: boolean;
  prNumber?: number;
  url?: string;
  context: PRContext;
  validationResults: ValidationResult[];
  error?: string;
}

class AutomatedPRWorkflow {
  async createContextAwarePR(options: PRCreationOptions): Promise<PRCreationResult> {
    // Validate pre-conditions (git status, session state)
    // Build comprehensive PR context from session
    // Create GitHub PR with generated content
    // Return creation result with full context
  }

  async validatePreConditions(worktreePath: string): Promise<ValidationResult[]> {
    // Check git status (uncommitted changes, branch status)
    // Verify GitHub repository and authentication
    // Validate session readiness for PR creation
    // Check for existing PRs on current branch
  }

  async coordinateMultiSessionPR(sessionIds: string[]): Promise<PRCreationResult> {
    // Combine insights from multiple related sessions
    // Merge compliance reports and change summaries
    // Create unified PR context from multiple sources
    // Handle complex multi-session workflows
  }

  private async prepareGitContext(worktreePath: string): Promise<GitContext> {
    // Get current branch and commit status
    // Generate comprehensive diff for analysis
    // Check ahead/behind status with remote
    // Validate branch readiness for PR
  }
}
```

### Phase 3: Session Analysis Engine

#### 3.1 Structured History Analyzer

**File:** `src/services/structuredHistoryAnalyzer.ts`

```typescript
interface FileOperation {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  timestamp: Date;
  context: string;
  linesChanged?: number;
}

interface TestResult {
  framework: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  files: string[];
}

interface ErrorPattern {
  type: 'syntax' | 'type' | 'runtime' | 'build' | 'test';
  message: string;
  file?: string;
  line?: number;
  resolved: boolean;
  resolution?: string;
}

class StructuredHistoryAnalyzer {
  async parseSessionOutput(history: Buffer[]): Promise<SessionInsight[]> {
    // Convert Buffer arrays to analyzable text
    // Extract structured information from Claude Code outputs
    // Identify patterns and significant events
    // Return chronological insights with context
  }

  async extractFileOperations(output: string): Promise<FileOperation[]> {
    // Parse file creation, modification, and deletion events
    // Extract file paths and change contexts
    // Identify significant file operations vs minor edits
  }

  async identifyTestResults(output: string): Promise<TestResult[]> {
    // Parse test framework outputs (Jest, Vitest, etc.)
    // Extract test counts, durations, and file coverage
    // Identify test patterns and coverage improvements
  }

  async detectErrorPatterns(output: string): Promise<ErrorPattern[]> {
    // Identify error messages and resolution patterns
    // Track error-to-resolution sequences
    // Categorize error types and common solutions
  }

  private parseClaudeCodeOutput(output: string): ParsedOutput {
    // Parse Claude Code specific output patterns
    // Extract file content blocks and command results
    // Identify Claude's analysis and recommendations
  }
}
```

#### 3.2 Changeset Summarizer

**File:** `src/services/changesetSummarizer.ts`

```typescript
interface FeatureChange {
  description: string;
  files: string[];
  complexity: 'low' | 'medium' | 'high';
  impact: string[];
}

interface BugFix {
  issue: string;
  solution: string;
  files: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

class ChangesetSummarizer {
  async summarizeChanges(insights: SessionInsight[], gitDiff: string): Promise<ChangesSummary> {
    // Combine session insights with git diff analysis
    // Categorize changes by type and significance
    // Generate human-readable change descriptions
  }

  async generateHumanReadableDescription(summary: ChangesSummary): Promise<string> {
    // Convert technical changes to readable descriptions
    // Prioritize changes by impact and user relevance
    // Format for PR description consumption
  }

  async categorizeChanges(fileChanges: FileChange[], insights: SessionInsight[]): Promise<ChangeCategory[]> {
    // Analyze file changes in context of session activities
    // Determine change intent (feature, fix, refactor, etc.)
    // Assess change impact and complexity
  }

  private inferChangeIntent(operations: FileOperation[], sessionContext: string): ChangeIntent {
    // Use session context to understand change motivation
    // Differentiate between planned vs reactive changes
    // Identify change patterns and development approach
  }
}
```

### Phase 4: UI Integration

#### 4.1 PR Creation UI Components

**File:** `src/components/CreateContextAwarePR.tsx`

```tsx
interface PRPreview {
  title: string;
  description: string;
  compliance: ComplianceReport;
  changes: ChangesSummary;
  validationResults: ValidationResult[];
}

interface CreateContextAwarePRProps {
  sessionId: string;
  onBack: () => void;
  onComplete: (result: PRCreationResult) => void;
}

const CreateContextAwarePR: React.FC<CreateContextAwarePRProps> = ({
  sessionId,
  onBack,
  onComplete
}) => {
  const [preview, setPreview] = useState<PRPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Generate PR preview from session context
  useEffect(() => {
    generatePRPreview();
  }, [sessionId]);

  // Keyboard shortcuts for navigation and actions
  useInput((input, key) => {
    const shortcuts = shortcutManager.getShortcuts();
    
    if (shortcutManager.matchesShortcut(shortcuts.back, input, key)) {
      onBack();
    }
    
    if (key.return && !editMode && preview) {
      createPR();
    }
    
    if (input === 'e' && !editMode) {
      setEditMode(true);
    }
  });

  const generatePRPreview = async () => {
    // Build PR context from session history
    // Generate title and description
    // Validate compliance and readiness
  };

  const createPR = async () => {
    // Create GitHub PR with generated context
    // Handle success/failure scenarios
    // Return to session or show result
  };

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text>Analyzing session for PR context...</Text>
        <Spinner type="dots" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Context-Aware PR Creation</Text>
      <Text dimColor>Session: {sessionId}</Text>
      
      {preview && (
        <>
          <Box marginY={1}>
            <Text bold>Title:</Text>
            <Text>{editMode ? '[Editable]' : preview.title}</Text>
          </Box>
          
          <Box marginY={1}>
            <Text bold>Compliance Score:</Text>
            <Text color={preview.compliance.score >= 80 ? 'green' : 'yellow'}>
              {preview.compliance.score}/100
            </Text>
          </Box>
          
          <Box marginY={1}>
            <Text bold>Changes Summary:</Text>
            {/* Render changes summary */}
          </Box>
          
          <Box marginY={1}>
            <Text dimColor>
              Press Enter to create PR, 'e' to edit, 'b' to go back
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
};
```

#### 4.2 Enhanced Menu Integration

**File:** `src/components/Menu.tsx` (Enhancement)

```tsx
// Add new menu options for context-aware PR creation
const enhancedMenuItems = [
  // ... existing items
  {
    label: '📝 Create Context-Aware PR',
    value: 'create-context-pr',
    disabled: !hasActiveSession || !isGitRepository
  },
  {
    label: '📊 View Session Compliance',
    value: 'view-compliance',
    disabled: !hasActiveSession
  }
];

// Add compliance indicators to session status
const renderSessionStatus = (session: Session) => {
  const complianceIndicator = session.compliance 
    ? ` (${session.compliance.score}/100)`
    : '';
    
  return `${session.status}${complianceIndicator}`;
};
```

## Integration Points

### With Existing Auto-pilot System

1. **Session Monitoring Enhancement:**
   - Extend `autopilotMonitor.ts` to track PR-relevant activities
   - Add compliance validation to session state changes
   - Integrate with existing LLM analysis pipeline

2. **Context Builder Integration:**
   - Enhance existing `contextBuilder.ts` with PR-specific context
   - Leverage existing project context reading capabilities
   - Extend with framework detection and compliance patterns

3. **Configuration Integration:**
   - Add PR creation settings to existing auto-pilot configuration
   - Integrate GitHub authentication with existing config system
   - Extend keyboard shortcuts for PR creation actions

### With Session Management

1. **Session State Integration:**
   - Track PR readiness as part of session state
   - Coordinate PR creation across multiple sessions
   - Integrate with existing session lifecycle management

2. **History Tracking Enhancement:**
   - Extend existing Buffer-based history storage
   - Add structured analysis to session output tracking
   - Integrate with global session orchestrator

### With Git Integration

1. **Enhanced Git Operations:**
   - Extend `gitStatus.ts` with PR-specific git analysis
   - Add branch readiness validation
   - Integrate with existing worktree management

2. **Multi-Project Support:**
   - Coordinate PR creation across different repositories
   - Handle multi-project session scenarios
   - Integrate with existing project discovery system

## Error Handling & Fallbacks

### GitHub Integration Failures
- **GitHub API unavailable:** Generate PR context locally, provide manual creation guide
- **Authentication issues:** Prompt for `gh auth login`, provide setup instructions
- **Repository not found:** Validate git remote, guide user to repository setup

### Compliance Analysis Failures
- **LLM service unavailable:** Fall back to rule-based compliance checking
- **Pattern matching errors:** Continue with warnings, don't block PR creation
- **Context building failures:** Use basic git diff analysis as fallback

### Session Analysis Failures
- **History parsing errors:** Fall back to git diff analysis
- **Insufficient session data:** Prompt user for manual PR description
- **Multi-session coordination failures:** Create individual PRs with notes about coordination

## Testing Strategy

### Unit Testing
```typescript
// Test each service component in isolation
describe('ProjectTypeDetector', () => {
  it('should detect React TypeScript projects', async () => {
    // Mock file system with React project structure
    // Verify correct project type detection
  });
});

describe('PRContextBuilder', () => {
  it('should generate meaningful PR descriptions', async () => {
    // Mock session history with file operations
    // Verify PR description quality and structure
  });
});
```

### Integration Testing
```typescript
// Test end-to-end PR creation workflow
describe('Context-Aware PR Creation', () => {
  it('should create PR from session history', async () => {
    // Mock complete session with changes
    // Mock GitHub API responses
    // Verify PR creation with correct context
  });
});
```

### Mock GitHub Integration
```typescript
// Mock gh CLI for testing without actual GitHub calls
const mockGitHubService = {
  createPR: jest.fn().mockResolvedValue({
    success: true,
    prNumber: 123,
    url: 'https://github.com/user/repo/pull/123'
  })
};
```

## Security Considerations

### API Key Management
- Store GitHub tokens securely using existing config system
- Validate API permissions before PR creation
- Handle token expiration gracefully

### Code Analysis Security
- Sanitize session output before LLM analysis
- Avoid exposing sensitive information in PR descriptions
- Validate generated content before GitHub submission

### Permission Validation
- Verify repository write permissions before PR creation
- Check branch protection rules compatibility
- Validate user authorization for repository operations

## Performance Optimization

### Session History Analysis
- Implement streaming analysis for large session histories
- Use efficient Buffer parsing to minimize memory usage
- Cache compliance patterns and project type detection

### LLM Integration
- Batch compliance analysis requests
- Implement response caching for similar session patterns
- Use token-efficient prompts for PR description generation

### GitHub API Efficiency
- Minimize API calls through batched operations
- Cache repository metadata and branch information
- Implement rate limiting to respect GitHub API limits

## Future Enhancements

### Advanced Context Features
- **Multi-repository PR coordination:** Handle changes spanning multiple repositories
- **Dependency impact analysis:** Analyze and document dependency changes
- **Performance impact assessment:** Identify and report performance implications

### Enhanced Automation
- **Auto-reviewer assignment:** Suggest reviewers based on file changes and project structure
- **Automated testing integration:** Trigger CI/CD pipelines with context-aware parameters
- **Release note generation:** Auto-generate release notes from PR context

### Compliance Extensions
- **Custom rule engines:** Allow projects to define custom compliance patterns
- **Security vulnerability detection:** Integrate with security scanning tools
- **Code quality metrics:** Track and report code quality improvements

This design provides a comprehensive foundation for implementing context-aware PR creation that leverages CCManager's existing auto-pilot infrastructure while adding sophisticated session analysis, compliance enforcement, and GitHub integration capabilities.