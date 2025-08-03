# PR3: Pattern-Based Guidance

## 🎯 Goal
Add fast pattern recognition for common Claude Code issues and smart guidance delivery.

## ✨ Features Added
- 🔍 Lightning-fast pattern detection for repetitive behavior (< 10ms)
- 🚨 Error detection and immediate guidance
- 🤔 Overthinking detection with progress nudges
- 📝 Best practice reminders for code quality
- ⚡ Dual-speed analysis: patterns (fast) + LLM (smart)
- 🎛 Smart throttling to prevent guidance spam

## 📁 Implementation Approach

### New Components
- **PatternDetector**: Fast regex-based pattern matching for common issues
- **GuidanceThrottler**: Manages guidance frequency and prevents spam
- **Pattern Library**: Curated patterns for loops, errors, overthinking, code quality

### Enhancement Areas
- **AutopilotMonitor**: Add pattern detection as first-pass analysis before LLM
- **Guidance Display**: Enhanced formatting with pattern vs LLM source indicators
- **Intervention Logic**: Multi-level priority system (critical, high, medium, low)

### Key Patterns
- **Repetitive Behavior**: Detect loops in Claude's actions
- **Error Ignoring**: Spot unaddressed errors in output
- **Analysis Paralysis**: Identify overthinking and indecision
- **Code Quality**: Debug code, TODOs, complexity issues
- **Git Workflow**: Uncommitted changes, merge conflicts

### Throttling Strategy
- **Critical patterns**: Always allowed (errors, security)
- **Regular patterns**: Max 3 per hour (configurable)
- **Pattern repetition**: Limit same pattern to 2 times
- **Minimum spacing**: 30 seconds between any guidance

## ⚙️ Configuration
- **Pattern Toggles**: Enable/disable specific pattern categories
- **Throttling Limits**: Customizable guidance frequency
- **Priority Levels**: Configure intervention urgency
- **Pattern Sensitivity**: Adjust detection thresholds

## 🧪 Testing Approach
- **Pattern Accuracy**: Validate detection of intended behaviors
- **False Positive Testing**: Ensure patterns don't trigger incorrectly
- **Performance Testing**: Verify < 10ms pattern detection time
- **Throttling Validation**: Test guidance frequency limits

## 📋 Acceptance Criteria
- [ ] Pattern detection responds in < 10ms for 70%+ of cases
- [ ] Critical patterns (errors) bypass throttling limits
- [ ] Guidance displays source: `✈️ Auto-pilot ⚡` (pattern) vs `✈️ Auto-pilot 🧠` (LLM)
- [ ] Throttling prevents more than 3 guidances per hour
- [ ] Pattern library catches common coding issues accurately
- [ ] Smart escalation to LLM when patterns don't match
- [ ] No degradation in overall system performance

## 🚀 Estimated Timeline: 2 days
- **Day 1**: Pattern detector and guidance library implementation
- **Day 2**: Throttling system and enhanced auto-pilot integration