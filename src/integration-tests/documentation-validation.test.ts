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

	describe('Effect-ts Documentation Links', () => {
		it('should provide link to official Effect-ts documentation', () => {
			expect(claudeMdContent).toContain('https://effect.website');
		});

		it('should provide link to Effect Type documentation', () => {
			expect(claudeMdContent).toContain('effect-type');
		});

		it('should provide link to Either Type documentation', () => {
			expect(claudeMdContent).toContain('either/either');
		});

		it('should provide link to Error Management documentation', () => {
			expect(claudeMdContent).toContain('error-management');
		});

		it('should provide link to Tagged Errors documentation', () => {
			expect(claudeMdContent).toContain('tagged-errors');
		});

		it('should provide link to Effect Execution documentation', () => {
			expect(claudeMdContent).toContain('running-effects');
		});
	});
});

describe('JSDoc Documentation on Effect-Returning Functions', () => {
	const filesToCheck = [
		{
			path: join(process.cwd(), 'src/services/worktreeService.ts'),
			functions: ['getWorktreesEffect', 'createWorktreeEffect', 'deleteWorktreeEffect', 'mergeWorktreeEffect'],
		},
		{
			path: join(process.cwd(), 'src/services/configurationManager.ts'),
			functions: ['loadConfigEffect', 'saveConfigEffect', 'setShortcutsEffect'],
		},
		{
			path: join(process.cwd(), 'src/services/sessionManager.ts'),
			functions: ['createSessionWithPresetEffect', 'terminateSessionEffect'],
		},
		{
			path: join(process.cwd(), 'src/services/projectManager.ts'),
			functions: ['discoverProjectsEffect', 'loadRecentProjectsEffect', 'saveRecentProjectsEffect'],
		},
		{
			path: join(process.cwd(), 'src/utils/gitStatus.ts'),
			functions: ['getGitStatus'],
		},
		{
			path: join(process.cwd(), 'src/utils/worktreeConfig.ts'),
			functions: ['getWorktreeParentBranch', 'setWorktreeParentBranch'],
		},
		{
			path: join(process.cwd(), 'src/utils/hookExecutor.ts'),
			functions: ['executeHook'],
		},
		{
			path: join(process.cwd(), 'src/utils/claudeDir.ts'),
			functions: ['getClaudeProjectsDir', 'claudeDirExists'],
		},
	];

	filesToCheck.forEach(({path: filePath, functions}) => {
		functions.forEach(functionName => {
			it(`should have JSDoc with @example for ${functionName} in ${filePath.split('/').pop()}`, () => {
				let fileContent: string;
				try {
					fileContent = readFileSync(filePath, 'utf-8');
				} catch (_error) {
					// File might not exist yet
					expect.fail(`File not found: ${filePath}`);
					return;
				}

				// Check if function exists
				const functionPattern = new RegExp(`${functionName}\\s*\\(`);
				if (!functionPattern.test(fileContent)) {
					expect.fail(`Function ${functionName} not found in ${filePath}`);
					return;
				}

				// Find the function and check for JSDoc before it
				const lines = fileContent.split('\n');
				let functionLineIndex = -1;

				for (let i = 0; i < lines.length; i++) {
					if (functionPattern.test(lines[i] || '')) {
						functionLineIndex = i;
						break;
					}
				}

				expect(functionLineIndex).toBeGreaterThan(-1);

				// Look backwards from function declaration for JSDoc comment
				let jsDocFound = false;
				let exampleFound = false;
				let returnsFound = false;
				let descriptionFound = false;

				for (let i = functionLineIndex - 1; i >= Math.max(0, functionLineIndex - 100); i--) {
					const line = lines[i] || '';

					// Detect JSDoc block - look for closing */ or any JSDoc tags
					if (line.trim().endsWith('*/') || line.includes('@example') || line.includes('@returns') || line.includes('@return')) {
						jsDocFound = true;
					}

					if (line.includes('@example')) {
						exampleFound = true;
					}

					if (line.includes('@returns') || line.includes('@return')) {
						returnsFound = true;
					}

					// Check for description (non-empty lines that aren't just * or tags)
					if (
						line.trim().length > 2 &&
						line.trim().startsWith('*') &&
						!line.includes('@') &&
						!line.trim().startsWith('/**') &&
						!line.trim().endsWith('*/') &&
						line.trim() !== '*'
					) {
						// Must have actual content after the *
						const content = line.trim().substring(1).trim();
						if (content.length > 0) {
							descriptionFound = true;
						}
					}

					// Stop if we hit the start of JSDoc
					if (line.trim().startsWith('/**')) {
						break;
					}
					if (i < functionLineIndex - 1 && /^\s*(public|private|protected)?\s*\w+.*\(/.test(line)) {
						break;
					}
				}

				expect(jsDocFound, `${functionName} should have JSDoc comment`).toBe(true);
				expect(descriptionFound, `${functionName} should have a description in JSDoc`).toBe(true);
				expect(returnsFound, `${functionName} should have @returns tag documenting Effect type`).toBe(true);
				expect(exampleFound, `${functionName} should have @example tag with usage example`).toBe(true);
			});
		});
	});
});
