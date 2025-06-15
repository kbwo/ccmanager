import path from 'path';

export function generateWorktreeDirectory(
	branchName: string,
	pattern?: string,
): string {
	// Default pattern if not specified
	const defaultPattern = '../{branch}';
	const activePattern = pattern || defaultPattern;

	// Sanitize branch name for filesystem
	// Replace slashes with dashes, remove special characters
	const sanitizedBranch = branchName
		.replace(/\//g, '-') // Replace forward slashes with dashes
		.replace(/[^a-zA-Z0-9-_.]/g, '') // Remove special characters except dash, dot, underscore
		.replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
		.toLowerCase(); // Convert to lowercase for consistency

	// Replace placeholders in pattern
	const directory = activePattern
		.replace('{branch}', sanitizedBranch)
		.replace('{branch-name}', sanitizedBranch);

	// Ensure the path is relative to the repository root
	return path.normalize(directory);
}

export function extractBranchParts(branchName: string): {
	prefix?: string;
	name: string;
} {
	const parts = branchName.split('/');
	if (parts.length > 1) {
		return {
			prefix: parts[0],
			name: parts.slice(1).join('/'),
		};
	}
	return {name: branchName};
}