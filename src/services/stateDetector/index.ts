import {StateDetectionStrategy} from '../../types/index.js';
import {StateDetector} from './types.js';
import {ClaudeStateDetector} from './claude.js';
import {GeminiStateDetector} from './gemini.js';
import {CodexStateDetector} from './codex.js';
import {CursorStateDetector} from './cursor.js';
import {GitHubCopilotStateDetector} from './github-copilot.js';
import {ClineStateDetector} from './cline.js';
import {OpenCodeStateDetector} from './opencode.js';

export function createStateDetector(
	strategy: StateDetectionStrategy = 'claude',
): StateDetector {
	switch (strategy) {
		case 'claude':
			return new ClaudeStateDetector();
		case 'gemini':
			return new GeminiStateDetector();
		case 'codex':
			return new CodexStateDetector();
		case 'cursor':
			return new CursorStateDetector();
		case 'github-copilot':
			return new GitHubCopilotStateDetector();
		case 'cline':
			return new ClineStateDetector();
		case 'opencode':
			return new OpenCodeStateDetector();
		default:
			return new ClaudeStateDetector();
	}
}
