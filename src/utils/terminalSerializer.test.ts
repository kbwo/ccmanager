import {describe, it, expect, beforeEach} from 'vitest';
import pkg from '@xterm/headless';
import {TerminalSerializer} from './terminalSerializer.js';

const {Terminal} = pkg;

describe('TerminalSerializer', () => {
	let terminal: InstanceType<typeof Terminal>;

	beforeEach(() => {
		terminal = new Terminal({
			cols: 80,
			rows: 24,
			allowProposedApi: true,
		});
	});

	// Helper to write to terminal and wait for processing
	const writeAsync = (data: string): Promise<void> => {
		return new Promise(resolve => {
			terminal.write(data, () => resolve());
		});
	};

	it('should serialize plain text without escape sequences', async () => {
		await writeAsync('Hello, World!');
		const serialized = TerminalSerializer.serialize(terminal);
		expect(serialized).toContain('Hello, World!');
	});

	it('should preserve foreground colors', async () => {
		// Write red text
		await writeAsync('\x1b[31mRed Text\x1b[0m');
		const serialized = TerminalSerializer.serialize(terminal);
		expect(serialized).toContain('\x1b[31m');
		expect(serialized).toContain('Red Text');
	});

	it('should preserve background colors', async () => {
		// Write text with blue background
		await writeAsync('\x1b[44mBlue Background\x1b[0m');
		const serialized = TerminalSerializer.serialize(terminal);
		expect(serialized).toContain('\x1b[44m');
		expect(serialized).toContain('Blue Background');
	});

	it('should preserve 256 colors', async () => {
		// Write text with extended color (color 196 = bright red)
		await writeAsync('\x1b[38;5;196mExtended Color\x1b[0m');
		const serialized = TerminalSerializer.serialize(terminal);
		expect(serialized).toContain('\x1b[38;5;196m');
		expect(serialized).toContain('Extended Color');
	});

	it('should preserve RGB colors', async () => {
		// Write text with true color RGB
		await writeAsync('\x1b[38;2;255;128;0mOrange RGB\x1b[0m');
		const serialized = TerminalSerializer.serialize(terminal);
		expect(serialized).toContain('\x1b[38;2;255;128;0m');
		expect(serialized).toContain('Orange RGB');
	});

	it('should preserve text styles', async () => {
		// Write bold text
		await writeAsync('\x1b[1mBold Text\x1b[0m');
		const serialized = TerminalSerializer.serialize(terminal);
		expect(serialized).toContain('\x1b[1m');
		expect(serialized).toContain('Bold Text');

		// Clear and write italic text
		terminal.reset();
		await writeAsync('\x1b[3mItalic Text\x1b[0m');
		const serializedItalic = TerminalSerializer.serialize(terminal);
		expect(serializedItalic).toContain('\x1b[3m');
		expect(serializedItalic).toContain('Italic Text');
	});

	it('should handle multiple lines correctly', async () => {
		await writeAsync('Line 1\r\n');
		await writeAsync('\x1b[32mLine 2 (green)\x1b[0m\r\n');
		await writeAsync('Line 3');

		const serialized = TerminalSerializer.serialize(terminal);
		const lines = serialized.split('\n');
		expect(lines.length).toBeGreaterThanOrEqual(3);
		expect(lines[0]).toContain('Line 1');
		expect(lines[1]).toContain('\x1b[32m');
		expect(lines[1]).toContain('Line 2 (green)');
		expect(lines[2]).toContain('Line 3');
	});

	it('should trim trailing empty lines when trimRight is true', async () => {
		await writeAsync('Content\r\n\r\n\r\n\r\n');
		const serialized = TerminalSerializer.serialize(terminal, {
			trimRight: true,
		});
		const lines = serialized.split('\n');
		// Should only have the content line, not the trailing empty lines
		expect(lines[0]).toContain('Content');
		expect(lines.length).toBe(1); // Plus reset code
	});

	it('should preserve empty lines when includeEmptyLines is true', async () => {
		await writeAsync('Line 1\r\n\r\nLine 3');
		const serialized = TerminalSerializer.serialize(terminal, {
			includeEmptyLines: true,
		});
		const lines = serialized.split('\n');
		expect(lines.length).toBe(3); // 3 lines including the empty one
		expect(lines[1]).toBe(''); // Empty line
	});

	it('should handle getLastLines correctly', async () => {
		// Create a small terminal so we can see the scrolling
		const smallTerminal = new Terminal({
			cols: 80,
			rows: 10,
			allowProposedApi: true,
		});

		// Helper for this specific terminal
		const writeToSmall = (data: string): Promise<void> => {
			return new Promise(resolve => {
				smallTerminal.write(data, () => resolve());
			});
		};

		// Write enough lines to fill and scroll the buffer
		for (let i = 1; i <= 15; i++) {
			await writeToSmall(`Line ${i}\r\n`);
		}

		const lastLines = TerminalSerializer.getLastLines(smallTerminal, 3);

		// Should contain the last few lines
		expect(lastLines).toContain('Line 14');
		expect(lastLines).toContain('Line 15');
		// Should not contain much older lines
		expect(lastLines).not.toContain('Line 10');
	});

	it('should handle complex mixed formatting', async () => {
		// Complex formatting with multiple attributes
		await writeAsync(
			'\x1b[1;31;44mBold Red on Blue\x1b[0m Normal \x1b[3;38;5;226mItalic Yellow\x1b[0m',
		);
		const serialized = TerminalSerializer.serialize(terminal);

		// Should contain various escape sequences
		expect(serialized).toContain('Bold Red on Blue');
		expect(serialized).toContain('Normal');
		expect(serialized).toContain('Italic Yellow');
		// Should have some escape sequences (exact sequences may vary based on implementation)
		expect(serialized).toMatch(/\x1b\[\d+(;\d+)*m/);
	});

	it('should add reset at the end', async () => {
		await writeAsync('Some text');
		const serialized = TerminalSerializer.serialize(terminal);
		expect(serialized).toMatch(/\x1b\[0m$/);
	});
});
