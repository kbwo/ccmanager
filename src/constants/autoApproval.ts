/**
 * Default timeout in seconds for auto-approval verification.
 */
export const DEFAULT_TIMEOUT_SECONDS = 120;

export const DEFAULT_AUTO_APPROVAL_VERIFIER = 'default' as const;

export const MINIMAX_MODELS = ['MiniMax-M3', 'MiniMax-M2.7'] as const;
export const DEFAULT_MINIMAX_MODEL = MINIMAX_MODELS[0];

export const MINIMAX_REGIONS = ['global_en', 'cn_zh'] as const;
export const DEFAULT_MINIMAX_REGION = MINIMAX_REGIONS[0];

export const MINIMAX_PROTOCOLS = ['openai', 'anthropic'] as const;
export const DEFAULT_MINIMAX_PROTOCOL = MINIMAX_PROTOCOLS[0];

export const MINIMAX_ENDPOINTS = {
	global_en: {
		openai: 'https://api.minimax.io/v1',
		anthropic: 'https://api.minimax.io/anthropic',
	},
	cn_zh: {
		openai: 'https://api.minimaxi.com/v1',
		anthropic: 'https://api.minimaxi.com/anthropic',
	},
} as const;
