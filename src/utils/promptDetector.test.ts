import {describe, it, expect} from 'vitest';
import {
	includesPromptBoxBottomBorder,
	includesPromptBoxTopBorder,
	includesPromptBoxLine,
} from './promptDetector.js';

describe('includesPromptBoxBottomBorder', () => {
	it('should return false for empty output', () => {
		expect(includesPromptBoxBottomBorder('')).toBe(false);
		expect(includesPromptBoxBottomBorder('   ')).toBe(false);
		expect(includesPromptBoxBottomBorder('\n\n')).toBe(false);
	});

	it('should accept lines ending with ╯', () => {
		// Basic pattern
		expect(includesPromptBoxBottomBorder('──╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('────────╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('─╯')).toBe(true);
	});

	it('should accept complete bottom border (╰───╯)', () => {
		expect(includesPromptBoxBottomBorder('╰───╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('╰─────────────╯')).toBe(true);
		expect(includesPromptBoxBottomBorder('╰─╯')).toBe(true);
	});

	it('should accept when part of multi-line output', () => {
		const output1 = `Some text
──╯
More text`;
		expect(includesPromptBoxBottomBorder(output1)).toBe(true);

		const output2 = `First line
╰─────────────╯
Last line`;
		expect(includesPromptBoxBottomBorder(output2)).toBe(true);
	});

	it('should accept with leading/trailing whitespace', () => {
		expect(includesPromptBoxBottomBorder('  ──╯  ')).toBe(true);
		expect(includesPromptBoxBottomBorder('\t╰───╯\t')).toBe(true);
		expect(includesPromptBoxBottomBorder('\n──╯\n')).toBe(true);
	});

	it('should reject when ╯ is followed by │', () => {
		expect(includesPromptBoxBottomBorder('──╯ │')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰───╯ │')).toBe(false);
		expect(includesPromptBoxBottomBorder('──╯ │ more text')).toBe(false);
	});

	it('should reject when line starts with ╰ but does not end with ╯', () => {
		expect(includesPromptBoxBottomBorder('╰───')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰─────────')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰─── some text')).toBe(false);
	});

	it('should reject lines that do not match the pattern', () => {
		// Missing ─ characters
		expect(includesPromptBoxBottomBorder('╯')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰╯')).toBe(false);

		// Wrong characters
		expect(includesPromptBoxBottomBorder('===╯')).toBe(false);
		expect(includesPromptBoxBottomBorder('╰===╯')).toBe(false);
		expect(includesPromptBoxBottomBorder('---╯')).toBe(false);

		// Top border pattern
		expect(includesPromptBoxBottomBorder('╭───╮')).toBe(false);

		// Middle line pattern
		expect(includesPromptBoxBottomBorder('│ > │')).toBe(false);

		// Random text
		expect(includesPromptBoxBottomBorder('Some random text')).toBe(false);
		expect(includesPromptBoxBottomBorder('Exit code: 0')).toBe(false);
	});

	it('should handle complex multi-line scenarios correctly', () => {
		const validOutput = `
╭────────────────────╮
│ > hello            │
╰────────────────────╯
Some status text`;
		expect(includesPromptBoxBottomBorder(validOutput)).toBe(true);

		const invalidOutput = `
╭────────────────────╮
│ > hello            │
╰──────────────────── 
Some other text`;
		expect(includesPromptBoxBottomBorder(invalidOutput)).toBe(false);
	});

	it('should handle partial border at end of line', () => {
		const partialBorder = `Some output text ──╯`;
		expect(includesPromptBoxBottomBorder(partialBorder)).toBe(true);

		const partialInvalid = `Some output text ──╯ │`;
		expect(includesPromptBoxBottomBorder(partialInvalid)).toBe(false);
	});
});

describe('includesPromptBoxTopBorder', () => {
	it('should return false for empty output', () => {
		expect(includesPromptBoxTopBorder('')).toBe(false);
		expect(includesPromptBoxTopBorder('   ')).toBe(false);
		expect(includesPromptBoxTopBorder('\n\n')).toBe(false);
	});

	it('should accept lines ending with ╮', () => {
		// Basic pattern
		expect(includesPromptBoxTopBorder('──╮')).toBe(true);
		expect(includesPromptBoxTopBorder('────────╮')).toBe(true);
		expect(includesPromptBoxTopBorder('─╮')).toBe(true);
	});

	it('should accept complete top border (╭───╮)', () => {
		expect(includesPromptBoxTopBorder('╭───╮')).toBe(true);
		expect(includesPromptBoxTopBorder('╭─────────────╮')).toBe(true);
		expect(includesPromptBoxTopBorder('╭─╮')).toBe(true);
	});

	it('should accept when part of multi-line output', () => {
		const output1 = `Some text
──╮
More text`;
		expect(includesPromptBoxTopBorder(output1)).toBe(true);

		const output2 = `First line
╭─────────────╮
Last line`;
		expect(includesPromptBoxTopBorder(output2)).toBe(true);
	});

	it('should accept with leading/trailing whitespace', () => {
		expect(includesPromptBoxTopBorder('  ──╮  ')).toBe(true);
		expect(includesPromptBoxTopBorder('\t╭───╮\t')).toBe(true);
		expect(includesPromptBoxTopBorder('\n──╮\n')).toBe(true);
	});

	it('should reject when ╮ is followed by │', () => {
		expect(includesPromptBoxTopBorder('──╮ │')).toBe(false);
		expect(includesPromptBoxTopBorder('╭───╮ │')).toBe(false);
		expect(includesPromptBoxTopBorder('──╮ │ some text')).toBe(false);
	});

	it('should reject when line starts with ╭ but does not end with ╮', () => {
		expect(includesPromptBoxTopBorder('╭──')).toBe(false);
		expect(includesPromptBoxTopBorder('╭─────────')).toBe(false);
		expect(includesPromptBoxTopBorder('╭─── some text')).toBe(false);
	});

	it('should reject lines that do not match the pattern', () => {
		// Missing ─ characters
		expect(includesPromptBoxTopBorder('╮')).toBe(false);
		expect(includesPromptBoxTopBorder('╭╮')).toBe(false);

		// Wrong characters
		expect(includesPromptBoxTopBorder('===╮')).toBe(false);
		expect(includesPromptBoxTopBorder('╭===╮')).toBe(false);
		expect(includesPromptBoxTopBorder('---╮')).toBe(false);

		// Bottom border pattern
		expect(includesPromptBoxTopBorder('╰───╯')).toBe(false);

		// Middle line pattern
		expect(includesPromptBoxTopBorder('│ > │')).toBe(false);

		// Random text
		expect(includesPromptBoxTopBorder('Some random text')).toBe(false);
		expect(includesPromptBoxTopBorder('Exit code: 0')).toBe(false);
	});

	it('should handle complex multi-line scenarios correctly', () => {
		const validOutput = `
Some status text
╭────────────────────╮
│ > hello            │
╰────────────────────╯`;
		expect(includesPromptBoxTopBorder(validOutput)).toBe(true);

		const invalidOutput = `
Some status text
 ────────────────────╮
│ > hello            │
╰────────────────────╯`;
		expect(includesPromptBoxTopBorder(invalidOutput)).toBe(true);
	});

	it('should handle partial border at end of line', () => {
		const partialBorder = `Some output text ──╮`;
		expect(includesPromptBoxTopBorder(partialBorder)).toBe(true);

		const partialInvalid = `Some output text ──╮ │`;
		expect(includesPromptBoxTopBorder(partialInvalid)).toBe(false);
	});
});

describe('includesPromptBoxLine', () => {
	it('should return false for empty output', () => {
		expect(includesPromptBoxLine('')).toBe(false);
		expect(includesPromptBoxLine('   ')).toBe(false);
		expect(includesPromptBoxLine('\n\n')).toBe(false);
	});

	it('should accept lines with prompt box pattern', () => {
		// Basic patterns
		expect(includesPromptBoxLine('│ > ')).toBe(true);
		expect(includesPromptBoxLine('│ >  ')).toBe(true);
		expect(includesPromptBoxLine('│ >   ')).toBe(true);
		expect(includesPromptBoxLine('│ >                     ')).toBe(true);

		// With spaces before >
		expect(includesPromptBoxLine('│  > ')).toBe(true);
		expect(includesPromptBoxLine('│   >  ')).toBe(true);
		expect(includesPromptBoxLine('│\t> ')).toBe(true);
	});

	it('should accept when part of multi-line output', () => {
		const output1 = `╭────────────────────╮
│ >                  │
╰────────────────────╯`;
		expect(includesPromptBoxLine(output1)).toBe(true);

		const output2 = `Some text before
│ > hello world      │
Some text after`;
		expect(includesPromptBoxLine(output2)).toBe(true);
	});

	it('should accept with content after the prompt', () => {
		expect(includesPromptBoxLine('│ > hello')).toBe(true);
		expect(includesPromptBoxLine('│ > hello world │')).toBe(true);
		expect(includesPromptBoxLine('│ > some command here │')).toBe(true);
	});

	it('should reject lines without the pattern', () => {
		// Missing space after > (now accepts zero spaces)
		expect(includesPromptBoxLine('│ >')).toBe(true);
		expect(includesPromptBoxLine('│>')).toBe(true);

		// Missing >
		expect(includesPromptBoxLine('│   ')).toBe(false);
		expect(includesPromptBoxLine('│ hello')).toBe(false);

		// Missing │
		expect(includesPromptBoxLine(' > ')).toBe(false);
		expect(includesPromptBoxLine('> ')).toBe(false);

		// Wrong characters
		expect(includesPromptBoxLine('| > ')).toBe(false);
		expect(includesPromptBoxLine('│ < ')).toBe(false);
		expect(includesPromptBoxLine('│ » ')).toBe(false);

		// Random text
		expect(includesPromptBoxLine('Some random text')).toBe(false);
		expect(includesPromptBoxLine('Exit code: 0')).toBe(false);
	});

	it('should handle complex scenarios', () => {
		const validPromptBox = `
╭────────────────────────────────────────────────────────────────────────────────╮
│ Enter your message below. Press ESC to send | Type /help for help              │
├────────────────────────────────────────────────────────────────────────────────┤
│ >                                                                              │
╰────────────────────────────────────────────────────────────────────────────────╯`;
		expect(includesPromptBoxLine(validPromptBox)).toBe(true);

		const invalidPromptBox = `
╭────────────────────────────────────────────────────────────────────────────────╮
│ Enter your message below. Press ESC to send | Type /help for help              │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
╰────────────────────────────────────────────────────────────────────────────────╯`;
		expect(includesPromptBoxLine(invalidPromptBox)).toBe(false);
	});

	it('should handle edge cases', () => {
		// Multiple prompt lines
		const multiplePrompts = `│ > first
│ > second
│ > third`;
		expect(includesPromptBoxLine(multiplePrompts)).toBe(true);

		// Mixed valid and invalid
		const mixed = `│ no prompt here
│ > valid prompt
│ also no prompt`;
		expect(includesPromptBoxLine(mixed)).toBe(true);
	});
});
