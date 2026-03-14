import {useStdout} from 'ink';

interface UseDynamicLimitOptions {
	fixedRows?: number;
	isSearchMode?: boolean;
	hasError?: boolean;
}

/**
 * Calculate the maximum number of list items to display based on terminal height.
 */
export function useDynamicLimit(options: UseDynamicLimitOptions = {}): number {
	const {fixedRows = 6, isSearchMode = false, hasError = false} = options;
	const {stdout} = useStdout();
	return Math.max(
		5,
		stdout.rows - fixedRows - (isSearchMode ? 1 : 0) - (hasError ? 3 : 0),
	);
}
