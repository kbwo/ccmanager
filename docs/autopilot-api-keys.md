# Autopilot API Key Setup Guide

## Overview

CCManager's Autopilot feature requires LLM API keys to function. This guide explains how to set up and manage these keys using CCManager's built-in configuration system.

## Configuration Approach

CCManager stores API keys exclusively in its own configuration file, providing a seamless user experience:

### User Experience Benefits ✅
- **Integrated configuration**: Manage all Autopilot settings in one place
- **Easy setup**: Configure API keys directly through the CCManager UI
- **No environment setup**: No need to modify shell configuration files
- **Cross-session persistence**: Keys automatically available whenever you use CCManager
- **Backup and restore**: API keys included when backing up CCManager configuration

### Development Convenience ✅
- **Self-contained**: All configuration in CCManager's control
- **UI-driven setup**: Visual interface for key management
- **Immediate feedback**: Real-time validation of API key availability
- **Platform agnostic**: Works consistently across different operating systems

## Setting Up API Keys

### Method 1: Through CCManager UI (Recommended)

1. **Launch CCManager** and navigate to the main menu
2. **Press 'C'** to open Configuration menu
3. **Select 'Configure Autopilot'**
4. **Configure API keys**:
   - Press 'O' to set OpenAI API key
   - Press 'A' to set Anthropic API key
5. **Enter your API key** when prompted
6. **Press Enter** to save

The API keys will be saved to `~/.config/ccmanager/config.json` (or equivalent on Windows).

### Method 2: Direct Config File Edit

You can also edit the configuration file directly:

```json
{
  "autopilot": {
    "enabled": false,
    "provider": "openai",
    "model": "gpt-4.1",
    "maxGuidancesPerHour": 3,
    "analysisDelayMs": 3000,
    "apiKeys": {
      "openai": "your-openai-key-here",
      "anthropic": "your-anthropic-key-here"
    }
  }
}
```

**Config file locations**:
- **macOS/Linux**: `~/.config/ccmanager/config.json`
- **Windows**: `%APPDATA%/ccmanager/config.json`


## Obtaining API Keys

### OpenAI API Key

1. **Visit**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. **Sign in** or create an account
3. **Click**: "Create new secret key"
4. **Name**: Give it a descriptive name (e.g., "CCManager Autopilot")
5. **Copy**: The generated key (you won't see it again)
6. **Enter**: Into CCManager's Autopilot configuration

**Available Models**: GPT-4.1, o4-mini, o3

### Anthropic API Key

1. **Visit**: [console.anthropic.com](https://console.anthropic.com/)
2. **Sign in** or create an account
3. **Navigate**: To "API Keys" section
4. **Click**: "Create Key"
5. **Name**: Give it a descriptive name
6. **Copy**: The generated key
7. **Enter**: Into CCManager's Autopilot configuration

**Available Models**: Claude 4 Sonnet, Claude 4 Opus

## How CCManager Uses the Keys

### Automatic Detection

CCManager automatically detects which API keys are available:

```typescript
// Runtime detection with config priority
LLMClient.hasAnyProviderKeys(config)           // Returns: true/false
LLMClient.getAvailableProviderKeys(config)     // Returns: ['openai', 'anthropic']
LLMClient.isProviderAvailable('openai', config) // Returns: true/false
```

### UI Behavior

- **No keys**: Autopilot shows as "DISABLED", displays warning message
- **Keys configured**: Shows "***set***" for configured keys
- **Some keys**: Only available providers appear in provider selection
- **All keys**: Full provider choice available

### Configuration Flow

1. **API Key Status**: Main menu shows current autopilot status
2. **Configuration Menu**: Press 'C' → Configure Autopilot
3. **Key Management**: Press 'O' or 'A' to configure individual keys
4. **Real-time Updates**: UI immediately reflects key availability changes
5. **Provider Selection**: Only shows providers with valid API keys

## Security Considerations

### Config File Approach

**Pros**:
- Integrated user experience
- No shell configuration required
- Backed up with other CCManager settings

**Cons**:
- Keys stored in plaintext in config file
- Config file could be accidentally shared

### Security Best Practices

#### Do ✅
- Set appropriate file permissions on config directory (`chmod 700 ~/.config/ccmanager`)
- Regularly rotate your API keys
- Monitor your API usage on provider dashboards
- Set up billing alerts to prevent unexpected charges
- Back up config files securely

#### Don't ❌
- Share config files without removing API keys first
- Commit config files with keys to version control
- Use the same key across multiple applications in production
- Leave unused keys active

### File Permissions

CCManager automatically creates the config directory with appropriate permissions, but you can manually secure it:

```bash
# Secure the config directory
chmod 700 ~/.config/ccmanager
chmod 600 ~/.config/ccmanager/config.json
```

## Troubleshooting

### Keys Not Detected

1. **Check configuration**:
   ```bash
   # View current config
   cat ~/.config/ccmanager/config.json
   ```

2. **Restart CCManager** to reload configuration

3. **Verify key format**: Ensure no extra spaces or characters

### Provider Not Available

1. **Check key validity**: Verify the key format and hasn't expired
2. **Test through UI**: Use CCManager's configuration menu to re-enter the key
3. **Check provider status**: Ensure you have credits/quota available
4. **Validate key**: Test the key using provider's API documentation

### Configuration Menu Issues

1. **No API key options visible**: May indicate CCManager needs to be updated
2. **Keys show as "not set"**: Check config file format and permissions
3. **Cannot save keys**: Ensure config directory is writable

### Testing Key Validity

You can test API keys manually:

```bash
# Test OpenAI key
curl -H "Authorization: Bearer your-key-here" \
     https://api.openai.com/v1/models

# Test Anthropic key  
curl -H "x-api-key: your-key-here" \
     -H "Content-Type: application/json" \
     https://api.anthropic.com/v1/messages
```


## Summary

CCManager's config-based API key storage provides an integrated, user-friendly approach to managing LLM credentials. The built-in UI makes setup straightforward and all configuration is stored securely in CCManager's configuration file.