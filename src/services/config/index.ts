/**
 * Config module - handles global and project-level configuration.
 *
 * Public API:
 * - ConfigEditor: For editing configuration (scope-aware)
 * - ConfigReader: For reading merged configuration
 * - createConfigEditor: Factory function to create ConfigEditor instances
 *
 * Note: globalConfigManager and projectConfigManager are internal
 * and should not be imported directly from outside this directory.
 */
export {ConfigEditor, createConfigEditor} from './configEditor.js';
export {ConfigReader, configReader} from './configReader.js';
