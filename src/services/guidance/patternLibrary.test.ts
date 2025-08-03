import {describe, it, expect, beforeEach} from 'vitest';
import {PatternLibrary} from './patternLibrary.js';
import type {PatternCategory, PatternPriority} from '../../types/index.js';

describe('PatternLibrary', () => {
	beforeEach(() => {
		// Reset library state
	});

	describe('getAllPatterns', () => {
		it('should return all available patterns', () => {
			const patterns = PatternLibrary.getAllPatterns();
			expect(patterns.length).toBeGreaterThan(0);

			// Verify all patterns have required properties
			patterns.forEach(pattern => {
				expect(pattern).toHaveProperty('id');
				expect(pattern).toHaveProperty('name');
				expect(pattern).toHaveProperty('description');
				expect(pattern).toHaveProperty('category');
				expect(pattern).toHaveProperty('priority');
				expect(pattern).toHaveProperty('pattern');
				expect(pattern).toHaveProperty('guidance');
				expect(pattern).toHaveProperty('enabled');
				expect(pattern.pattern).toBeInstanceOf(RegExp);
			});
		});

		it('should include critical error patterns', () => {
			const patterns = PatternLibrary.getAllPatterns();
			const criticalPatterns = patterns.filter(p => p.priority === 'critical');
			expect(criticalPatterns.length).toBeGreaterThan(0);

			// Should have error detection patterns
			const errorPatterns = criticalPatterns.filter(
				p => p.category === 'error_detection',
			);
			expect(errorPatterns.length).toBeGreaterThan(0);
		});
	});

	describe('getPatternsByCategory', () => {
		it('should filter patterns by category correctly', () => {
			const errorPatterns =
				PatternLibrary.getPatternsByCategory('error_detection');
			expect(errorPatterns.length).toBeGreaterThan(0);

			errorPatterns.forEach(pattern => {
				expect(pattern.category).toBe('error_detection');
			});
		});

		it('should return empty array for non-existent category', () => {
			const patterns = PatternLibrary.getPatternsByCategory(
				'non_existent' as PatternCategory,
			);
			expect(patterns).toEqual([]);
		});
	});

	describe('getPatternsByPriority', () => {
		it('should filter patterns by priority correctly', () => {
			const criticalPatterns = PatternLibrary.getPatternsByPriority('critical');
			expect(criticalPatterns.length).toBeGreaterThan(0);

			criticalPatterns.forEach(pattern => {
				expect(pattern.priority).toBe('critical');
			});
		});
	});

	describe('getEnabledPatterns', () => {
		it('should return only enabled patterns', () => {
			const enabledPatterns = PatternLibrary.getEnabledPatterns();
			expect(enabledPatterns.length).toBeGreaterThan(0);

			enabledPatterns.forEach(pattern => {
				expect(pattern.enabled).toBe(true);
			});
		});
	});

	describe('getPatternById', () => {
		it('should find pattern by ID', () => {
			const pattern = PatternLibrary.getPatternById('unhandled_error');
			expect(pattern).toBeDefined();
			expect(pattern?.id).toBe('unhandled_error');
			expect(pattern?.category).toBe('error_detection');
			expect(pattern?.priority).toBe('critical');
		});

		it('should return undefined for non-existent ID', () => {
			const pattern = PatternLibrary.getPatternById('non_existent');
			expect(pattern).toBeUndefined();
		});
	});

	describe('addCustomPattern', () => {
		it('should add custom pattern successfully', () => {
			const customPattern = {
				id: 'test_pattern',
				name: 'Test Pattern',
				description: 'A test pattern',
				category: 'code_quality' as PatternCategory,
				priority: 'low' as PatternPriority,
				pattern: /test/gi,
				guidance: 'Test guidance',
				enabled: true,
			};

			PatternLibrary.addCustomPattern(customPattern);
			const retrievedPattern = PatternLibrary.getPatternById('test_pattern');
			expect(retrievedPattern).toEqual(customPattern);
		});

		it('should throw error for duplicate pattern ID', () => {
			const customPattern = {
				id: 'unhandled_error', // This ID already exists
				name: 'Duplicate Pattern',
				description: 'A duplicate pattern',
				category: 'code_quality' as PatternCategory,
				priority: 'low' as PatternPriority,
				pattern: /test/gi,
				guidance: 'Test guidance',
				enabled: true,
			};

			expect(() => {
				PatternLibrary.addCustomPattern(customPattern);
			}).toThrow("Pattern with ID 'unhandled_error' already exists");
		});
	});

	describe('updatePatternEnabled', () => {
		it('should update pattern enabled state', () => {
			const result = PatternLibrary.updatePatternEnabled(
				'unhandled_error',
				false,
			);
			expect(result).toBe(true);

			const pattern = PatternLibrary.getPatternById('unhandled_error');
			expect(pattern?.enabled).toBe(false);

			// Reset for other tests
			PatternLibrary.updatePatternEnabled('unhandled_error', true);
		});

		it('should return false for non-existent pattern', () => {
			const result = PatternLibrary.updatePatternEnabled('non_existent', false);
			expect(result).toBe(false);
		});
	});

	describe('getDefaultConfig', () => {
		it('should return valid default configuration', () => {
			const config = PatternLibrary.getDefaultConfig();

			expect(config).toHaveProperty('categories');
			expect(config).toHaveProperty('throttling');
			expect(config).toHaveProperty('sensitivity');

			// Check categories
			expect(config.categories).toHaveProperty('repetitive_behavior');
			expect(config.categories).toHaveProperty('error_detection');
			expect(config.categories).toHaveProperty('overthinking');
			expect(config.categories).toHaveProperty('code_quality');
			expect(config.categories).toHaveProperty('git_workflow');
			expect(config.categories).toHaveProperty('security');
			expect(config.categories).toHaveProperty('performance');

			// Check throttling
			expect(config.throttling).toHaveProperty('maxGuidancesPerHour');
			expect(config.throttling).toHaveProperty('minSpacingMs');
			expect(config.throttling).toHaveProperty('patternRepeatLimit');
			expect(config.throttling).toHaveProperty('criticalBypassThrottling');

			// Check sensitivity
			expect(config.sensitivity).toHaveProperty('critical');
			expect(config.sensitivity).toHaveProperty('high');
			expect(config.sensitivity).toHaveProperty('medium');
			expect(config.sensitivity).toHaveProperty('low');

			// Validate ranges
			expect(config.sensitivity.critical).toBeGreaterThanOrEqual(0);
			expect(config.sensitivity.critical).toBeLessThanOrEqual(1);
		});
	});

	describe('Pattern Validation', () => {
		it('should have valid regex patterns that can be tested', () => {
			const patterns = PatternLibrary.getAllPatterns();

			patterns.forEach(pattern => {
				expect(() => {
					// Test that the regex can be executed
					pattern.pattern.test('test string');
				}).not.toThrow();

				// Reset regex state for global patterns
				pattern.pattern.lastIndex = 0;
			});
		});

		it('should have meaningful guidance messages', () => {
			const patterns = PatternLibrary.getAllPatterns();

			patterns.forEach(pattern => {
				expect(pattern.guidance).toBeTruthy();
				expect(pattern.guidance.length).toBeGreaterThan(10);
				expect(pattern.guidance).not.toMatch(/^\s*$/); // Not just whitespace
			});
		});

		it('should have unique pattern IDs', () => {
			const patterns = PatternLibrary.getAllPatterns();
			const ids = patterns.map(p => p.id);
			const uniqueIds = new Set(ids);

			expect(uniqueIds.size).toBe(ids.length);
		});
	});

	describe('Pattern Categories Coverage', () => {
		it('should have patterns for all major categories', () => {
			const patterns = PatternLibrary.getAllPatterns();
			const categories = new Set(patterns.map(p => p.category));

			expect(categories.has('error_detection')).toBe(true);
			expect(categories.has('repetitive_behavior')).toBe(true);
			expect(categories.has('overthinking')).toBe(true);
			expect(categories.has('code_quality')).toBe(true);
			expect(categories.has('git_workflow')).toBe(true);
			expect(categories.has('security')).toBe(true);
		});

		it('should have critical patterns for security and errors', () => {
			const patterns = PatternLibrary.getAllPatterns();
			const criticalPatterns = patterns.filter(p => p.priority === 'critical');

			const criticalCategories = new Set(criticalPatterns.map(p => p.category));
			expect(criticalCategories.has('error_detection')).toBe(true);
			expect(criticalCategories.has('security')).toBe(true);
		});
	});
});
