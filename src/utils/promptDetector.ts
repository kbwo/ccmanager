export function includesPromptBoxLine(output: string): boolean {
	// Check if the output includes a prompt box line pattern (│ > [spaces])
	return output.split('\n').some(line => /│\s*>\s*/.test(line));
}

export function includesPromptBoxTopBorder(output: string): boolean {
	// Check if the output includes a prompt box top border
	return output
		.trim()
		.split('\n')
		.some(line => {
			// Accept patterns:
			// - `──╮` (ends with ╮)
			// - `╭───╮` (starts with ╭ and ends with ╮)
			// Reject if:
			// - vertical line exists after ╮
			// - line starts with ╭ but doesn't end with ╮

			// Check if line ends with ╮ but not followed by │
			if (line.endsWith('╮') && !line.includes('╮ │')) {
				// Accept if it's just ──╮ or ╭───╮ pattern
				return /─+╮$/.test(line) || /^╭─+╮$/.test(line);
			}
			return false;
		});
}

export function includesPromptBoxBottomBorder(output: string): boolean {
	// Check if the output includes a prompt box bottom border
	return output
		.trim()
		.split('\n')
		.some(line => {
			// Accept patterns:
			// - `──╯` (ends with ╯)
			// - `╰───╯` (starts with ╰ and ends with ╯)
			// Reject if:
			// - vertical line exists after ╯
			// - line starts with ╰ but doesn't end with ╯

			// Check if line ends with ╯ but not followed by │
			if (line.endsWith('╯') && !line.includes('╯ │')) {
				// Accept if it's just ──╯ or ╰───╯ pattern
				return /─+╯$/.test(line) || /^╰─+╯$/.test(line);
			}
			return false;
		});
}
