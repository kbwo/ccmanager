/**
 * Terminal capabilities detection utilities for CCManager.
 * Determines terminal feature support for optimal UI rendering.
 */

/**
 * Detect if the current terminal supports Unicode characters.
 * This function checks various environment variables and platform indicators
 * to determine if Unicode spinner characters (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏) will render correctly.
 *
 * Detection strategy:
 * 1. Check TERM environment variable for known Unicode-capable terminals
 * 2. Check LANG and LC_ALL for UTF-8 encoding
 * 3. Platform-specific checks (Windows Terminal, etc.)
 * 4. Fallback to ASCII if no Unicode indicators present
 *
 * @returns true if Unicode is supported, false otherwise
 */
export function supportsUnicode(): boolean {
	// Check for explicitly non-Unicode terminals
	const term = process.env['TERM'];
	if (term === 'dumb') {
		return false;
	}

	// Windows-specific detection
	if (process.platform === 'win32') {
		// Windows Terminal supports Unicode
		if (process.env['WT_SESSION']) {
			return true;
		}
		// Without Windows Terminal or explicit TERM, assume no Unicode
		if (!term) {
			return false;
		}
	}

	// Check TERM for known Unicode-capable terminals
	if (term) {
		// xterm variants, screen, alacritty all support Unicode
		const unicodeTerms = [
			'xterm',
			'xterm-256color',
			'screen',
			'screen-256color',
			'alacritty',
			'vte',
			'rxvt',
		];

		for (const unicodeTerm of unicodeTerms) {
			if (term.includes(unicodeTerm)) {
				return true;
			}
		}

		// Linux console (not linux-utf8) has limited Unicode support
		if (term === 'linux' && !hasUtf8Locale()) {
			return false;
		}
	}

	// Check locale settings for UTF-8 encoding
	if (hasUtf8Locale()) {
		return true;
	}

	// Apple Terminal historically had issues, but with UTF-8 locale it should work
	if (process.env['TERM_PROGRAM'] === 'Apple_Terminal' && !hasUtf8Locale()) {
		return false;
	}

	// CI environments often support Unicode if locale is set
	if (process.env['CI'] && hasUtf8Locale()) {
		return true;
	}

	// Default to false if no Unicode indicators found
	return false;
}

/**
 * Check if the system locale indicates UTF-8 encoding.
 * Examines LANG and LC_ALL environment variables.
 *
 * @returns true if UTF-8 locale is detected
 */
function hasUtf8Locale(): boolean {
	const lang = process.env['LANG'] || process.env['LC_ALL'] || '';
	return /utf-?8/i.test(lang);
}
