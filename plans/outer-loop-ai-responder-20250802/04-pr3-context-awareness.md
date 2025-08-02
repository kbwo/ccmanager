# PR3: Context-Aware Intelligence

## 🎯 Goal
Make auto-pilot aware of project context to provide smarter, framework-specific guidance.

## ✨ Features Added
- 🔍 Project type detection (React, Node.js, TypeScript, etc.)
- 📁 File change awareness and git status integration
- 🛠 Framework-specific guidance patterns
- 📊 Session context building and caching
- 🎯 Targeted guidance based on project characteristics

## 📁 Implementation Approach

### New Components
- **ContextBuilder**: Analyzes project structure, package.json, git status
- **ContextPatterns**: Framework-specific guidance patterns
- **Project Context Types**: TypeScript interfaces for project metadata

### Enhancement Areas
- **AutopilotMonitor**: Initialize with project context, use in LLM prompts
- **Session Display**: Show project type and framework in session header
- **Guidance Logic**: Layer context-aware patterns before general patterns

### Context Detection
- **Project Types**: React App, Node.js API, TypeScript Project, Python, Go
- **Frameworks**: React, Vue, Next.js, Express, NestJS, Tailwind CSS
- **Git Status**: Clean/dirty, modified files count, ahead/behind status
- **Recent Files**: Most recently modified files for context

### Framework-Specific Patterns
- **React**: Hook usage, state management, performance patterns
- **TypeScript**: Type safety, generic usage, module patterns
- **Express/API**: Request validation, error handling, route organization
- **Git Workflow**: Commit suggestions, merge conflict guidance

### Context Caching
- **5-minute cache**: Avoid repeated filesystem analysis
- **Automatic refresh**: Update when git status changes
- **Graceful degradation**: Fallback to general patterns if context unavailable

## ⚙️ Configuration
- **Context Awareness**: Enable/disable project context detection
- **Framework Detection**: Toggle specific framework guidance
- **Git Integration**: Enable/disable git status awareness
- **Cache Settings**: Configure context refresh intervals

## 🧪 Testing Approach
- **Project Detection**: Test across different project types
- **Framework Accuracy**: Validate framework-specific guidance
- **Performance**: Ensure context building completes in < 1s
- **Cache Efficiency**: Verify context caching works correctly

## 📋 Acceptance Criteria
- [ ] Correctly identifies project type and frameworks
- [ ] Framework-specific guidance is relevant and helpful
- [ ] Project context visible in session header display
- [ ] Git status integration provides workflow guidance
- [ ] Context building completes in under 1 second
- [ ] Graceful fallback when context detection fails
- [ ] Context-aware guidance is more relevant than generic patterns

## 🚀 Estimated Timeline: 2 days
- **Day 1**: Context builder and project detection logic
- **Day 2**: Framework patterns and session integration