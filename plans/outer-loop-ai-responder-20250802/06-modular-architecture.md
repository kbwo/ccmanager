# Auto-pilot Modular Architecture

## 🏗 Design Philosophy

**Modular & Portable**: Auto-pilot designed as a reusable component that can integrate with any PTY-based terminal application (not just CCManager).

**Layered Intelligence**: Configurable intelligence layers that can be enabled/disabled and extended with plugins.

## 🧩 Modular Component Structure

### Core Auto-pilot Engine (Portable)
```
src/autopilot/                     # Standalone auto-pilot engine
├── core/                          # Core engine (app-agnostic)
│   ├── autopilot-engine.ts        # Main engine interface
│   ├── session-adapter.ts         # Abstract session interface
│   ├── intelligence-manager.ts    # Layered intelligence coordinator
│   └── guidance-formatter.ts      # Output formatting
├── intelligence/                   # Intelligence layers (pluggable)
│   ├── layer-1-patterns.ts        # Fast pattern recognition
│   ├── layer-2-context.ts         # Context-aware analysis  
│   ├── layer-3-llm.ts            # LLM-powered insights
│   └── intelligence-layer.ts      # Base intelligence interface
├── providers/                     # External service providers
│   ├── llm-provider.ts            # Abstract LLM interface
│   ├── openai-provider.ts         # OpenAI implementation
│   └── claude-provider.ts         # Anthropic Claude implementation
├── adapters/                      # App-specific adapters
│   ├── ccmanager-adapter.ts       # CCManager integration
│   ├── vscode-adapter.ts          # VS Code terminal integration
│   └── generic-pty-adapter.ts     # Generic PTY application
└── plugins/                       # Extensible plugin system
    ├── plugin-interface.ts        # Plugin base interface
    ├── react-patterns.ts          # React-specific patterns
    ├── typescript-patterns.ts     # TypeScript patterns
    └── git-workflow.ts            # Git workflow intelligence
```

### CCManager Integration Layer (App-Specific)
```
src/components/                    # CCManager UI components
├── AutopilotToggle.tsx           # Reusable toggle component
├── AutopilotStatus.tsx           # Status display component
└── Session.tsx                   # Enhanced with auto-pilot

src/services/                     # CCManager services
├── autopilot-service.ts          # CCManager-specific service
└── settings.ts                   # Settings integration
```

## 🔌 Clean Integration API

### Core Auto-pilot Engine Interface
```typescript
// src/autopilot/core/autopilot-engine.ts
export class AutopilotEngine {
  constructor(
    private adapter: SessionAdapter,
    private config: AutopilotConfig = DEFAULT_CONFIG
  ) {}

  // Main lifecycle methods
  async initialize(): Promise<void>
  async start(sessionId: string): Promise<void>
  async stop(sessionId: string): Promise<void>
  async destroy(): Promise<void>

  // Intelligence management
  enableLayer(layer: IntelligenceLayer): void
  disableLayer(layerType: string): void
  addPlugin(plugin: AutopilotPlugin): void

  // Event handling
  on(event: AutopilotEvent, handler: EventHandler): void
  off(event: AutopilotEvent, handler: EventHandler): void

  // Configuration
  updateConfig(config: Partial<AutopilotConfig>): void
  getStatus(sessionId: string): AutopilotStatus
}
```

### Session Adapter Interface (App-Agnostic)
```typescript
// src/autopilot/core/session-adapter.ts
export interface SessionAdapter {
  // Session management
  getSessionInfo(sessionId: string): Promise<SessionInfo>
  
  // Output monitoring
  subscribeToOutput(sessionId: string, callback: OutputCallback): Promise<void>
  unsubscribeFromOutput(sessionId: string): Promise<void>
  
  // Guidance delivery
  sendGuidance(sessionId: string, guidance: FormattedGuidance): Promise<void>
  
  // Context gathering
  getProjectContext(sessionPath: string): Promise<ProjectContext>
  getGitStatus(sessionPath: string): Promise<GitStatus>
  
  // UI integration
  updateStatus(sessionId: string, status: AutopilotStatus): Promise<void>
}

export interface SessionInfo {
  id: string;
  path: string;
  type: 'coding' | 'terminal' | 'repl';
  language?: string;
  framework?: string[];
}
```

### Intelligence Layer Interface (Pluggable)
```typescript
// src/autopilot/intelligence/intelligence-layer.ts
export interface IntelligenceLayer {
  name: string;
  priority: number;
  enabled: boolean;
  
  // Analysis methods
  canAnalyze(context: AnalysisContext): boolean
  analyze(output: string, context: AnalysisContext): Promise<GuidanceDecision>
  
  // Learning and adaptation
  learn(feedback: GuidanceFeedback): Promise<void>
  
  // Configuration
  configure(config: LayerConfig): void
  getMetrics(): LayerMetrics
}

export interface AnalysisContext {
  sessionInfo: SessionInfo;
  projectContext: ProjectContext;
  recentHistory: string[];
  userPreferences: UserPreferences;
}
```

