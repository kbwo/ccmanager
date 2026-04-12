// Duration in milliseconds that a detected state must persist before being confirmed.
// A higher value prevents transient flicker (e.g., brief "idle" during terminal re-renders)
// at the cost of slightly slower state transitions.
export const STATE_PERSISTENCE_DURATION_MS = 1000;

// Check interval for state detection in milliseconds
export const STATE_CHECK_INTERVAL_MS = 100;

// Minimum duration in current state before allowing transition to a new state.
// Prevents rapid back-and-forth flicker (e.g., busy → idle → busy).
export const STATE_MINIMUM_DURATION_MS = 1000;
