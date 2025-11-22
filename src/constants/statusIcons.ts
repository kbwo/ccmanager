export const STATUS_ICONS = {
	BUSY: '●',
	WAITING: '◐',
	IDLE: '○',
} as const;

export const STATUS_LABELS = {
	BUSY: 'Busy',
	WAITING: 'Waiting',
	IDLE: 'Idle',
} as const;

export const MENU_ICONS = {
	NEW_WORKTREE: '⊕',
	MERGE_WORKTREE: '⇄',
	DELETE_WORKTREE: '✕',
	CONFIGURE_SHORTCUTS: '⌨',
	EXIT: '⏻',
} as const;

export const getStatusDisplay = (
	status: 'busy' | 'waiting_input' | 'idle' | 'pending_auto_approval',
): string => {
	switch (status) {
		case 'busy':
			return `${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY}`;
		case 'waiting_input':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`;
		case 'pending_auto_approval':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`;
		case 'idle':
			return `${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`;
	}
};
