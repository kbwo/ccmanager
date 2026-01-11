import {SessionState} from '../types/index.js';

export const STATUS_ICONS = {
	BUSY: '●',
	WAITING: '◐',
	IDLE: '○',
} as const;

export const STATUS_LABELS = {
	BUSY: 'Busy',
	WAITING: 'Waiting',
	PENDING_AUTO_APPROVAL: 'Pending Auto Approval',
	IDLE: 'Idle',
} as const;

export const STATUS_TAGS = {
	BACKGROUND_TASK: '\x1b[2m[BG]\x1b[0m',
} as const;

export const MENU_ICONS = {
	NEW_WORKTREE: '⊕',
	MERGE_WORKTREE: '⇄',
	DELETE_WORKTREE: '✕',
	CONFIGURE_SHORTCUTS: '⌨',
	EXIT: '⏻',
} as const;

export const getStatusDisplay = (
	status: SessionState,
	hasBackgroundTask: boolean = false,
): string => {
	switch (status) {
		case 'busy':
			return `${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY}`;
		case 'waiting_input':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`;
		case 'pending_auto_approval':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.PENDING_AUTO_APPROVAL}`;
		case 'idle':
			return hasBackgroundTask
				? `${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE} ${STATUS_TAGS.BACKGROUND_TASK}`
				: `${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`;
	}
};
