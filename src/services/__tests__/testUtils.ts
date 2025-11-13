import type {Terminal} from '../../types/index.js';

/**
 * Creates a mock Terminal object for testing state detectors.
 * @param lines - Array of strings representing terminal output lines
 * @returns Mock Terminal object with buffer interface
 */
export const createMockTerminal = (lines: string[]): Terminal => {
	const buffer = {
		length: lines.length,
		active: {
			length: lines.length,
			getLine: (index: number) => {
				if (index >= 0 && index < lines.length) {
					return {
						translateToString: () => lines[index],
					};
				}
				return null;
			},
		},
	};

	return {buffer} as unknown as Terminal;
};
