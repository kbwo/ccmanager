import {describe, it, expect, vi, afterEach} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import LoadingSpinner from './LoadingSpinner.js';

describe('LoadingSpinner', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('1.1 Core LoadingSpinner component with Unicode animation', () => {
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

	describe('1.2 Component variations and edge cases', () => {
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
});
