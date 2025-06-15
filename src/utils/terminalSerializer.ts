import type {Terminal} from '../types/index.js';
import type {IBufferLine} from '@xterm/headless';

/**
 * Constants for decoding color information stored in terminal cells.
 * Terminal colors are packed into a single number where different bits represent different information.
 * Think of it like a compressed file - multiple pieces of data stored in one number.
 *
 * These constants are based on xterm.js internal implementation:
 * Source: https://github.com/xtermjs/xterm.js/blob/master/src/common/buffer/Constants.ts
 *
 * The color storage format uses bit packing where:
 * - Bits 1-8: Blue component (also used for palette color indices)
 * - Bits 9-16: Green component (RGB mode only)
 * - Bits 17-24: Red component (RGB mode only)
 * - Bits 25-26: Color mode indicator
 *
 * Reference implementation:
 * https://github.com/xtermjs/xterm.js/blob/master/src/common/buffer/AttributeData.ts
 */
const Attributes = {
	/**
	 * BLUE_MASK: Used to extract blue color value (bits 1-8)
	 * In 256-color and 16-color modes, the entire color number is stored here
	 * Example: 0x0000FF masks out everything except the last 8 bits
	 */
	BLUE_MASK: 0xff,
	BLUE_SHIFT: 0,
	/**
	 * GREEN_MASK: Used to extract green color value (bits 9-16)
	 * Only used in RGB (true color) mode
	 * Example: 0x00FF00 masks out everything except bits 9-16
	 */
	GREEN_MASK: 0xff00,
	GREEN_SHIFT: 8,
	/**
	 * RED_MASK: Used to extract red color value (bits 17-24)
	 * Only used in RGB (true color) mode
	 * Example: 0xFF0000 masks out everything except bits 17-24
	 */
	RED_MASK: 0xff0000,
	RED_SHIFT: 16,
	/**
	 * CM_MASK: Used to determine which color system is being used (bits 25-26)
	 * Like a label that says "this is 16-color" or "this is RGB"
	 *
	 * Color modes from xterm.js:
	 * https://github.com/xtermjs/xterm.js/blob/master/src/common/Types.d.ts#L33
	 */
	CM_MASK: 0x3000000,
	CM_DEFAULT: 0, // Default terminal colors (usually white text on black background)
	CM_P16: 0x1000000, // 16-color palette (basic colors like red, blue, green)
	CM_P256: 0x2000000, // 256-color palette (more shades and colors)
	CM_RGB: 0x3000000, // RGB/true color (millions of colors, like in photos)
};

/**
 * TerminalSerializer: Converts terminal screen content to text while preserving colors and formatting.
 *
 * Imagine taking a screenshot of your terminal, but instead of an image, you get text that
 * can recreate the exact same appearance with all colors and styles when displayed again.
 */
export class TerminalSerializer {
	/**
	 * ESC: The "magic" prefix that tells the terminal "the next characters are instructions, not text"
	 * '\x1b[' is like saying "Hey terminal, listen up for special commands!"
	 */
	private static readonly ESC = '\x1b[';
	/**
	 * RESET: The command that tells terminal "go back to normal text" (no colors, no bold, etc.)
	 * Like clicking "clear formatting" in a word processor
	 */
	private static readonly RESET = '\x1b[0m';

	/**
	 * Determines which color system is being used for a given color value.
	 *
	 * Terminal supports different color systems:
	 * - Mode 0 (DEFAULT): Basic terminal colors (like white text on black background)
	 * - Mode 1 (P16): 16 basic colors (8 normal + 8 bright versions)
	 * - Mode 2 (P256): 256 colors (used for more variety)
	 * - Mode 3 (RGB): True color with Red, Green, Blue values (16.7 million colors)
	 *
	 * @param colorValue - The packed color information from the terminal
	 * @returns 0, 1, 2, or 3 indicating which color system to use
	 */
	private static getColorMode(colorValue: number): number {
		const mode = colorValue & Attributes.CM_MASK;
		if (mode === Attributes.CM_P16) return 1; // P16
		if (mode === Attributes.CM_P256) return 2; // P256
		if (mode === Attributes.CM_RGB) return 3; // RGB
		return 0; // DEFAULT
	}

