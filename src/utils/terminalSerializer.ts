import pkg from '@xterm/headless';
type Terminal = typeof pkg.Terminal;

// Constants from xterm.js source code
const Attributes = {
	/**
	 * bit 1..8     blue in RGB, color in P256 and P16
	 */
	BLUE_MASK: 0xff,
	BLUE_SHIFT: 0,
	/**
	 * bit 9..16    green in RGB
	 */
	GREEN_MASK: 0xff00,
	GREEN_SHIFT: 8,
	/**
	 * bit 17..24   red in RGB
	 */
	RED_MASK: 0xff0000,
	RED_SHIFT: 16,
	/**
	 * bit 25..26   color mode: DEFAULT (0) | P16 (1) | P256 (2) | RGB (3)
	 */
	CM_MASK: 0x3000000,
	CM_DEFAULT: 0,
	CM_P16: 0x1000000,
	CM_P256: 0x2000000,
	CM_RGB: 0x3000000,
};

/**
 * Convert xterm.js buffer content to text with ANSI escape sequences preserved
 */
export class TerminalSerializer {
	private static readonly ESC = '\x1b[';
	private static readonly RESET = '\x1b[0m';

	/**
	 * Extract color mode from the combined color value
	 */
	private static getColorMode(colorValue: number): number {
		const mode = colorValue & Attributes.CM_MASK;
		if (mode === Attributes.CM_P16) return 1; // P16
		if (mode === Attributes.CM_P256) return 2; // P256
		if (mode === Attributes.CM_RGB) return 3; // RGB
		return 0; // DEFAULT
	}

	/**
	 * Extract actual color from the combined color value
	 */
	private static extractColor(colorValue: number): number {
		const mode = colorValue & Attributes.CM_MASK;
		if (mode === Attributes.CM_RGB) {
			// For RGB, extract R, G, B components
			return colorValue & 0xffffff;
		}
		// For palette colors, it's stored in the blue channel
		return colorValue & Attributes.BLUE_MASK;
	}

	/**
	 * Convert a color value to ANSI escape sequence based on color mode
	 */
	private static colorToAnsi(
		colorValue: number,
		isBackground: boolean,
	): string {
		// -1 means default color
		if (colorValue === -1) {
			return isBackground ? `${this.ESC}49m` : `${this.ESC}39m`;
		}

		const prefix = isBackground ? '48' : '38';
		const mode = this.getColorMode(colorValue);
		const color = this.extractColor(colorValue);

		switch (mode) {
			case 0: // DEFAULT
				// Default color - use reset codes
				return isBackground ? `${this.ESC}49m` : `${this.ESC}39m`;

			case 1: // P16
				// ANSI 16 colors
				if (color < 8) {
					// Standard colors (30-37 for fg, 40-47 for bg)
					return `${this.ESC}${(isBackground ? 40 : 30) + color}m`;
				} else {
					// Bright colors (90-97 for fg, 100-107 for bg)
					return `${this.ESC}${(isBackground ? 100 : 90) + (color - 8)}m`;
				}

			case 2: // P256
				// Extended 256 colors
				return `${this.ESC}${prefix};5;${color}m`;

			case 3: {
				// RGB
				// True color (24-bit RGB)
				const r = (color >> 16) & 0xff;
				const g = (color >> 8) & 0xff;
				const b = color & 0xff;
				return `${this.ESC}${prefix};2;${r};${g};${b}m`;
			}

			default:
				return '';
		}
	}

	/**
	 * Generate style attributes (bold, italic, underline, etc.) as ANSI codes
	 */
	private static getStyleCodes(cell: any): string {
		const codes: string[] = [];

		if (cell.isBold()) codes.push(`${this.ESC}1m`);
		if (cell.isItalic()) codes.push(`${this.ESC}3m`);
		if (cell.isUnderline()) codes.push(`${this.ESC}4m`);
		if (cell.isStrikethrough()) codes.push(`${this.ESC}9m`);

		return codes.join('');
	}

