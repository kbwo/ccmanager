# Auto-pilot Implementation Documentation

## Overview

The Auto-pilot feature provides intelligent LLM-based monitoring and guidance for Claude Code sessions in CCManager. It uses Vercel's AI SDK for unified LLM provider support and delivers contextual suggestions when Claude gets stuck or confused.

## Architecture

### Core Components

```typescript
// Auto-pilot monitoring and orchestration
AutopilotMonitor: Core monitoring class with enable/disable, LLM analysis
LLMClient: Vercel AI SDK wrapper with multi-provider support
AutopilotConfig: TypeScript configuration interface
AutopilotDecision: LLM analysis result structure
```

### LLM Provider System

The implementation uses **Vercel AI SDK** for superior LLM provider abstraction:

```typescript
// Supported providers
type SupportedProvider = 'openai' | 'anthropic';

// Provider configuration
const PROVIDERS: Record<SupportedProvider, ProviderInfo> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4.1', 'o4-mini', 'o3'],
    createModel: (model: string) => openai(model),
    requiresKey: 'OPENAI_API_KEY',
  },
  anthropic: {
    name: 'Anthropic', 
    models: ['claude-4-sonnet', 'claude-4-opus'],
    createModel: (model: string) => anthropic(model),
    requiresKey: 'ANTHROPIC_API_KEY',
  },
};
```

### Key Advantages of Vercel AI SDK

1. **Unified Interface**: Single API for multiple providers
2. **Type Safety**: Full TypeScript support with proper typing
3. **Error Handling**: Built-in retry logic and error management
4. **Provider Abstraction**: Easy to add new providers
5. **Streaming Support**: Ready for future streaming implementations
6. **Standardized Models**: Consistent model interface across providers

## Implementation Details

### Auto-pilot Monitor

```typescript
export class AutopilotMonitor extends EventEmitter {
  private llmClient: LLMClient;
  private config: AutopilotConfig;
  private analysisTimer?: NodeJS.Timeout;

  constructor(config: AutopilotConfig) {
    super();
    this.config = config;
    this.llmClient = new LLMClient(config);
  }

  // Enable/disable monitoring with rate limiting
  enable(session: Session): void
  disable(session: Session): void
  toggle(session: Session): boolean

  // Configuration updates
  updateConfig(config: AutopilotConfig): void
}
```

### LLM Client with Provider Switching

```typescript
export class LLMClient {
  private config: AutopilotConfig;

  // Easy provider switching
  updateConfig(config: AutopilotConfig): void {
    this.config = config;
  }

  // Provider availability checking with config-first approach
  isAvailable(): boolean {
    const provider = PROVIDERS[this.config.provider];
    if (!provider) return false;
    
    const apiKey = this.getApiKeyForProvider(this.config.provider);
    return Boolean(apiKey);
  }
  
  private getApiKeyForProvider(provider: SupportedProvider): string | undefined {
    // First check config, then fall back to environment variables
    const configKey = this.config.apiKeys?.[provider];
    if (configKey) return configKey;
    
    const envKey = process.env[PROVIDERS[provider].requiresKey];
    return envKey;
  }

  // Unified analysis interface
  async analyzeClaudeOutput(output: string): Promise<AutopilotDecision> {
    const provider = PROVIDERS[this.config.provider];
    const model = provider.createModel(this.config.model);
    
    const {text} = await generateText({
      model,
      prompt: this.buildAnalysisPrompt(output),
      temperature: 0.3,
    });

    return JSON.parse(text) as AutopilotDecision;
  }
}
```

### Configuration Schema

```typescript
interface AutopilotConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic';  // Easy provider switching
  model: string;                     // Provider-specific model names
  maxGuidancesPerHour: number;       // Automatic rate limiting (not user-configurable)
  analysisDelayMs: number;           // Automatic analysis debouncing (not user-configurable)
}

// Default configuration with sensible built-in limits
{
  enabled: false,
  provider: 'openai',
  model: 'gpt-4.1',
  maxGuidancesPerHour: 3,    // Automatic: prevents overuse
  analysisDelayMs: 3000,     // Automatic: waits for stable output
}
```

### User-Configurable Settings

The autopilot UI exposes only the essential user decisions:

1. **Enable/Disable** - Master on/off switch
2. **Provider** - Choose between OpenAI and Anthropic  
3. **Model** - Select specific model within chosen provider

Rate limiting and analysis delay use sensible defaults automatically to provide a smooth experience without overwhelming users with technical configuration.

## Integration Points

### Session Component Integration

```typescript
// Session.tsx integration
const handleStdinData = (data: string) => {
  // Auto-pilot toggle with Ctrl+p key
  if (data === '\u0010' && autopilotMonitorRef.current) {
    const monitor = autopilotMonitorRef.current;
    if (monitor.isLLMAvailable()) {
      const isActive = monitor.toggle(session);
      const status = isActive ? 'ACTIVE' : 'STANDBY';
      const message = `✈️ Auto-pilot: ${status}\n`;
      session.process.write(message);
    } else {
      const message = '✈️ Auto-pilot: API key required\n';
      session.process.write(message);
    }
    return;
  }
  
  // Normal input processing...
};
```

### Configuration Manager Integration