	/**
	 * Extracts the actual color value from the packed color information.
	 *
	 * The extraction method depends on the color mode:
	 * - For RGB mode: Extracts all three color components (R, G, B)
	 * - For palette modes: Extracts just the color index number
	 *
	 * Think of it like unpacking a suitcase - different items are packed differently
	 *
	 * @param colorValue - The packed color information from the terminal
	 * @returns The actual color value (either RGB values or palette index)
	 */
	private static extractColor(colorValue: number): number {
		const mode = colorValue & Attributes.CM_MASK;
		if (mode === Attributes.CM_RGB) {
			// For RGB, extract R, G, B components (all 24 bits of color data)
			return colorValue & 0xffffff;
		}
		// For palette colors, it's stored in the blue channel (just 8 bits)
		return colorValue & Attributes.BLUE_MASK;
	}

	/**
	 * Converts a color value into the special text codes that terminals understand.
	 *
	 * Terminals use "ANSI escape sequences" - special character combinations that control
	 * how text appears. It's like HTML tags, but for terminals.
	 *
	 * Examples of what this function produces:
	 * - Red text: "\x1b[31m" (tells terminal "make the following text red")
	 * - Blue background: "\x1b[44m" (tells terminal "make the background blue")
	 * - RGB color: "\x1b[38;2;255;128;0m" (orange text using RGB values)
	 *
	 * @param colorValue - The color to convert (packed number with mode and color data)
	 * @param isBackground - true for background color, false for text color
	 * @returns ANSI escape sequence string that terminals can interpret
	 */
	private static colorToAnsi(
		colorValue: number,
		isBackground: boolean,
	): string {
		// -1 is a special value meaning "use the terminal's default color"
		if (colorValue === -1) {
			return isBackground ? `${this.ESC}49m` : `${this.ESC}39m`;
		}

		// Different prefixes for text color (38) vs background color (48)
		const prefix = isBackground ? '48' : '38';
		const mode = this.getColorMode(colorValue);
		const color = this.extractColor(colorValue);

		switch (mode) {
			case 0: // DEFAULT
				// Reset to terminal's default colors
				return isBackground ? `${this.ESC}49m` : `${this.ESC}39m`;

			case 1: // P16 - Basic 16 colors
				// Colors 0-7 are normal intensity (black, red, green, yellow, blue, magenta, cyan, white)
				// Colors 8-15 are bright/bold versions of the same colors
				if (color < 8) {
					// Standard colors: 30-37 for text, 40-47 for background
					return `${this.ESC}${(isBackground ? 40 : 30) + color}m`;
				} else {
					// Bright colors: 90-97 for text, 100-107 for background
					return `${this.ESC}${(isBackground ? 100 : 90) + (color - 8)}m`;
				}

			case 2: // P256 - Extended 256 color palette
				// Format: ESC[38;5;{color}m for foreground, ESC[48;5;{color}m for background
				// The ;5; tells terminal "the next number is a color from the 256-color palette"
				return `${this.ESC}${prefix};5;${color}m`;

			case 3: {
				// RGB - True color (24-bit, millions of colors)
				// Extract individual Red, Green, Blue components from the packed color
				const r = (color >> 16) & 0xff; // Red: bits 17-24
				const g = (color >> 8) & 0xff; // Green: bits 9-16
				const b = color & 0xff; // Blue: bits 1-8
				// Format: ESC[38;2;{r};{g};{b}m for foreground
				// The ;2; tells terminal "the next three numbers are RGB values"
				return `${this.ESC}${prefix};2;${r};${g};${b}m`;
			}

			default:
				return '';
		}
	}

