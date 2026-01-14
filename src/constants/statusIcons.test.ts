import {describe, it, expect} from 'vitest';
import {
	getStatusDisplay,
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
		it('should append [BG] badge when idle and hasBackgroundTask is true', () => {
			const result = getStatusDisplay('idle', true);
			expect(result).toBe(
				`${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});

		it('should not append [BG] badge when idle and hasBackgroundTask is false', () => {
			const result = getStatusDisplay('idle', false);
			expect(result).toBe(`${STATUS_ICONS.IDLE} ${STATUS_LABELS.IDLE}`);
		});

		it('should append [BG] badge when busy and hasBackgroundTask is true', () => {
			const result = getStatusDisplay('busy', true);
			expect(result).toBe(
				`${STATUS_ICONS.BUSY} ${STATUS_LABELS.BUSY} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});

		it('should append [BG] badge when waiting_input and hasBackgroundTask is true', () => {
			const result = getStatusDisplay('waiting_input', true);
			expect(result).toBe(
				`${STATUS_ICONS.WAITING} ${STATUS_LABELS.WAITING} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});

		it('should append [BG] badge when pending_auto_approval and hasBackgroundTask is true', () => {
			const result = getStatusDisplay('pending_auto_approval', true);
			expect(result).toBe(
				`${STATUS_ICONS.WAITING} ${STATUS_LABELS.PENDING_AUTO_APPROVAL} ${STATUS_TAGS.BACKGROUND_TASK}`,
			);
		});
	});
});
