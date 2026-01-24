import type {Terminal} from '../../types/index.js';

/**
 * Creates a mock Terminal object for testing state detectors.
 * @param lines - Array of strings representing terminal output lines
 * @param options - Optional configuration for rows and cols
 * @returns Mock Terminal object with buffer interface
 */
export const createMockTerminal = (
	lines: string[],
	options?: {rows?: number; cols?: number},
): Terminal => {
	const rows = options?.rows ?? lines.length;
	const cols = options?.cols ?? 80;

	const buffer = {
		length: lines.length,
		active: {
			length: lines.length,
			getLine: (index: number) => {
				if (index >= 0 && index < lines.length) {
					return {
						translateToString: (
							_trimRight?: boolean,
							_startCol?: number,
							_endCol?: number,
						) => lines[index],
					};
				}
				return null;
			},
		},
	};

	return {buffer, rows, cols} as unknown as Terminal;
};