```typescript
// Configuration persistence and defaults
getAutopilotConfig(): AutopilotConfig {
  return this.config.autopilot || {
    enabled: false,
    provider: 'openai',
    model: 'gpt-4.1',
    maxGuidancesPerHour: 3,
    analysisDelayMs: 3000,
  };
}

setAutopilotConfig(autopilotConfig: AutopilotConfig): void {
  this.config.autopilot = autopilotConfig;
  this.saveConfig();
}
```

## API Key Configuration

### CCManager Config File (Recommended)

CCManager stores API keys in its configuration file for integrated user experience:

```typescript
// AutopilotConfig interface includes API keys
interface AutopilotConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic';
  model: string;
  maxGuidancesPerHour: number;
  analysisDelayMs: number;
  apiKeys: {
    openai?: string;
    anthropic?: string;
  };
}
```

**Configuration file locations:**
- **macOS/Linux**: `~/.config/ccmanager/config.json`
- **Windows**: `%APPDATA%/ccmanager/config.json`

### API Key Priority

CCManager checks for API keys in this order:
1. **First priority**: Keys from CCManager config file
2. **Fallback**: Environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)

### UI-Based Configuration

**Setting API keys through CCManager UI:**
1. Launch CCManager and press 'C' for Configuration
2. Select 'Configure Autopilot'
3. Press 'O' for OpenAI key or 'A' for Anthropic key
4. Enter your API key and press Enter

**Implementation Details:**
- Keys are checked via `LLMClient.hasAnyProviderKeys(config)`
- UI automatically detects available providers based on config and env vars
- No keys = Autopilot shows as "DISABLED"
- Config keys override environment variables when present

### Getting API Keys

**OpenAI API Key:**
1. Visit [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create account or sign in
3. Generate new secret key
4. Enter into CCManager's Autopilot configuration

**Anthropic API Key:**
1. Visit [console.anthropic.com](https://console.anthropic.com/)
2. Create account or sign in
3. Navigate to API Keys section
4. Create new key
5. Enter into CCManager's Autopilot configuration

### Environment Variables (Fallback)

For users who prefer environment variables:

```bash
# Set up API keys (choose one or both)
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-anthropic-key"

# Add to shell profile for persistence
echo 'export OPENAI_API_KEY="your-key-here"' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY="your-key-here"' >> ~/.bashrc
```

## Usage Examples

### Basic Usage

```bash
# Start CCManager
npx ccmanager

# Configure API keys through UI:
# 1. Press 'C' for Configuration
# 2. Select 'Configure Autopilot'
# 3. Press 'O' for OpenAI key or 'A' for Anthropic key
# 4. Enter your API key and press Enter

# Alternative: Use environment variables as fallback
export OPENAI_API_KEY="your-openai-key" 
export ANTHROPIC_API_KEY="your-anthropic-key"

# Access Autopilot via main menu (P key) or Configuration → Configure Autopilot
# ⚡ Autopilot: ON/OFF/DISABLED based on API key availability
```

### Provider Switching

```typescript
// Runtime provider switching
const newConfig: AutopilotConfig = {
  enabled: true,
  provider: 'anthropic',  // Switch from OpenAI to Anthropic
  model: 'claude-4-sonnet',
  maxGuidancesPerHour: 3,  // Automatic defaults
  analysisDelayMs: 3000,   // Automatic defaults
};

autopilotMonitor.updateConfig(newConfig);
```

### Available Providers Check

```typescript
// Check which providers are available
const available = LLMClient.getAvailableProviders();
// Returns: [
//   { name: 'OpenAI', models: [...], available: true },
//   { name: 'Anthropic', models: [...], available: false }
// ]
```

## Benefits of Current Implementation

### 1. **Easy LLM Switching**
- Runtime provider switching without restart
- Automatic model validation per provider
- Clear error messages for unsupported configurations

### 2. **Robust Error Handling**
- Graceful degradation when APIs unavailable
- Clear error messages for debugging
- Rate limiting to prevent API abuse

### 3. **Extensible Architecture**
- Simple to add new providers via Vercel AI SDK
- Clean separation of concerns
- Event-driven architecture for UI updates

### 4. **Production Ready**
- Comprehensive test coverage (254 tests passing)
- TypeScript type safety throughout
- No performance impact on existing functionality

## Future Extensions

### Adding New Providers

```typescript
// Easy to add new providers via Vercel AI SDK
import {google} from '@ai-sdk/google';

const PROVIDERS = {
  // ... existing providers
  google: {
    name: 'Google',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    createModel: (model: string) => google(model),
    requiresKey: 'GOOGLE_API_KEY',
  },
};
```

### Enhanced Features

- **Streaming Analysis**: Real-time guidance delivery
- **Custom Prompts**: User-configurable analysis prompts
- **Learning System**: Adapt suggestions based on user feedback
- **Multi-Session Coordination**: Cross-session intelligence sharing

## Testing Strategy

### Comprehensive Test Coverage

- **Unit Tests**: All core components (LLMClient, AutopilotMonitor)
- **Integration Tests**: Session component integration
- **Provider Tests**: Multiple provider scenarios
- **Error Handling**: API failures, invalid configurations
- **Mock Strategy**: Vercel AI SDK mocked for reliable testing

### Test Results

```
Test Files  20 passed (20)
Tests       254 passed | 3 skipped (257)
```

## Conclusion

The auto-pilot implementation leverages Vercel AI SDK to provide a robust, extensible, and production-ready LLM monitoring system. The architecture supports easy provider switching, comprehensive error handling, and future enhancements while maintaining excellent test coverage and performance.