# PR1: Basic Auto-pilot Core

## 🎯 Goal
Add auto-pilot toggle functionality and basic LLM monitoring to CCManager sessions.

## ✨ Features Added
- ✈️ Auto-pilot toggle with `'p'` keystroke  
- Basic LLM watchdog that monitors Claude Code output
- Simple intervention delivery to PTY terminal
- Status indicator showing ACTIVE/STANDBY state
- Basic settings integration

## 📁 Implementation Approach

### New Components
- **AutopilotMonitor**: Core monitoring class with enable/disable, LLM analysis
- **LLMClient**: OpenAI API wrapper for analysis requests
- **Auto-pilot types**: TypeScript interfaces for decisions and configuration

### Integration Points
- **Session.tsx**: Add auto-pilot toggle, status display, and PTY output monitoring
- **Settings**: Add auto-pilot configuration options
- **Types**: Define auto-pilot interfaces and types

### Key Functionality
- **Toggle Logic**: Press 'p' to enable/disable auto-pilot monitoring
- **Output Analysis**: Debounced analysis of Claude Code PTY output (3-second delay)
- **Guidance Delivery**: Send suggestions directly to Claude Code terminal as: `✈️ Auto-pilot: [guidance]`
- **Status Display**: Show current state and guidance counter in session header

## ⚙️ Configuration
- **Environment**: Requires `OPENAI_API_KEY` environment variable
- **Settings**: Auto-pilot enabled/disabled, model selection, max guidances per hour
- **Defaults**: Disabled by default, GPT-4 model, 3 guidances/hour limit

## 🧪 Testing Approach
- **Manual Testing**: Toggle functionality, guidance delivery, status updates
- **Error Handling**: LLM API failures, invalid responses, network issues
- **Integration**: Verify no interference with existing CCManager functionality

## 📋 Acceptance Criteria
- [ ] `'p'` key toggles auto-pilot ACTIVE/STANDBY instantly
- [ ] Status indicator shows current auto-pilot state clearly
- [ ] LLM analysis provides relevant guidance for stuck/confused Claude
- [ ] Guidance appears naturally in Claude Code terminal output
- [ ] Settings integration allows configuration of auto-pilot behavior
- [ ] Graceful failure when LLM API unavailable
- [ ] No performance impact on existing CCManager functionality

## 🚀 Estimated Timeline: 3 days
- **Day 1**: Core auto-pilot monitor and LLM client
- **Day 2**: Session.tsx integration and toggle functionality  
- **Day 3**: Settings integration, testing, and polish