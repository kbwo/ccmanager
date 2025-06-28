import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import ConfigureCommand from './ConfigureCommand.js';
import {configurationManager} from '../services/configurationManager.js';
import type {CommandPreset} from '../types/index.js';

// Mock the configurationManager
vi.mock('../services/configurationManager.js', () => ({
	configurationManager: {
		getCommandPresets: vi.fn(),
		setCommandPresets: vi.fn(),
		addPreset: vi.fn(),
		deletePreset: vi.fn(),
		setDefaultPreset: vi.fn(),
		getCommandConfig: vi.fn(),
		setCommandConfig: vi.fn(),
	},
}));

// Mock shortcutManager
vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		matchesShortcut: vi.fn((shortcut, input, key) => {
			if (shortcut === 'cancel' && key && key.escape) return true;
			return false;
		}),
		getShortcutDisplay: vi.fn(() => 'ESC'),
	},
}));

describe('ConfigureCommand - Preset UI', () => {
	const mockOnComplete = vi.fn();
	const mockPresets: CommandPreset[] = [
		{
			id: '1',
			name: 'Main',
			command: 'claude',
		},
		{
			id: '2',
			name: 'Development',
			command: 'claude',
			args: ['--resume'],
		},
		{
			id: '3',
			name: 'Production',
			command: 'claude',
			args: ['--production'],
			fallbackArgs: ['--no-mcp'],
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		(
			configurationManager.getCommandPresets as ReturnType<typeof vi.fn>
		).mockReturnValue({
			presets: mockPresets,
			defaultPresetId: '1',
		});
		(
			configurationManager.getCommandConfig as ReturnType<typeof vi.fn>
		).mockReturnValue({
			command: 'claude',
		});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('Preset List View', () => {
		it('should display all presets', () => {
			const {lastFrame} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			expect(lastFrame()).toContain('Command Presets');
			expect(lastFrame()).toContain('Main');
			expect(lastFrame()).toContain('Development');
			expect(lastFrame()).toContain('Production');
		});

		it('should indicate the default preset', () => {
			const {lastFrame} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			expect(lastFrame()).toContain('Main (default)');
		});

		it('should show preset commands and args', () => {
			const {lastFrame} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			expect(lastFrame()).toContain('claude');
			expect(lastFrame()).toContain('--resume');
			expect(lastFrame()).toContain('--production');
		});

		it('should have menu options for preset management', () => {
			const {lastFrame} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			expect(lastFrame()).toContain('Add New Preset');
			expect(lastFrame()).toContain('Exit');
		});
	});

	describe('Preset Selection', () => {
		it('should allow selecting a preset for editing', () => {
			const {lastFrame, stdin} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			// Navigate down to second preset
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\r'); // Enter

			expect(lastFrame()).toContain('Edit Preset: Development');
		});

		it('should show edit options for selected preset', () => {
			const {lastFrame, stdin} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			// Select a preset
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\r'); // Enter

			expect(lastFrame()).toContain('Name');
			expect(lastFrame()).toContain('Command');
			expect(lastFrame()).toContain('Arguments');
			expect(lastFrame()).toContain('Fallback Arguments');
			expect(lastFrame()).toContain('Set as Default');
			expect(lastFrame()).toContain('Delete Preset');
		});
	});

	describe('Add New Preset', () => {
		it('should show form for adding new preset', () => {
			const {lastFrame, stdin} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			// Navigate to "Add New Preset" option
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\r'); // Enter

			expect(lastFrame()).toContain('Add New Preset');
			expect(lastFrame()).toContain('Enter preset name:');
		});

		it('should call addPreset when new preset is created', () => {
			const {stdin} = render(<ConfigureCommand onComplete={mockOnComplete} />);

			// Navigate to "Add New Preset"
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\r'); // Enter

			// Enter preset name
			stdin.write('Test Preset');
			stdin.write('\r'); // Enter

			// Should move to command input
			// Enter command
			stdin.write('claude');
			stdin.write('\r'); // Enter

			// Skip args (press enter)
			stdin.write('\r'); // Enter

			// Skip fallback args (press enter)
			stdin.write('\r'); // Enter

			expect(configurationManager.addPreset).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Test Preset',
					command: 'claude',
				}),
			);
		});
	});

	describe('Delete Preset', () => {
		it('should not allow deleting the last preset', () => {
			(
				configurationManager.getCommandPresets as ReturnType<typeof vi.fn>
			).mockReturnValue({
				presets: [mockPresets[0]],
				defaultPresetId: '1',
			});

			const {lastFrame, stdin} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			// Select the only preset
			stdin.write('\r'); // Enter

			// Navigate to delete option
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow

			expect(lastFrame()).toContain(
				'Delete Preset (cannot delete last preset)',
			);
		});

		it('should show confirmation before deleting preset', () => {
			const {lastFrame, stdin} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			// Select a preset
			stdin.write('\x1B[B'); // Down arrow to second preset
			stdin.write('\r'); // Enter

			// Navigate to delete option
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\r'); // Enter

			expect(lastFrame()).toContain('Delete preset "Development"?');
			expect(lastFrame()).toContain('Yes, delete');
			expect(lastFrame()).toContain('Cancel');
		});
	});

	describe('Set Default Preset', () => {
		it('should call setDefaultPreset when setting new default', () => {
			const {stdin} = render(<ConfigureCommand onComplete={mockOnComplete} />);

			// Select second preset
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\r'); // Enter

			// Navigate to "Set as Default"
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\x1B[B'); // Down arrow
			stdin.write('\r'); // Enter

			expect(configurationManager.setDefaultPreset).toHaveBeenCalledWith('2');
		});
	});

	describe('Navigation', () => {
		it('should return to preset list on cancel', () => {
			const {lastFrame, stdin} = render(
				<ConfigureCommand onComplete={mockOnComplete} />,
			);

			// Select a preset
			stdin.write('\r'); // Enter

			// Press escape to go back
			stdin.write('\x1B'); // Escape

			expect(lastFrame()).toContain('Command Presets');
		});

		it('should exit component on escape from main menu', () => {
			const {stdin} = render(<ConfigureCommand onComplete={mockOnComplete} />);

			// Press escape from main menu
			stdin.write('\x1B'); // Escape

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});
});
