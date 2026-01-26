import type {Terminal, IBufferLine} from '@xterm/headless';

export interface ScreenState {
	timestamp: string;
	bufferType: 'normal' | 'alternate';
	cursorX: number;
	cursorY: number;
	cols: number;
	rows: number;
	lines: string[];
}

function lineToString(line: IBufferLine | undefined, cols: number): string {
	if (!line) {
		return '';
	}

	return line.translateToString(true, 0, cols);
}

/**
 * Captures the current screen state of the terminal.
 * This correctly handles both normal and alternate screen buffers,
 * capturing only the visible screen content (not scrollback history).
 *
 * @param terminal - The xterm terminal instance
 * @returns The current screen state including all visible lines
 */
export function captureScreen(terminal: Terminal): ScreenState {
	const buffer = terminal.buffer.active;
	const lines: string[] = [];

	// baseY is the offset of the viewport within the buffer
	// For alternate buffer: baseY is always 0
	// For normal buffer: baseY indicates how much has been scrolled
	const baseY = buffer.baseY;

	// Capture the visible viewport (not the beginning of scrollback)
	for (let y = 0; y < terminal.rows; y++) {
		const line = buffer.getLine(baseY + y);
		lines.push(lineToString(line, terminal.cols));
	}

	return {
		timestamp: new Date().toISOString(),
		bufferType: buffer.type as 'normal' | 'alternate',
		cursorX: buffer.cursorX,
		cursorY: buffer.cursorY,
		cols: terminal.cols,
		rows: terminal.rows,
		lines,
	};
}

/**
 * Formats the screen state into a human-readable string.
 *
 * @param state - The screen state to format
 * @returns Formatted string representation of the screen state
 */
export function formatScreenState(state: ScreenState): string {
	const separator = '-'.repeat(state.cols);

	let output = `\n[${state.timestamp}] Buffer: ${state.bufferType} | Cursor: (${state.cursorX}, ${state.cursorY}) | Size: ${state.cols}x${state.rows}\n${separator}\n`;

	for (const line of state.lines) {
		output += line + '\n';
	}

	output += `${separator}\n\n`;

	return output;
}

/**
 * Gets the terminal content as a single string.
 * This is a convenience function that captures the screen and returns
 * just the lines joined together.
 *
 * @param terminal - The xterm terminal instance
 * @param maxLines - Optional maximum number of lines to return (from the bottom)
 * @returns The terminal content as a string
 */
export function getTerminalScreenContent(
	terminal: Terminal,
	maxLines?: number,
): string {
	const state = captureScreen(terminal);
	let lines = state.lines;

	// Trim empty lines from the bottom
	while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
		lines.pop();
	}

	// If maxLines is specified, take only the last maxLines
	if (maxLines !== undefined && lines.length > maxLines) {
		lines = lines.slice(-maxLines);
	}

	return lines.join('\n');
}
