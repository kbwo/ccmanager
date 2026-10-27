import {configDefaults, defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		// dist/ holds compiled copies of the tests. Running them is redundant, and
		// they find the real git worker next to them, which bypasses their mocks.
		exclude: [...configDefaults.exclude, 'dist/**'],
		globals: true,
		watch: false,
		pool: 'threads',
		environment: 'node',
		coverage: {
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'dist/',
				'test/',
				'**/*.d.ts',
				'**/*.config.*',
				'**/mockups/**',
			],
		},
	},
});

