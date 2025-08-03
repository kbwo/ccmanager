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
- **LLMClient**: Vercel AI SDK wrapper with multi-provider support (OpenAI, Anthropic)
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
- **Environment**: Requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable
- **Settings**: Auto-pilot enabled/disabled, provider selection, model selection, max guidances per hour
- **Defaults**: Disabled by default, OpenAI provider, GPT-4 model, 3 guidances/hour limit
- **Provider Support**: OpenAI (GPT-4, GPT-4o, GPT-3.5-turbo) and Anthropic (Claude-3.5-Sonnet, Claude-3.5-Haiku, etc.)

## 🧪 Testing Approach
- **Manual Testing**: Toggle functionality, guidance delivery, status updates
- **Error Handling**: LLM API failures, invalid responses, network issues
- **Integration**: Verify no interference with existing CCManager functionality

## 📋 Acceptance Criteria
- [x] `'p'` key toggles auto-pilot ACTIVE/STANDBY instantly
- [x] Status indicator shows current auto-pilot state clearly
- [x] LLM analysis provides relevant guidance for stuck/confused Claude
- [x] Guidance appears naturally in Claude Code terminal output
- [x] Settings integration allows configuration of auto-pilot behavior
- [x] Graceful failure when LLM API unavailable
- [x] No performance impact on existing CCManager functionality
- [x] Multi-provider support (OpenAI and Anthropic)
- [x] Runtime provider switching capability
- [x] Comprehensive test coverage (254 tests passing)

## ✅ Implementation Status: **COMPLETED**

**Enhanced Implementation Details:**
- **Vercel AI SDK Integration**: Superior provider abstraction and type safety
- **Multi-Provider Support**: OpenAI and Anthropic with easy switching
- **Production Ready**: Full test coverage and error handling
- **Extensible Architecture**: Easy to add new providers and features

## 🚀 Estimated Timeline: 3 days
- **Day 1**: Core auto-pilot monitor and LLM client
- **Day 2**: Session.tsx integration and toggle functionality  
- **Day 3**: Settings integration, testing, and polish