	/**
	 * Converts a single line of terminal content into text with color/style codes.
	 *
	 * This function processes each character in a line and:
	 * 1. Extracts the character itself
	 * 2. Checks its color (text and background)
	 * 3. Checks its style (bold, italic, underline, etc.)
	 * 4. Adds the necessary codes to recreate that appearance
	 *
	 * It's like going through a line character by character and noting:
	 * "This letter is red, this one is bold, this one has blue background..."
	 *
	 * @param line - One line from the terminal screen
	 * @param cols - Number of columns (width) of the terminal
	 * @param trimRight - Whether to remove trailing spaces (like right-trim in text editors)
	 * @returns The line as text with embedded color/style codes
	 */
	private static serializeLine(
		line: IBufferLine,
		cols: number,
		trimRight: boolean = true,
	): string {
		if (!line) return '';

		let result = '';
		// Keep track of the current colors/styles to avoid repeating the same codes
		let lastFgColor: number | null = null;
		let lastBgColor: number | null = null;
		let lastStyles = {
			bold: false,
			italic: false,
			underline: false,
			strikethrough: false,
		};

		// Find the last character that isn't a space (for trimming)
		// Start from the right and work backwards to find content
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

		// If the line is completely empty and we're trimming, return empty string
		if (trimRight && lastNonEmptyIndex === -1) {
			return '';
		}

		const endCol = trimRight ? lastNonEmptyIndex + 1 : cols;

		// Process each character position in the line
		for (let x = 0; x < endCol; x++) {
			const cell = line.getCell(x);
			if (!cell) {
				// No cell data at this position, just add a space
				result += ' ';
				continue;
			}

			// Get the actual character at this position
			const chars = cell.getChars();
			const cellChar = chars || ' ';

			// Build up any necessary escape sequences for this character
			let escapeSequence = '';

			// STEP 1: Check text color
			// Get both the color value and the color mode (which type of color it is)
			const fgColor = cell.getFgColor();
			const fgColorMode = cell.getFgColorMode();
			// Combine them into a single value that includes both color and mode information
			const fgColorValue = fgColorMode === 0 ? fgColor : fgColorMode | fgColor;

			// Only add color code if it's different from the previous character
			if (fgColorValue !== lastFgColor) {
				escapeSequence += this.colorToAnsi(fgColorValue, false);
				lastFgColor = fgColorValue;
			}

			// STEP 2: Check background color (same process as text color)
			const bgColor = cell.getBgColor();
			const bgColorMode = cell.getBgColorMode();
			const bgColorValue = bgColorMode === 0 ? bgColor : bgColorMode | bgColor;

			if (bgColorValue !== lastBgColor) {
				escapeSequence += this.colorToAnsi(bgColorValue, true);
				lastBgColor = bgColorValue;
			}

			// STEP 3: Check text styles (bold, italic, etc.)
			const currentStyles = {
				bold: !!cell.isBold(), // Is this character bold?
				italic: !!cell.isItalic(), // Is it italicized?
				underline: !!cell.isUnderline(), // Is it underlined?
				strikethrough: !!cell.isStrikethrough(), // Is it crossed out?
			};

			// If any style changed from the previous character, update them
			if (
				currentStyles.bold !== lastStyles.bold ||
				currentStyles.italic !== lastStyles.italic ||
				currentStyles.underline !== lastStyles.underline ||
				currentStyles.strikethrough !== lastStyles.strikethrough
			) {
				// First, turn off all styles with reset codes
				// 22m = not bold, 23m = not italic, 24m = not underline, 29m = not strikethrough
				escapeSequence += `${this.ESC}22m${this.ESC}23m${this.ESC}24m${this.ESC}29m`;

				// Then turn on only the styles we need
				// 1m = bold, 3m = italic, 4m = underline, 9m = strikethrough
				if (currentStyles.bold) escapeSequence += `${this.ESC}1m`;
				if (currentStyles.italic) escapeSequence += `${this.ESC}3m`;
				if (currentStyles.underline) escapeSequence += `${this.ESC}4m`;
				if (currentStyles.strikethrough) escapeSequence += `${this.ESC}9m`;

				lastStyles = {...currentStyles};
			}

			// Add the escape sequences (if any) followed by the actual character
			result += escapeSequence + cellChar;
		}

		return result;
	}