## 🎯 CCManager Integration Example

### Simple Integration in Session Component
```typescript
// src/components/Session.tsx
import { AutopilotEngine } from '@/autopilot/core/autopilot-engine';
import { CCManagerAdapter } from '@/autopilot/adapters/ccmanager-adapter';

const Session: React.FC<SessionProps> = ({ sessionId, worktreePath }) => {
  const [autopilot] = useState(() => new AutopilotEngine(
    new CCManagerAdapter(sessionId, worktreePath),
    userSettings.autopilot
  ));

  // Simple toggle
  const toggleAutopilot = useCallback(async () => {
    if (autopilot.getStatus(sessionId).active) {
      await autopilot.stop(sessionId);
    } else {
      await autopilot.start(sessionId);
    }
  }, [autopilot, sessionId]);

  // Listen for status updates
  useEffect(() => {
    autopilot.on('statusChanged', (status) => {
      setAutopilotStatus(status);
    });
    
    autopilot.on('guidanceProvided', (guidance) => {
      // Guidance is automatically sent via adapter
      incrementGuidanceCounter();
    });
  }, []);

  return (
    <Box flexDirection="column">
      <AutopilotStatus 
        status={autopilotStatus} 
        onToggle={toggleAutopilot} 
      />
      {/* Rest of session UI */}
    </Box>
  );
};
```

### CCManager Adapter Implementation
```typescript
// src/autopilot/adapters/ccmanager-adapter.ts
export class CCManagerAdapter implements SessionAdapter {
  constructor(
    private sessionId: string,
    private worktreePath: string,
    private ptyRef: RefObject<IPty>
  ) {}

  async sendGuidance(sessionId: string, guidance: FormattedGuidance): Promise<void> {
    const formatted = `\n\n${guidance.icon} ${guidance.prefix}: ${guidance.message}\n\n`;
    this.ptyRef.current?.write(formatted);
  }

  async getProjectContext(sessionPath: string): Promise<ProjectContext> {
    return await ContextBuilder.buildContext(sessionPath);
  }

  // ... other adapter methods
}
```

## 🔧 Configuration System

### Layered Configuration
```typescript
export interface AutopilotConfig {
  // Global settings
  enabled: boolean;
  maxGuidancePerHour: number;
  
  // Provider settings
  llmProvider: 'openai' | 'anthropic' | 'custom';
  providerConfig: ProviderConfig;
  
  // Intelligence layers
  layers: {
    patterns: PatternLayerConfig;
    context: ContextLayerConfig;
    llm: LLMLayerConfig;
  };
  
  // UI preferences
  ui: {
    icon: string;
    prefix: string;
    colors: ColorConfig;
  };
  
  // Plugin configuration
  plugins: PluginConfig[];
}
```

### Plugin Configuration Example
```typescript
export interface PluginConfig {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

// Example: React patterns plugin
const reactPatternsPlugin: PluginConfig = {
  name: 'react-patterns',
  enabled: true,
  config: {
    detectHookMisuse: true,
    suggestMemoization: true,
    enforcePropsTypes: false
  }
};
```

## 🚀 Portability Benefits

### Easy Integration with Other Apps
```typescript
// VS Code terminal integration example
const vscodeAutopilot = new AutopilotEngine(
  new VSCodeAdapter(terminal),
  vscodeSettings.autopilot
);

// Generic PTY app integration
const genericAutopilot = new AutopilotEngine(
  new GenericPTYAdapter(ptyProcess),
  defaultConfig
);
```

### Reusable Intelligence Layers
```typescript
// Same intelligence layers work across all apps
autopilot.enableLayer(new PatternIntelligence());
autopilot.enableLayer(new ContextIntelligence());
autopilot.enableLayer(new LLMIntelligence(openaiProvider));

// App-specific plugins
autopilot.addPlugin(new ReactPatternsPlugin());
autopilot.addPlugin(new TypeScriptPlugin());
```

## 📦 NPM Package Structure

### Standalone Package
```json
{
  "name": "@autopilot/core",
  "version": "1.0.0",
  "description": "Intelligent auto-pilot for terminal applications",
  "main": "dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./adapters": "./dist/adapters/index.js",
    "./intelligence": "./dist/intelligence/index.js",
    "./plugins": "./dist/plugins/index.js"
  },
  "peerDependencies": {
    "react": "^18.0.0"  // Only for UI components
  }
}
```

### Integration Package
```json
{
  "name": "@autopilot/ccmanager",
  "version": "1.0.0", 
  "description": "CCManager integration for auto-pilot",
  "dependencies": {
    "@autopilot/core": "^1.0.0"
  }
}
```

This modular approach makes auto-pilot:
- **Portable**: Easy to integrate with any PTY-based app
- **Extensible**: Plugin system for custom intelligence
- **Configurable**: Layered intelligence that can be tuned
- **Maintainable**: Clean separation of concerns
- **Testable**: Each layer can be tested independently

Would you like me to plan the additional PRs that build on this modular foundation?