import React from 'react';
import {render} from 'ink-testing-library';
import RemoteBranchSelector from './RemoteBranchSelector.js';
import {RemoteBranchMatch} from '../types/index.js';
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest';

// Mock ink to avoid stdin issues
vi.mock('ink', async () => {
	const actual = await vi.importActual<typeof import('ink')>('ink');
	return {
		...actual,
		useInput: vi.fn(),
	};
});

// Mock SelectInput to simulate user interactions
vi.mock('ink-select-input', async () => {
	const React = await vi.importActual<typeof import('react')>('react');
	const {Text, Box} = await vi.importActual<typeof import('ink')>('ink');

	return {
		default: ({
			items,
			onSelect,
		}: {
			items: Array<{label: string; value: string}>;
			onSelect: (item: {label: string; value: string}) => void;
		}) => {
			return React.createElement(
				Box,
				{flexDirection: 'column'},
				items.map((item, index) =>
					React.createElement(
						Text,
						{
							key: index,
							onClick: () => onSelect(item), // Simulate selection
						},
						`${index === 0 ? '❯ ' : '  '}${item.label}`,
					),
				),
			);
		},
	};
});

// Mock shortcutManager
vi.mock('../services/shortcutManager.js', () => ({
	shortcutManager: {
		getShortcutDisplay: vi.fn().mockReturnValue('ESC'),
		matchesShortcut: vi.fn().mockReturnValue(false),
	},
}));

describe('RemoteBranchSelector Component', () => {
	const mockBranchName = 'feature/awesome-feature';
	const mockMatches: RemoteBranchMatch[] = [
		{
			remote: 'origin',
			branch: 'feature/awesome-feature',
			fullRef: 'origin/feature/awesome-feature',
		},
		{
			remote: 'upstream',
			branch: 'feature/awesome-feature',
			fullRef: 'upstream/feature/awesome-feature',
		},
	];

	let onSelect: ReturnType<typeof vi.fn>;
	let onCancel: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onSelect = vi.fn();
		onCancel = vi.fn();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should render warning title and branch name', () => {
		const {lastFrame} = render(
			<RemoteBranchSelector
				branchName={mockBranchName}
				matches={mockMatches}
				onSelect={onSelect}
				onCancel={onCancel}
			/>,
		);

		const output = lastFrame();
		
		expect(output).toContain('⚠️  Ambiguous Branch Reference');
		expect(output).toContain(`Branch 'feature/awesome-feature' exists in multiple remotes`);
	});

	it('should render all remote branch options', () => {
		const {lastFrame} = render(
			<RemoteBranchSelector
				branchName={mockBranchName}
				matches={mockMatches}
				onSelect={onSelect}
				onCancel={onCancel}
			/>,
		);

		const output = lastFrame();
		
		expect(output).toContain('origin/feature/awesome-feature (from origin)');
		expect(output).toContain('upstream/feature/awesome-feature (from upstream)');
	});

	it('should render cancel option', () => {
		const {lastFrame} = render(
			<RemoteBranchSelector
				branchName={mockBranchName}
				matches={mockMatches}
				onSelect={onSelect}
				onCancel={onCancel}
			/>,
		);

		const output = lastFrame();
		expect(output).toContain('← Cancel');
	});

	it('should display help text with shortcut information', () => {
		const {lastFrame} = render(
			<RemoteBranchSelector
				branchName={mockBranchName}
				matches={mockMatches}
				onSelect={onSelect}
				onCancel={onCancel}
			/>,
		);

		const output = lastFrame();
		expect(output).toContain('Press ↑↓ to navigate, Enter to select, ESC to cancel');
	});

	it('should handle single remote branch match', () => {
		const singleMatch: RemoteBranchMatch[] = [
			{
				remote: 'origin',
				branch: 'feature/single-feature',
				fullRef: 'origin/feature/single-feature',
			},
		];

		const {lastFrame} = render(
			<RemoteBranchSelector
				branchName="feature/single-feature"
				matches={singleMatch}
				onSelect={onSelect}
				onCancel={onCancel}
			/>,
		);

		const output = lastFrame();
		expect(output).toContain('origin/feature/single-feature (from origin)');
		expect(output).not.toContain('upstream');
	});

	it('should handle complex branch names with multiple slashes', () => {
		const complexMatches: RemoteBranchMatch[] = [
			{
				remote: 'origin',
				branch: 'feature/sub/complex-branch-name',
				fullRef: 'origin/feature/sub/complex-branch-name',
			},
			{
				remote: 'fork',
				branch: 'feature/sub/complex-branch-name',
				fullRef: 'fork/feature/sub/complex-branch-name',
			},
		];

		const {lastFrame} = render(
			<RemoteBranchSelector
				branchName="feature/sub/complex-branch-name"
				matches={complexMatches}
				onSelect={onSelect}
				onCancel={onCancel}
			/>,
		);

		const output = lastFrame();
		expect(output).toContain('origin/feature/sub/complex-branch-name (from origin)');
		expect(output).toContain('fork/feature/sub/complex-branch-name (from fork)');
	});

	it('should handle many remote matches', () => {
		const manyMatches: RemoteBranchMatch[] = [
			{remote: 'origin', branch: 'test-branch', fullRef: 'origin/test-branch'},
			{remote: 'upstream', branch: 'test-branch', fullRef: 'upstream/test-branch'},
			{remote: 'fork1', branch: 'test-branch', fullRef: 'fork1/test-branch'},
			{remote: 'fork2', branch: 'test-branch', fullRef: 'fork2/test-branch'},
			{remote: 'company', branch: 'test-branch', fullRef: 'company/test-branch'},
		];

		const {lastFrame} = render(
			<RemoteBranchSelector
				branchName="test-branch"
				matches={manyMatches}
				onSelect={onSelect}
				onCancel={onCancel}
			/>,
		);

		const output = lastFrame();
		
		// Verify all remotes are shown
		expect(output).toContain('origin/test-branch (from origin)');
		expect(output).toContain('upstream/test-branch (from upstream)');
		expect(output).toContain('fork1/test-branch (from fork1)');
		expect(output).toContain('fork2/test-branch (from fork2)');
		expect(output).toContain('company/test-branch (from company)');
	});

	// Note: Testing actual selection behavior is complex with ink-testing-library
	// as it requires simulating user interactions. The component logic is tested
	// through integration tests in App.test.tsx where we can mock the callbacks
	// and verify they're called with the correct parameters.
});