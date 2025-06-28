# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Support for Gemini CLI with configurable state detection strategies
- State detection strategy option in command presets (Claude/Gemini)
- `StateDetector` interface with strategy pattern implementation
- Comprehensive documentation for multi-CLI support
- Helper function for consistent detection strategy display formatting

### Changed
- Updated Edit Preset screen to use SelectInput for better navigation
- Command presets now include optional `detectionStrategy` field
- Session manager refactored to use pluggable state detectors
- Project description updated to reflect multi-AI assistant support

### Fixed
- Detection strategy names now display with proper capitalization

## [0.2.1] - 2025-06-23

### Changed
- Various bug fixes and improvements

## [0.2.0] - 2025-06-23

### Added
- Command presets system with fallback support
- Multiple preset management
- Default preset configuration
- Preset selector on session start

### Changed
- Migrated from single command config to preset system
- Improved configuration UI with preset management

## [0.1.0] - Initial Release

### Added
- Multi-session management for Claude Code
- Git worktree integration
- Real-time session state monitoring
- Keyboard shortcuts
- Status change hooks