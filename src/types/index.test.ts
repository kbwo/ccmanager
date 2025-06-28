import {describe, it, expect} from 'vitest';
import type {CommandPreset, CommandPresetsConfig} from './index.js';

describe('CommandPreset Types', () => {
	describe('CommandPreset', () => {
		it('should have required fields', () => {
			const preset: CommandPreset = {
				id: '1',
				name: 'Main',
				command: 'claude',
			};

			expect(preset.id).toBe('1');
			expect(preset.name).toBe('Main');
			expect(preset.command).toBe('claude');
			expect(preset.args).toBeUndefined();
			expect(preset.fallbackArgs).toBeUndefined();
		});

		it('should support optional args', () => {
			const preset: CommandPreset = {
				id: '2',
				name: 'With Resume',
				command: 'claude',
				args: ['--resume'],
			};

			expect(preset.args).toEqual(['--resume']);
		});

		it('should support optional fallbackArgs', () => {
			const preset: CommandPreset = {
				id: '3',
				name: 'With Fallback',
				command: 'claude',
				fallbackArgs: ['--no-mcp'],
			};

			expect(preset.fallbackArgs).toEqual(['--no-mcp']);
		});

		it('should support all fields', () => {
			const preset: CommandPreset = {
				id: '4',
				name: 'Full Preset',
				command: 'claude',
				args: ['--resume', '--verbose'],
				fallbackArgs: ['--no-mcp'],
			};

			expect(preset).toEqual({
				id: '4',
				name: 'Full Preset',
				command: 'claude',
				args: ['--resume', '--verbose'],
				fallbackArgs: ['--no-mcp'],
			});
		});
	});

	describe('CommandPresetsConfig', () => {
		it('should have presets array and defaultPresetId', () => {
			const config: CommandPresetsConfig = {
				presets: [
					{
						id: '1',
						name: 'Main',
						command: 'claude',
					},
				],
				defaultPresetId: '1',
			};

			expect(config.presets).toHaveLength(1);
			expect(config.defaultPresetId).toBe('1');
		});

		it('should support multiple presets', () => {
			const config: CommandPresetsConfig = {
				presets: [
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
				],
				defaultPresetId: '1',
			};

			expect(config.presets).toHaveLength(3);
			expect(config.presets[0]!.name).toBe('Main');
			expect(config.presets[1]!.name).toBe('Development');
			expect(config.presets[2]!.name).toBe('Production');
		});

		it('should ensure defaultPresetId references an existing preset', () => {
			const config: CommandPresetsConfig = {
				presets: [
					{
						id: '1',
						name: 'Main',
						command: 'claude',
					},
					{
						id: '2',
						name: 'Custom',
						command: 'claude',
						args: ['--custom'],
					},
				],
				defaultPresetId: '2',
			};

			const defaultPreset = config.presets.find(
				p => p.id === config.defaultPresetId,
			);
			expect(defaultPreset).toBeDefined();
			expect(defaultPreset?.name).toBe('Custom');
		});
	});
});
