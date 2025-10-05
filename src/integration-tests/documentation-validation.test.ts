import {describe, it, expect} from 'vitest';
import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * Documentation validation tests
 * Ensures that Effect-ts usage patterns and best practices are documented
 */
describe('Effect-ts Documentation Validation', () => {
	const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
	let claudeMdContent: string;

	try {
		claudeMdContent = readFileSync(claudeMdPath, 'utf-8');
	} catch (_error) {
		claudeMdContent = '';
	}

	describe('Required Sections', () => {
		it('should have an Error Handling section', () => {
			expect(claudeMdContent).toContain('## Error Handling');
		});

		it('should have Effect-ts patterns subsection', () => {
			expect(claudeMdContent).toMatch(/###.*Effect-ts/i);
		});

		it('should document when to use Effect vs Either', () => {
			expect(claudeMdContent).toMatch(/Effect.*Either|Either.*Effect/i);
		});
	});

	describe('Effect Core Functions', () => {
		it('should document Effect.succeed', () => {
			expect(claudeMdContent).toContain('Effect.succeed');
		});

		it('should document Effect.fail', () => {
			expect(claudeMdContent).toContain('Effect.fail');
		});

		it('should document Effect.try', () => {
			expect(claudeMdContent).toContain('Effect.try');
		});

		it('should document Effect.tryPromise', () => {
			expect(claudeMdContent).toContain('Effect.tryPromise');
		});

		it('should document Effect.map', () => {
			expect(claudeMdContent).toContain('Effect.map');
		});

		it('should document Effect.flatMap', () => {
			expect(claudeMdContent).toContain('Effect.flatMap');
		});

		it('should document Effect.runPromise', () => {
			expect(claudeMdContent).toContain('Effect.runPromise');
		});

		it('should document Either.right', () => {
			expect(claudeMdContent).toContain('Either.right');
		});

		it('should document Either.left', () => {
			expect(claudeMdContent).toContain('Either.left');
		});
	});

	describe('Code Examples', () => {
		it('should include service layer example', () => {
			expect(claudeMdContent).toMatch(/service|Service/);
			expect(claudeMdContent).toMatch(/```typescript|```ts/);
		});

		it('should include utility layer example', () => {
			expect(claudeMdContent).toMatch(/utility|Utility|utils/);
		});

		it('should include component layer example', () => {
			expect(claudeMdContent).toMatch(/component|Component/);
		});

		it('should show error handling in React components', () => {
			expect(claudeMdContent).toContain('React');
			expect(claudeMdContent).toMatch(/Effect\.runPromise|runPromise/);
		});
	});

	describe('Error Types Documentation', () => {
		it('should document GitError', () => {
			expect(claudeMdContent).toContain('GitError');
		});

		it('should document FileSystemError', () => {
			expect(claudeMdContent).toContain('FileSystemError');
		});

		it('should document ConfigError', () => {
			expect(claudeMdContent).toContain('ConfigError');
		});

		it('should document ProcessError', () => {
			expect(claudeMdContent).toContain('ProcessError');
		});

		it('should document ValidationError', () => {
			expect(claudeMdContent).toContain('ValidationError');
		});

		it('should document error discrimination with _tag', () => {
			expect(claudeMdContent).toContain('_tag');
		});
	});

	describe('Best Practices', () => {
		it('should document pattern matching for errors', () => {
			expect(claudeMdContent).toMatch(/match|switch.*_tag|pattern matching/i);
		});

		it('should explain error recovery strategies', () => {
			expect(claudeMdContent).toMatch(/catchAll|catchTag|recovery/i);
		});

		it('should provide guidance on Effect composition', () => {
			expect(claudeMdContent).toMatch(/composition|compose|chain/i);
		});
	});
});
