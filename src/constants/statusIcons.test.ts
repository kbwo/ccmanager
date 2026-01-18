import {describe, it, expect} from 'vitest';
import {
	getStatusDisplay,
	getBackgroundTaskTag,
	STATUS_ICONS,
	STATUS_LABELS,
	STATUS_TAGS,
} from './statusIcons.js';

describe('getStatusDisplay', () => {
	it('should return busy display for busy state', () => {
		const result = getStatusDisplay('busy');
		expect(result).toBe(`${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY}`);
	});

	it('should return waiting display for waiting_input state', () => {
		const result = getStatusDisplay('waiting_input');
		expect(result).toBe(`${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING}`);
	});

	it('should return pending auto approval display', () => {
		const result = getStatusDisplay('pending_auto_approval');
		expect(result).toBe(
			`${STATUS_ICONS.WAITING} ${STATUS_LABELS.PENDING_AUTO_APPROVAL}`,
		);
	});

	it('should return idle display for idle state', () => {
		const result = getStatusDisplay('idle');
		expect(result).toBe(`${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`);
	});

	describe('background task indicator', () => {
		it('should append [BG] badge when idle and backgroundTaskCount is 1', () => {
			const result = getStatusDisplay('idle', 1);
			expect(result).toBe(
				`${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});

		it('should not append [BG] badge when idle and backgroundTaskCount is 0', () => {
			const result = getStatusDisplay('idle', 0);
			expect(result).toBe(`${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`);
		});

		it('should append [BG] badge when busy and backgroundTaskCount is 1', () => {
			const result = getStatusDisplay('busy', 1);
			expect(result).toBe(
				`${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});

		it('should append [BG] badge when waiting_input and backgroundTaskCount is 1', () => {
			const result = getStatusDisplay('waiting_input', 1);
			expect(result).toBe(
				`${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});

		it('should append [BG] badge when pending_auto_approval and backgroundTaskCount is 1', () => {
			const result = getStatusDisplay('pending_auto_approval', 1);
			expect(result).toBe(
				`${STATUS_ICONS.WAITING} ${STATUS_LABELS.PENDING_AUTO_APPROVAL} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});

		it('should append [BG:2] badge when backgroundTaskCount is 2', () => {
			const result = getStatusDisplay('idle', 2);
			expect(result).toBe(
				`${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE} \x1b[2m[BG:2]\x1b[0m`,
			);
		});

		it('should append [BG:5] badge when backgroundTaskCount is 5', () => {
			const result = getStatusDisplay('busy', 5);
			expect(result).toBe(
				`${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY} \x1b[2m[BG:5]\x1b[0m`,
			);
		});
	});
});

describe('getBackgroundTaskTag', () => {
	it('should return empty string when count is 0', () => {
		const result = getBackgroundTaskTag(0);
		expect(result).toBe('');
	});

	it('should return empty string when count is negative', () => {
		expect(getBackgroundTaskTag(-1)).toBe('');
		expect(getBackgroundTaskTag(-100)).toBe('');
	});

	it('should return [BG] when count is 1', () => {
		const result = getBackgroundTaskTag(1);
		expect(result).toBe(STATUS_TAGS.BACKGROUND_TASK);
	});

	it('should return [BG:2] when count is 2', () => {
		const result = getBackgroundTaskTag(2);
		expect(result).toBe('\x1b[2m[BG:2]\x1b[0m');
	});

	it('should return [BG:10] when count is 10', () => {
		const result = getBackgroundTaskTag(10);
		expect(result).toBe('\x1b[2m[BG:10]\x1b[0m');
	});
});
