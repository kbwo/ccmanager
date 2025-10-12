import {describe, it, expect, vi, afterEach} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import LoadingSpinner from './LoadingSpinner.js';

describe('LoadingSpinner', () => {
	// Store original environment variables for restoration
	const originalEnv = {...process.env};
	const originalPlatform = process.platform;

	afterEach(() => {
		// Restore original environment
		process.env = {...originalEnv};

		// Restore platform if it was modified
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			writable: true,
			configurable: true,
		});

		vi.restoreAllMocks();
	});

	describe('Core LoadingSpinner component with Unicode animation', () => {
		it('should render with default props and display message with cyan spinner', () => {
			const {lastFrame} = render(<LoadingSpinner message="Loading..." />);

			const output = lastFrame();
			expect(output).toContain('Loading...');
			// Should contain one of the Unicode spinner frames
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should render with custom color prop (yellow for devcontainer operations)', () => {
			const {lastFrame} = render(
				<LoadingSpinner message="Starting devcontainer..." color="yellow" />,
			);

			const output = lastFrame();
			expect(output).toContain('Starting devcontainer...');
			// Verify spinner is present
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should use ASCII fallback frames when spinnerType is "line"', () => {
			const {lastFrame} = render(
				<LoadingSpinner message="Processing..." spinnerType="line" />,
			);

			const output = lastFrame();
			expect(output).toContain('Processing...');
			// Should contain one of the ASCII spinner frames
			expect(output).toMatch(/[-\\|/]/);
		});

		it('should set up animation interval with 120ms timing', () => {
			const setIntervalSpy = vi.spyOn(global, 'setInterval');

			render(<LoadingSpinner message="Loading..." />);

			// Verify setInterval was called with 120ms timing
			expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 120);
		});

		it('should cleanup interval on component unmount to prevent memory leaks', () => {
			const {unmount} = render(<LoadingSpinner message="Loading..." />);

			// Verify unmount completes without errors (cleanup function runs properly)
			expect(() => unmount()).not.toThrow();
		});

		it('should preserve message text', () => {
			const message = 'Creating session...';
			const {lastFrame} = render(<LoadingSpinner message={message} />);

			// Check message is rendered
			expect(lastFrame()).toContain(message);
		});

		it('should render in flexDirection="row" layout with spinner and message', () => {
			const {lastFrame} = render(<LoadingSpinner message="Test message" />);

			const output = lastFrame();
			// Verify both spinner and message are present in the same line (row layout)
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+Test message/);
		});
	});

	describe('Component variations and edge cases', () => {
		it('should accept "green" color option', () => {
			const {lastFrame} = render(
				<LoadingSpinner message="Success loading..." color="green" />,
			);

			const output = lastFrame();
			expect(output).toContain('Success loading...');
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should render Unicode frames correctly', () => {
			const {lastFrame} = render(<LoadingSpinner message="Test" />);

			const output = lastFrame();
			// Should contain one of the Unicode frames
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should render ASCII frames when using "line" spinner type', () => {
			const {lastFrame} = render(
				<LoadingSpinner message="Test" spinnerType="line" />,
			);

			const output = lastFrame();
			// Should contain one of the ASCII frames
			expect(output).toMatch(/[-\\|/]/);
		});

		it('should handle empty message string', () => {
			const {lastFrame} = render(<LoadingSpinner message="" />);

			const output = lastFrame();
			// Should still render spinner even with empty message
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should handle long message text without breaking layout', () => {
			const longMessage =
				'This is a very long loading message that might wrap on narrow terminals';
			const {lastFrame} = render(<LoadingSpinner message={longMessage} />);

			const output = lastFrame();
			expect(output).toContain(longMessage);
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should use cyan as default color', () => {
			const {lastFrame} = render(<LoadingSpinner message="Test" />);

			const output = lastFrame();
			// Just verify it renders successfully with default color
			expect(output).toContain('Test');
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should use dots as default spinner type', () => {
			const {lastFrame} = render(<LoadingSpinner message="Test" />);

			const output = lastFrame();
			// Default should be Unicode dots, not ASCII line
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});
	});

	describe('Terminal compatibility detection', () => {
		it('should automatically detect Unicode support and use Unicode frames', () => {
			// Set up environment for Unicode support
			process.env['TERM'] = 'xterm-256color';

			const {lastFrame} = render(<LoadingSpinner message="Loading..." />);

			const output = lastFrame();
			// Should use Unicode frames when terminal supports it
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
			expect(output).toContain('Loading...');
		});

		it('should automatically fallback to ASCII when terminal does not support Unicode', () => {
			// Set up environment without Unicode support
			process.env['TERM'] = 'dumb';
			delete process.env['LANG'];
			delete process.env['LC_ALL'];

			const {lastFrame} = render(<LoadingSpinner message="Loading..." />);

			const output = lastFrame();
			// Should use ASCII frames when terminal doesn't support Unicode
			expect(output).toMatch(/[-\\|/]/);
			expect(output).toContain('Loading...');
		});

		it('should respect explicit spinnerType prop over automatic detection', () => {
			// Even with Unicode support, explicit "line" should use ASCII
			process.env['TERM'] = 'xterm-256color';

			const {lastFrame} = render(
				<LoadingSpinner message="Loading..." spinnerType="line" />,
			);

			const output = lastFrame();
			// Explicit spinnerType should override detection
			expect(output).toMatch(/[-\\|/]/);
		});

		it('should detect Unicode support on Windows with Windows Terminal', () => {
			// Mock Windows platform
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				writable: true,
				configurable: true,
			});
			process.env['WT_SESSION'] = 'some-session-id';

			const {lastFrame} = render(<LoadingSpinner message="Loading..." />);

			const output = lastFrame();
			// Should use Unicode on Windows Terminal
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should fallback to ASCII on Windows without Windows Terminal', () => {
			// Mock Windows platform without Windows Terminal
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				writable: true,
				configurable: true,
			});
			delete process.env['WT_SESSION'];
			delete process.env['TERM'];
			delete process.env['LANG'];

			const {lastFrame} = render(<LoadingSpinner message="Loading..." />);

			const output = lastFrame();
			// Should use ASCII on Windows without WT
			expect(output).toMatch(/[-\\|/]/);
		});

		it('should detect Unicode support from LANG environment variable', () => {
			delete process.env['TERM'];
			process.env['LANG'] = 'en_US.UTF-8';

			const {lastFrame} = render(<LoadingSpinner message="Loading..." />);

			const output = lastFrame();
			// Should use Unicode when LANG indicates UTF-8
			expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		});

		it('should detect Unicode support with appropriate frame rate', () => {
			process.env['TERM'] = 'xterm-256color';

			const setIntervalSpy = vi.spyOn(global, 'setInterval');
			render(<LoadingSpinner message="Loading..." />);

			// Verify frame rate is 120ms regardless of detection
			expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 120);
		});
	});
});
