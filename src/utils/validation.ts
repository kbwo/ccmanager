export function isValidBranchName(branch: string): boolean {
	// Git branch name rules:
	// - Cannot start with '.'
	// - Cannot contain '..'
	// - Cannot contain ASCII control characters
	// - Cannot contain: ~ ^ : ? * [ \ space
	// - Cannot end with '/'
	// - Cannot end with '.lock'
	// - Cannot be '@'

	if (!branch || branch.length === 0) {
		return false;
	}

	if (branch === '@') {
		return false;
	}

	if (branch.startsWith('.')) {
		return false;
	}

	if (branch.endsWith('/')) {
		return false;
	}

	if (branch.endsWith('.lock')) {
		return false;
	}

	if (branch.includes('..')) {
		return false;
	}

	// Check for invalid characters
	const invalidChars = /[~^:?*[\]\s\\]/;
	if (invalidChars.test(branch)) {
		return false;
	}

	// Check for ASCII control characters (0-31, 127)
	for (let i = 0; i < branch.length; i++) {
		const charCode = branch.charCodeAt(i);
		if (charCode < 32 || charCode === 127) {
			return false;
		}
	}

	return true;
}

export function isValidWorktreePath(path: string): boolean {
	// Prevent path traversal attacks
	// - No '..' sequences
	// - No absolute paths (we'll handle those separately)
	// - No special characters that could be interpreted by shell

	if (!path || path.length === 0) {
		return false;
	}

	// Check for path traversal
	if (path.includes('..')) {
		return false;
	}

	// Check for shell special characters that could cause issues
	// Even though we're using execFileSync, we should be extra cautious
	const dangerousChars = /[;&|<>$`]/;
	if (dangerousChars.test(path)) {
		return false;
	}

	return true;
}

export function sanitizePath(path: string): string {
	// Remove any potentially dangerous characters
	// This is a backup sanitization, primary defense should be validation
	return path
		.replace(/\.\./g, '')
		.replace(/[;&|<>$`]/g, '')
		.trim();
}
