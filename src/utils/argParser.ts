export function parseCommandArgs(argsString: string): string[] {
	// Parse command arguments safely, handling quoted strings
	const args: string[] = [];
	let current = '';
	let inQuotes = false;
	let quoteChar = '';

	for (let i = 0; i < argsString.length; i++) {
		const char = argsString[i];
		const nextChar = argsString[i + 1];

		if (!inQuotes && (char === '"' || char === "'")) {
			// Start of quoted string
			inQuotes = true;
			quoteChar = char;
		} else if (inQuotes && char === quoteChar && argsString[i - 1] !== '\\') {
			// End of quoted string (not escaped)
			inQuotes = false;
			quoteChar = '';
		} else if (!inQuotes && char === ' ') {
			// Space outside quotes - end of argument
			if (current.length > 0) {
				args.push(current);
				current = '';
			}
		} else if (char === '\\' && nextChar === quoteChar && inQuotes) {
			// Escaped quote inside quoted string
			current += quoteChar;
			i++; // Skip the quote character
		} else {
			// Regular character
			current += char;
		}
	}

	// Add the last argument if any
	if (current.length > 0) {
		args.push(current);
	}

	return args;
}
