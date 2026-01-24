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

export const getBackgroundTaskTag = (count: number): string => {
	if (count <= 0) {
		return '';
	}
	if (count === 1) {
		return STATUS_TAGS.BACKGROUND_TASK;
	}
	// count >= 2: show [BG:N]
	return `\x1b[2m[BG:${count}]\x1b[0m`;
};

export const MENU_ICONS = {
	NEW_WORKTREE: '⊕',
	MERGE_WORKTREE: '⇄',
	DELETE_WORKTREE: '✕',
	CONFIGURE_SHORTCUTS: '⌨',
	EXIT: '⏻',
} as const;

const getBaseStatusDisplay = (status: SessionState): string => {
	switch (status) {
		case 'busy':
			return `${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY}`;
		case 'waiting_input':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`;
		case 'pending_auto_approval':
			return `${STATUS_ICONS.WAITING} ${STATUS_LABELS.PENDING_AUTO_APPROVAL}`;
		case 'idle':
			return `${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`;
	}
};

export const getStatusDisplay = (
	status: SessionState,
	backgroundTaskCount: number = 0,
): string => {
	const display = getBaseStatusDisplay(status);
	const bgTag = getBackgroundTaskTag(backgroundTaskCount);
	return bgTag ? `${display} ${bgTag}` : display;
};