	/**
	 * Converts the entire terminal screen (or part of it) into text with colors preserved.
	 *
	 * This is the main function that processes multiple lines of terminal content.
	 * It's like taking a "text screenshot" of your terminal that can be replayed later
	 * with all the colors and formatting intact.
	 *
	 * @param terminal - The terminal object containing the screen buffer
	 * @param options - Configuration options:
	 *   - startLine: First line to include (default: 0, the top)
	 *   - endLine: Last line to include (default: bottom of screen)
	 *   - trimRight: Remove trailing spaces from each line (default: true)
	 *   - includeEmptyLines: Keep blank lines in output (default: true)
	 * @returns Multi-line string with embedded ANSI codes for colors/styles
	 */
	static serialize(
		terminal: Terminal,
		options: {
			startLine?: number;
			endLine?: number;
			trimRight?: boolean;
			includeEmptyLines?: boolean;
		} = {},
	): string {
		// Get the current screen content and dimensions
		const buffer = terminal.buffer.active;
		const cols = terminal.cols;

		// Apply default options
		const {
			startLine = 0,
			endLine = buffer.length,
			trimRight = true,
			includeEmptyLines = true,
		} = options;

		const lines: string[] = [];

		// Process each line in the specified range
		for (let y = startLine; y < Math.min(endLine, buffer.length); y++) {
			const line = buffer.getLine(y);
			if (line) {
				// Convert this line to text with color codes
				const serializedLine = this.serializeLine(line, cols, trimRight);

				// Skip empty lines if user doesn't want them
				if (!includeEmptyLines && serializedLine.trim() === '') {
					continue;
				}

				lines.push(serializedLine);
			} else if (includeEmptyLines) {
				// Line doesn't exist but we want to preserve empty lines
				lines.push('');
			}
		}

		// Remove trailing empty lines if trimming is enabled
		// This is like removing blank lines at the end of a document
		if (trimRight && lines.length > 0) {
			let lastNonEmptyIndex = lines.length - 1;
			while (lastNonEmptyIndex >= 0) {
				const line = lines[lastNonEmptyIndex];
				if (line && line.trim() !== '') {
					break;
				}
				lastNonEmptyIndex--;
			}
			// Join all lines and add a reset code at the end to clear any formatting
			return lines.slice(0, lastNonEmptyIndex + 1).join('\n') + this.RESET;
		}

		// Join all lines and add a reset code at the end
		return lines.join('\n') + this.RESET;
	}

	/**
	 * Convenience function to get just the last few lines from the terminal.
	 *
	 * Useful when you only need recent output, like:
	 * - Getting the last error message
	 * - Showing recent command output
	 * - Displaying the current prompt
	 *
	 * Example: getLastLines(terminal, 10) gets the last 10 lines
	 *
	 * @param terminal - The terminal object containing the screen buffer
	 * @param lineCount - How many lines from the bottom to include
	 * @param options - Same options as serialize() for controlling output format
	 * @returns The requested lines as text with color/style codes
	 */
	static getLastLines(
		terminal: Terminal,
		lineCount: number,
		options: {trimRight?: boolean; includeEmptyLines?: boolean} = {},
	): string {
		const buffer = terminal.buffer.active;
		// Calculate where to start (can't go below 0)
		const startLine = Math.max(0, buffer.length - lineCount);

		// Use the main serialize function but with a specific range
		return this.serialize(terminal, {
			startLine,
			endLine: buffer.length,
			...options,
		});
	}
}
