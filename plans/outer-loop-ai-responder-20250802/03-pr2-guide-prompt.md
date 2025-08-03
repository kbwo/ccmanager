# PR2: User Guide Prompt & Self-Updating Intelligence

## 🎯 Goal
Add configurable guide prompts that learn from user interactions to provide personalized, adaptive guidance for each developer's workflow.

## ✨ Features Added
- 🎨 **Simple Guide Prompt**: Text field for custom guidance instructions
- 🧠 **Pattern Learning**: LLM-based extraction of user instruction themes
- 🔄 **Self-Updating Prompts**: Automatically evolve based on user behavior
- 🔒 **Privacy Controls**: Opt-in learning with user review and approval
- 📊 **Pattern Analysis**: Detect recurring themes in user interactions
- ⚙️ **Full User Control**: Manual override, pattern review, learning toggle

## 📁 Implementation Approach

### Phase 1: Simple Guide Prompt (Day 1)
- **AutopilotConfig Extension**: Add `guidePrompt?: string` field
- **LLMClient Enhancement**: Inject user guidance into analysis prompt
- **UI Addition**: Textarea in autopilot configuration form
- **Simple Integration**: Append guide prompt to existing analysis prompt

### Phase 2: Input Monitoring (Day 2)
- **UserInputPattern Interface**: Track user interactions with Claude
- **PatternTracker Service**: Record user inputs, context, and timing
- **Input Classification**: Categorize instructions, corrections, questions
- **Privacy-First Storage**: Configurable data retention and opt-in

### Phase 3: Pattern Learning Engine (Days 3-4)
- **PatternLearner Service**: LLM-based analysis of user interaction patterns
- **Theme Extraction**: Identify recurring preferences and workflow patterns
- **PromptEvolver Service**: Generate updated guide prompts from learned patterns
- **Confidence Scoring**: Rate pattern reliability before suggesting updates

### Phase 4: User Control & Integration (Day 5)
- **Pattern Review UI**: Show learned patterns before applying
- **Approval Workflow**: User can approve, reject, or modify suggestions
- **Learning Controls**: Toggle learning on/off, clear learned patterns
- **Transparency**: Show which guidance comes from manual vs learned prompts

## 🧠 Learning Strategy

### What Gets Monitored
```typescript
interface UserInputPattern {
  sessionId: string;
  timestamp: Date;
  input: string;
  context: string; // Recent Claude output that prompted this input
  inputType: 'instruction' | 'correction' | 'question';
  isGuidanceRelated: boolean; // LLM determines if relevant for learning
}
```

### Pattern Categories
- **Code Style**: "Use TypeScript strict mode", "Write tests first"
- **Workflow**: "Check existing utilities", "Follow project patterns"
- **Architecture**: "Keep components small", "Prefer composition"
- **Communication**: "Be more concise", "Explain your reasoning"
- **Testing**: "Test edge cases", "Mock external dependencies"

### Learning Examples
```typescript
// User frequently says: "Write tests first"
// System learns: { 
//   category: 'testing',
//   instruction: 'Emphasize test-driven development',
//   confidence: 0.85
// }

// User often corrects: "Use existing utility functions"
// System learns: {
//   category: 'workflow', 
//   instruction: 'Check for existing utilities before implementing',
//   confidence: 0.92
// }
```

## 🔒 Privacy & Control Design

### User Controls
- **Learning Toggle**: Disabled by default, clear explanation
- **Pattern Review**: See detected patterns before they're applied
- **Manual Override**: Always maintain ability to edit final prompt
- **Data Management**: Clear patterns, export/import, retention controls
- **Transparency**: Visual indicators of manual vs learned guidance sources

### Learning Approval Flow
1. System detects patterns from recent interactions
2. User receives notification: "New guidance patterns detected"
3. Review dialog shows proposed additions to guide prompt
4. User can approve all, approve some, or reject
5. Approved patterns integrated into guide prompt
6. User can always manually edit the final result

## ⚙️ Configuration Schema

### AutopilotConfig Extension
```typescript
interface AutopilotConfig {
  // ... existing fields
  guidePrompt?: string; // Manual guidance instructions
  learningConfig?: {
    enabled: boolean; // Opt-in learning
    approvalRequired: boolean; // Always true for now
    retentionDays: number; // Default 30 days
    minPatternConfidence: number; // Default 0.7
  };
}

interface LearnedPattern {
  id: string;
  category: 'style' | 'workflow' | 'testing' | 'architecture' | 'communication';
  instruction: string;
  confidence: number;
  frequency: number;
  lastSeen: Date;
  approved: boolean;
}
```

### Prompt Generation
```typescript
// Final analysis prompt structure:
const finalPrompt = `
${baseAnalysisPrompt}
${projectContext}

USER'S GUIDANCE INSTRUCTIONS:
${config.guidePrompt || 'No custom guidance provided'}

LEARNED USER PREFERENCES:
${approvedPatterns.map(p => `- ${p.instruction}`).join('\n')}

Focus guidance on these user preferences while maintaining general helpfulness.
`;
```

## 🧪 Testing Approach

### Learning Accuracy
- **Pattern Detection**: Validate correct theme extraction from sample inputs
- **False Positive Prevention**: Ensure one-off comments don't become patterns
- **Confidence Calibration**: Test that confidence scores correlate with pattern quality
- **Noise Filtering**: Verify non-guidance inputs are correctly ignored

### User Experience
- **Approval Flow**: Test pattern review and approval workflow
- **Privacy Controls**: Validate learning can be disabled/enabled cleanly
- **Performance**: Ensure pattern analysis doesn't slow down autopilot
- **Transparency**: Verify users understand source of guidance

### Integration
- **Prompt Quality**: Test that learned patterns improve guidance relevance
- **Manual Override**: Ensure user can always edit final prompt
- **Data Safety**: Test pattern storage and privacy controls

## 📋 Acceptance Criteria

### Phase 1: Simple Guide Prompt
- [ ] Guide prompt field in autopilot configuration UI
- [ ] User guidance properly injected into LLM analysis prompt
- [ ] Guide prompt persists in configuration storage
- [ ] Examples and helpful placeholder text provided

### Phase 2-4: Self-Updating Intelligence
- [ ] User inputs monitored with proper privacy controls
- [ ] LLM correctly extracts recurring patterns from user interactions
- [ ] Pattern review UI shows learned patterns before applying
- [ ] Users can approve, reject, or modify suggested patterns
- [ ] Learning can be toggled on/off with clear data implications
- [ ] Learned patterns improve guidance relevance and personalization
- [ ] Manual prompt editing always available as override
- [ ] Pattern data respects retention policies and privacy controls

## 🚀 Estimated Timeline: 5 days
- **Day 1**: Simple guide prompt implementation and UI
- **Day 2**: Input monitoring infrastructure and storage
- **Days 3-4**: Pattern learning engine and prompt evolution
- **Day 5**: User control interface and approval workflow

## 🔮 Future Enhancements
- **Cross-Session Learning**: Patterns learned across multiple projects
- **Team Pattern Sharing**: Export/import patterns between team members
- **Pattern Categories**: More granular categorization and control
- **A/B Testing**: Compare guidance effectiveness with different prompts
- **Adaptive Confidence**: Adjust learning sensitivity based on user feedback

## 🎯 Success Metrics
- **Adoption**: % of users who configure guide prompts
- **Learning Engagement**: % of users who enable pattern learning
- **Pattern Quality**: User approval rate for suggested patterns
- **Guidance Relevance**: Improved user satisfaction with autopilot suggestions
- **Personalization**: Measurable differences in guidance style per user