	/**
	 * Serialize a single line from the terminal buffer with ANSI escape sequences
	 */
	private static serializeLine(
		line: any,
		cols: number,
		trimRight: boolean = true,
	): string {
		if (!line) return '';

		let result = '';
		let lastFgColor: number | null = null;
		let lastBgColor: number | null = null;
		let lastStyles = {
			bold: false,
			italic: false,
			underline: false,
			strikethrough: false,
		};

		// Track the rightmost non-empty cell for trimming
		let lastNonEmptyIndex = -1;
		if (trimRight) {
			for (let x = cols - 1; x >= 0; x--) {
				const cell = line.getCell(x);
				if (cell) {
					const chars = cell.getChars();
					if (chars && chars.trim() !== '') {
						lastNonEmptyIndex = x;
						break;
					}
				}
			}
		}

		// If no non-empty cells found and trimRight is true, return empty
		if (trimRight && lastNonEmptyIndex === -1) {
			return '';
		}

		const endCol = trimRight ? lastNonEmptyIndex + 1 : cols;

		for (let x = 0; x < endCol; x++) {
			const cell = line.getCell(x);
			if (!cell) {
				result += ' ';
				continue;
			}

			const chars = cell.getChars();
			const cellChar = chars || ' ';

			// Check if we need to emit any escape sequences
			let escapeSequence = '';

			// Handle foreground color changes
			const fgColor = cell.getFgColor();
			const fgColorMode = cell.getFgColorMode();
			// Combine color and mode to get the full color value
			const fgColorValue = fgColorMode === 0 ? fgColor : fgColorMode | fgColor;

			if (fgColorValue !== lastFgColor) {
				escapeSequence += this.colorToAnsi(fgColorValue, false);
				lastFgColor = fgColorValue;
			}

			// Handle background color changes
			const bgColor = cell.getBgColor();
			const bgColorMode = cell.getBgColorMode();
			// Combine color and mode to get the full color value
			const bgColorValue = bgColorMode === 0 ? bgColor : bgColorMode | bgColor;

			if (bgColorValue !== lastBgColor) {
				escapeSequence += this.colorToAnsi(bgColorValue, true);
				lastBgColor = bgColorValue;
			}

			// Handle style changes
			const currentStyles = {
				bold: cell.isBold(),
				italic: cell.isItalic(),
				underline: cell.isUnderline(),
				strikethrough: cell.isStrikethrough(),
			};

			// If any style changed, we need to reset and reapply all styles
			if (
				currentStyles.bold !== lastStyles.bold ||
				currentStyles.italic !== lastStyles.italic ||
				currentStyles.underline !== lastStyles.underline ||
				currentStyles.strikethrough !== lastStyles.strikethrough
			) {
				// Reset all styles
				escapeSequence += `${this.ESC}22m${this.ESC}23m${this.ESC}24m${this.ESC}29m`;

				// Reapply active styles
				if (currentStyles.bold) escapeSequence += `${this.ESC}1m`;
				if (currentStyles.italic) escapeSequence += `${this.ESC}3m`;
				if (currentStyles.underline) escapeSequence += `${this.ESC}4m`;
				if (currentStyles.strikethrough) escapeSequence += `${this.ESC}9m`;

				lastStyles = {...currentStyles};
			}

			result += escapeSequence + cellChar;
		}

		return result;
	}

	/**
	 * Serialize the entire terminal buffer or a range of lines with ANSI escape sequences
	 */
	static serialize(
		terminal: InstanceType<Terminal>,
		options: {
			startLine?: number;
			endLine?: number;
			trimRight?: boolean;
			includeEmptyLines?: boolean;
		} = {},
	): string {
		const buffer = terminal.buffer.active;
		const cols = terminal.cols;

		const {
			startLine = 0,
			endLine = buffer.length,
			trimRight = true,
			includeEmptyLines = true,
		} = options;

		const lines: string[] = [];

		for (let y = startLine; y < Math.min(endLine, buffer.length); y++) {
			const line = buffer.getLine(y);
			if (line) {
				const serializedLine = this.serializeLine(line, cols, trimRight);

				// Skip empty lines if requested
				if (!includeEmptyLines && serializedLine.trim() === '') {
					continue;
				}

				lines.push(serializedLine);
			} else if (includeEmptyLines) {
				lines.push('');
			}
		}

		// Find last non-empty line if trimming
		if (trimRight && lines.length > 0) {
			let lastNonEmptyIndex = lines.length - 1;
			while (lastNonEmptyIndex >= 0) {
				const line = lines[lastNonEmptyIndex];
				if (line && line.trim() !== '') {
					break;
				}
				lastNonEmptyIndex--;
			}
			return lines.slice(0, lastNonEmptyIndex + 1).join('\n') + this.RESET;
		}

		return lines.join('\n') + this.RESET;
	}

	/**
	 * Get the last N lines from the terminal buffer with ANSI escape sequences
	 */
	static getLastLines(
		terminal: InstanceType<Terminal>,
		lineCount: number,
		options: {trimRight?: boolean; includeEmptyLines?: boolean} = {},
	): string {
		const buffer = terminal.buffer.active;
		const startLine = Math.max(0, buffer.length - lineCount);

		return this.serialize(terminal, {
			startLine,
			endLine: buffer.length,
			...options,
		});
	}
}
