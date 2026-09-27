import {useStdout} from 'ink';

// Columns a list row spends before the assembled label: the SelectInput
// indicator ("❯ " or two spaces) plus the number prefix ("0 ❯ " / "  ❯ ").
const ROW_PREFIX_WIDTH = 6;
// Terminal width assumed when stdout reports none (e.g. a non-TTY test stream).
const FALLBACK_TERMINAL_WIDTH = 80;

/**
 * Number of terminal columns a worktree/session row label may occupy.
 * Passed to calculateColumnPositions, which drops the aligned session-state
 * column when the resulting layout would not fit in it.
 */
export function useAvailableLabelWidth(): number {
	const {stdout} = useStdout();
	return Math.max(
		0,
		(stdout.columns || FALLBACK_TERMINAL_WIDTH) - ROW_PREFIX_WIDTH,
	);
}
