# {{Game Title}} Game Architecture Document

[[LLM: This template creates a comprehensive game architecture document specifically for Phaser 3 + TypeScript projects. This should provide the technical foundation for all game development stories and epics.

If available, review any provided documents: Game Design Document (GDD), Technical Preferences. This architecture should support all game mechanics defined in the GDD.]]

## Introduction

[[LLM: Establish the document's purpose and scope for game development]]

This document outlines the complete technical architecture for {{Game Title}}, a 2D game built with Phaser 3 and TypeScript. It serves as the technical foundation for AI-driven game development, ensuring consistency and scalability across all game systems.

This architecture is designed to support the gameplay mechanics defined in the Game Design Document while maintaining 60 FPS performance and cross-platform compatibility.

### Change Log

[[LLM: Track document versions and changes]]

| Date | Version | Description | Author |
| :--- | :------ | :---------- | :----- |

## Technical Overview

[[LLM: Present all subsections together, then apply `tasks#advanced-elicitation` protocol to the complete section.]]

### Architecture Summary

[[LLM: Provide a comprehensive overview covering:

- Game engine choice and configuration
- Project structure and organization
- Key systems and their interactions
- Performance and optimization strategy
- How this architecture achieves GDD requirements]]

### Platform Targets

[[LLM: Based on GDD requirements, confirm platform support]]

**Primary Platform:** {{primary_platform}}
**Secondary Platforms:** {{secondary_platforms}}
**Minimum Requirements:** {{min_specs}}
**Target Performance:** 60 FPS on {{target_device}}

### Technology Stack

**Core Engine:** Phaser 3.70+
**Language:** TypeScript 5.0+ (Strict Mode)
**Build Tool:** {{build_tool}} (Webpack/Vite/Parcel)
**Package Manager:** {{package_manager}}
**Testing:** {{test_framework}}
**Deployment:** {{deployment_platform}}

## Project Structure

[[LLM: Define the complete project organization that developers will follow]]

### Repository Organization

[[LLM: Design a clear folder structure for game development]]

```text
{{game_name}}/
├── src/
│   ├── scenes/          # Game scenes
│   ├── gameObjects/     # Custom game objects
│   ├── systems/         # Core game systems
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript type definitions
│   ├── config/          # Game configuration
│   └── main.ts          # Entry point
├── assets/
│   ├── images/          # Sprite assets
│   ├── audio/           # Sound files
│   ├── data/            # JSON data files
│   └── fonts/           # Font files
├── public/              # Static web assets
├── tests/               # Test files
├── docs/                # Documentation
│   ├── stories/         # Development stories
│   └── architecture/    # Technical docs
└── dist/                # Built game files
```text

### Module Organization

[[LLM: Define how TypeScript modules should be organized]]

**Scene Structure:**

- Each scene in separate file
- Scene-specific logic contained
- Clear data passing between scenes

**Game Object Pattern:**

- Component-based architecture
- Reusable game object classes
- Type-safe property definitions

**System Architecture:**

- Singleton managers for global systems
- Event-driven communication
- Clear separation of concerns

## Core Game Systems

[[LLM: Detail each major system that needs to be implemented. Each system should be specific enough for developers to create implementation stories.]]

### Scene Management System

**Purpose:** Handle game flow and scene transitions

**Key Components:**

- Scene loading and unloading
- Data passing between scenes
- Transition effects
- Memory management

**Implementation Requirements:**

- Preload scene for asset loading
- Menu system with navigation
- Gameplay scenes with state management
- Pause/resume functionality

**Files to Create:**

- `src/scenes/BootScene.ts`
- `src/scenes/PreloadScene.ts`
- `src/scenes/MenuScene.ts`
- `src/scenes/GameScene.ts`
- `src/systems/SceneManager.ts`

### Game State Management

**Purpose:** Track player progress and game status

**State Categories:**

- Player progress (levels, unlocks)
- Game settings (audio, controls)
- Session data (current level, score)
- Persistent data (achievements, statistics)

**Implementation Requirements:**

- Save/load system with localStorage
- State validation and error recovery
- Cross-session data persistence
- Settings management

**Files to Create:**

- `src/systems/GameState.ts`
- `src/systems/SaveManager.ts`
- `src/types/GameData.ts`

### Asset Management System

**Purpose:** Efficient loading and management of game assets

**Asset Categories:**

- Sprite sheets and animations
- Audio files and music
- Level data and configurations
- UI assets and fonts

**Implementation Requirements:**

- Progressive loading strategy
- Asset caching and optimization
- Error handling for failed loads
- Memory management for large assets

**Files to Create:**

- `src/systems/AssetManager.ts`
- `src/config/AssetConfig.ts`
- `src/utils/AssetLoader.ts`

### Input Management System

**Purpose:** Handle all player input across platforms

**Input Types:**

- Keyboard controls
- Mouse/pointer interaction
- Touch gestures (mobile)
- Gamepad support (optional)

**Implementation Requirements:**

- Input mapping and configuration
- Touch-friendly mobile controls
- Input buffering for responsive gameplay
- Customizable control schemes

**Files to Create:**

- `src/systems/InputManager.ts`
- `src/utils/TouchControls.ts`
- `src/types/InputTypes.ts`

### Game Mechanics Systems

[[LLM: For each major mechanic defined in the GDD, create a system specification]]

<<REPEAT section="mechanic_system" count="based_on_gdd">>

#### {{mechanic_name}} System

**Purpose:** {{system_purpose}}

**Core Functionality:**

- {{feature_1}}
- {{feature_2}}
- {{feature_3}}

**Dependencies:** {{required_systems}}

**Performance Considerations:** {{optimization_notes}}

**Files to Create:**

- `src/systems/{{SystemName}}.ts`
- `src/gameObjects/{{RelatedObject}}.ts`
- `src/types/{{SystemTypes}}.ts`

<</REPEAT>>

### Physics & Collision System

**Physics Engine:** {{physics_choice}} (Arcade Physics/Matter.js)

**Collision Categories:**

- Player collision
- Enemy interactions
- Environmental objects
- Collectibles and items

**Implementation Requirements:**

- Optimized collision detection
- Physics body management
- Collision callbacks and events
- Performance monitoring

**Files to Create:**

- `src/systems/PhysicsManager.ts`
- `src/utils/CollisionGroups.ts`

### Audio System

**Audio Requirements:**

- Background music with looping
- Sound effects for actions
- Audio settings and volume control
- Mobile audio optimization

**Implementation Features:**

- Audio sprite management
- Dynamic music system
- Spatial audio (if applicable)
- Audio pooling for performance

**Files to Create:**

- `src/systems/AudioManager.ts`
- `src/config/AudioConfig.ts`

### UI System

**UI Components:**

- HUD elements (score, health, etc.)
- Menu navigation
- Modal dialogs
- Settings screens

**Implementation Requirements:**

- Responsive layout system
- Touch-friendly interface
- Keyboard navigation support
- Animation and transitions

**Files to Create:**

- `src/systems/UIManager.ts`
- `src/gameObjects/UI/`
- `src/types/UITypes.ts`

## Performance Architecture

[[LLM: Define performance requirements and optimization strategies]]

### Performance Targets

**Frame Rate:** 60 FPS sustained, 30 FPS minimum
**Memory Usage:** <{{memory_limit}}MB total
**Load Times:** <{{initial_load}}s initial, <{{level_load}}s per level
**Battery Optimization:** Reduced updates when not visible

### Optimization Strategies

**Object Pooling:**

- Bullets and projectiles
- Particle effects
- Enemy objects
- UI elements

**Asset Optimization:**

- Texture atlases for sprites
- Audio compression
- Lazy loading for large assets
- Progressive enhancement

**Rendering Optimization:**

- Sprite batching
- Culling off-screen objects
- Reduced particle counts on mobile
- Texture resolution scaling

**Files to Create:**

- `src/utils/ObjectPool.ts`
- `src/utils/PerformanceMonitor.ts`
- `src/config/OptimizationConfig.ts`

## Game Configuration

[[LLM: Define all configurable aspects of the game]]

### Phaser Configuration

```typescript
// src/config/GameConfig.ts
const gameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: {{game_width}},
    height: {{game_height}},
    scale: {
        mode: {{scale_mode}},
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: '{{physics_system}}',
        {{physics_system}}: {
            gravity: { y: {{gravity}} },
            debug: false
        }
    },
    // Additional configuration...
};
```text

### Game Balance Configuration

[[LLM: Based on GDD, define configurable game parameters]]

```typescript
// src/config/GameBalance.ts
export const GameBalance = {
    player: {
        speed: {{player_speed}},
        health: {{player_health}},
        // Additional player parameters...
    },
    difficulty: {
        easy: {{easy_params}},
        normal: {{normal_params}},
        hard: {{hard_params}}
    },
    // Additional balance parameters...
};
```

## Development Guidelines

[[LLM: Provide coding standards specific to game development]]

### TypeScript Standards

**Type Safety:**

- Use strict mode
- Define interfaces for all data structures
- Avoid `any` type usage
- Use enums for game states

**Code Organization:**

- One class per file
- Clear naming conventions
- Proper error handling
- Comprehensive documentation

### Phaser 3 Best Practices

**Scene Management:**

- Clean up resources in shutdown()
- Use scene data for communication
- Implement proper event handling
- Avoid memory leaks

**Game Object Design:**

- Extend Phaser classes appropriately
- Use component-based architecture
- Implement object pooling where needed
- Follow consistent update patterns

### Testing Strategy

**Unit Testing:**

- Test game logic separately from Phaser
- Mock Phaser dependencies
- Test utility functions
- Validate game balance calculations

**Integration Testing:**

- Scene loading and transitions
- Save/load functionality
- Input handling
- Performance benchmarks

**Files to Create:**

- `tests/utils/GameLogic.test.ts`
- `tests/systems/SaveManager.test.ts`
- `tests/performance/FrameRate.test.ts`

## Deployment Architecture

[[LLM: Define how the game will be built and deployed]]

### Build Process

**Development Build:**

- Fast compilation
- Source maps enabled
- Debug logging active
- Hot reload support

**Production Build:**

- Minified and optimized
- Asset compression
- Performance monitoring
- Error tracking

### Deployment Strategy

**Web Deployment:**

- Static hosting ({{hosting_platform}})
- CDN for assets
- Progressive loading
- Browser compatibility

**Mobile Packaging:**

- Cordova/Capacitor wrapper
- Platform-specific optimization
- App store requirements
- Performance testing

## Implementation Roadmap

[[LLM: Break down the architecture implementation into phases that align with the GDD development phases]]

### Phase 1: Foundation ({{duration}})

**Core Systems:**

- Project setup and configuration
- Basic scene management
- Asset loading pipeline
- Input handling framework

**Story Epics:**

- "Engine Setup and Configuration"
- "Basic Scene Management System"
- "Asset Loading Foundation"

### Phase 2: Game Systems ({{duration}})

**Gameplay Systems:**

- {{primary_mechanic}} implementation
- Physics and collision system
- Game state management
- UI framework

**Story Epics:**

- "{{Primary_Mechanic}} System Implementation"
- "Physics and Collision Framework"
- "Game State Management System"

### Phase 3: Content & Polish ({{duration}})

**Content Systems:**

- Level loading and management
- Audio system integration
- Performance optimization
- Final polish and testing

**Story Epics:**

- "Level Management System"
- "Audio Integration and Optimization"
- "Performance Optimization and Testing"

## Risk Assessment

[[LLM: Identify potential technical risks and mitigation strategies]]

| Risk                         | Probability | Impact     | Mitigation Strategy |
| ---------------------------- | ----------- | ---------- | ------------------- |
| Performance issues on mobile | {{prob}}    | {{impact}} | {{mitigation}}      |
| Asset loading bottlenecks    | {{prob}}    | {{impact}} | {{mitigation}}      |
| Cross-platform compatibility | {{prob}}    | {{impact}} | {{mitigation}}      |

## Success Criteria

[[LLM: Define measurable technical success criteria]]

**Technical Metrics:**

- All systems implemented per specification
- Performance targets met consistently
- Zero critical bugs in core systems
- Successful deployment across target platforms

**Code Quality:**

- 90%+ test coverage on game logic
- Zero TypeScript errors in strict mode
- Consistent adherence to coding standards
- Comprehensive documentation coverage
