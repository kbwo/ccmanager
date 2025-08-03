import {describe, it, expect, beforeEach} from 'vitest';
import {ContextPatterns} from './contextPatterns.js';
import type {ContextPattern} from '../types/index.js';

describe('ContextPatterns', () => {
	let contextPatterns: ContextPatterns;

	beforeEach(() => {
		contextPatterns = new ContextPatterns();
	});

	describe('framework pattern retrieval', () => {
		it('should return React patterns', () => {
			const patterns = contextPatterns.getPatterns('react');

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns.every(p => p.framework === 'react')).toBe(true);

			// Check for specific React patterns
			const hookPattern = patterns.find(p => p.id === 'react-hooks-warning');
			expect(hookPattern).toBeDefined();
			expect(hookPattern?.name).toBe('Class Component Lifecycle');
		});

		it('should return TypeScript patterns', () => {
			const patterns = contextPatterns.getPatterns('typescript');

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns.every(p => p.framework === 'typescript')).toBe(true);

			// Check for specific TypeScript patterns
			const anyPattern = patterns.find(p => p.id === 'typescript-any-usage');
			expect(anyPattern).toBeDefined();
			expect(anyPattern?.guidance).toContain('any');
		});

		it('should return Node.js patterns', () => {
			const patterns = contextPatterns.getPatterns('node');

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns.every(p => p.framework === 'node')).toBe(true);
		});

		it('should return Express patterns', () => {
			const patterns = contextPatterns.getPatterns('express');

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns.every(p => p.framework === 'express')).toBe(true);
		});

		it('should return Next.js patterns', () => {
			const patterns = contextPatterns.getPatterns('next');

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns.every(p => p.framework === 'next')).toBe(true);
		});

		it('should return Vue patterns', () => {
			const patterns = contextPatterns.getPatterns('vue');

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns.every(p => p.framework === 'vue')).toBe(true);
		});

		it('should return empty array for unknown framework', () => {
			const patterns = contextPatterns.getPatterns('unknown');
			expect(patterns).toEqual([]);
		});
	});

	describe('pattern testing', () => {
		it('should detect React hook violations', () => {
			const code = `
				class MyComponent extends React.Component {
					componentDidMount() {
						console.log('mounted');
					}
					
					componentWillMount() {
						console.log('will mount');
					}
				}
			`;

			const results = contextPatterns.testPatterns(code, 'react');

			expect(results.length).toBeGreaterThan(0);
			const hookResult = results.find(
				r => r.pattern.id === 'react-hooks-warning',
			);
			expect(hookResult).toBeDefined();
			expect(hookResult?.matches.length).toBe(2); // componentDidMount and componentWillMount
		});

		it('should detect React state mutation', () => {
			const code = `
				this.state.count = 5;
				this.state.name = 'test';
			`;

			const results = contextPatterns.testPatterns(code, 'react');

			const mutationResult = results.find(
				r => r.pattern.id === 'react-state-mutation',
			);
			expect(mutationResult).toBeDefined();
			expect(mutationResult?.matches.length).toBe(2);
		});

		it('should detect missing React keys', () => {
			const code = `
				items.map(item => <div>{item.name}</div>)
				users.map(user => <UserComponent name={user.name} />)
			`;

			const results = contextPatterns.testPatterns(code, 'react');

			const keyResult = results.find(r => r.pattern.id === 'react-key-prop');
			expect(keyResult).toBeDefined();
			expect(keyResult?.matches.length).toBe(2);
		});

		it('should detect TypeScript any usage', () => {
			const code = `
				const data: any = fetchData();
				function process(input: any): void {}
				// This is okay: any // @ts-ignore
			`;

			const results = contextPatterns.testPatterns(code, 'typescript');

			const anyResult = results.find(
				r => r.pattern.id === 'typescript-any-usage',
			);
			expect(anyResult).toBeDefined();
			expect(anyResult?.matches.length).toBe(2); // Should ignore the @ts-ignore comment
		});

		it('should detect Node.js synchronous file operations', () => {
			const code = `
				const content = fs.readFileSync('file.txt');
				fs.writeFileSync('output.txt', data);
			`;

			const results = contextPatterns.testPatterns(code, 'node');

			const syncResult = results.find(
				r => r.pattern.id === 'node-sync-operations',
			);
			expect(syncResult).toBeDefined();
			expect(syncResult?.matches.length).toBe(2);
		});

		it('should detect Express missing error handling', () => {
			const code = `
				app.get('/users', (req, res) => {
					const users = database.getUsers();
					res.json(users);
				});
			`;

			const results = contextPatterns.testPatterns(code, 'express');

			const errorResult = results.find(
				r => r.pattern.id === 'express-no-error-handling',
			);
			expect(errorResult).toBeDefined();
		});

		it('should detect Next.js image optimization opportunities', () => {
			const code = `
				<img src="/hero.jpg" alt="Hero" />
				<img src={userAvatar} alt="Avatar" />
			`;

			const results = contextPatterns.testPatterns(code, 'next');

			const imageResult = results.find(
				r => r.pattern.id === 'next-image-optimization',
			);
			expect(imageResult).toBeDefined();
			expect(imageResult?.matches.length).toBe(2);
		});

		it('should detect Vue missing v-key directive', () => {
			const code = `
				<div v-for="item in items">{{ item.name }}</div>
				<li v-for="user in users" :key="user.id">{{ user.name }}</li>
			`;

			const results = contextPatterns.testPatterns(code, 'vue');

			const keyResult = results.find(r => r.pattern.id === 'vue-key-directive');
			expect(keyResult).toBeDefined();
			expect(keyResult?.matches.length).toBeGreaterThan(0); // Should find at least one missing :key
		});

		it('should return results sorted by confidence', () => {
			const code = `
				componentDidMount() {}
				this.state.value = 1;
			`;

			const results = contextPatterns.testPatterns(code, 'react');

			// Results should be sorted by confidence (descending)
			for (let i = 1; i < results.length; i++) {
				expect(results[i - 1]?.pattern.confidence).toBeGreaterThanOrEqual(
					results[i]?.pattern.confidence || 0,
				);
			}
		});

		it('should return empty array when no patterns match', () => {
			const code = `
				const validReactCode = () => {
					const [count, setCount] = useState(0);
					return <div key="unique">{count}</div>;
				};
			`;

			const results = contextPatterns.testPatterns(code, 'react');

			// This should not trigger any React pattern violations
			expect(results.length).toBe(0);
		});
	});

	describe('pattern filtering by category', () => {
		it('should filter React patterns by hooks category', () => {
			const hookPatterns = contextPatterns.getPatternsByCategory(
				'react',
				'hooks',
			);

			expect(hookPatterns.every(p => p.category === 'hooks')).toBe(true);
			expect(hookPatterns.some(p => p.id === 'react-hooks-warning')).toBe(true);
		});

		it('should filter React patterns by performance category', () => {
			const perfPatterns = contextPatterns.getPatternsByCategory(
				'react',
				'performance',
			);

			expect(perfPatterns.every(p => p.category === 'performance')).toBe(true);
		});

		it('should filter TypeScript patterns by testing category', () => {
			const testPatterns = contextPatterns.getPatternsByCategory(
				'typescript',
				'testing',
			);

			expect(testPatterns.every(p => p.category === 'testing')).toBe(true);
		});
	});

	describe('pattern management', () => {
		it('should add custom pattern', () => {
			const customPattern: ContextPattern = {
				id: 'custom-test',
				name: 'Custom Test Pattern',
				framework: 'react',
				category: 'testing',
				pattern: /test-pattern/gi,
				guidance: 'Custom guidance',
				confidence: 0.8,
			};

			contextPatterns.addPattern('react', customPattern);

			const patterns = contextPatterns.getPatterns('react');
			expect(patterns.some(p => p.id === 'custom-test')).toBe(true);
		});

		it('should remove pattern by ID', () => {
			const removed = contextPatterns.removePattern(
				'react',
				'react-hooks-warning',
			);

			expect(removed).toBe(true);

			const patterns = contextPatterns.getPatterns('react');
			expect(patterns.some(p => p.id === 'react-hooks-warning')).toBe(false);
		});

		it('should return false when removing non-existent pattern', () => {
			const removed = contextPatterns.removePattern('react', 'non-existent');
			expect(removed).toBe(false);
		});

		it('should update existing pattern', () => {
			const updated = contextPatterns.updatePattern(
				'react',
				'react-hooks-warning',
				{
					guidance: 'Updated guidance message',
					confidence: 0.95,
				},
			);

			expect(updated).toBe(true);

			const patterns = contextPatterns.getPatterns('react');
			const updatedPattern = patterns.find(p => p.id === 'react-hooks-warning');
			expect(updatedPattern?.guidance).toBe('Updated guidance message');
			expect(updatedPattern?.confidence).toBe(0.95);
		});

		it('should return false when updating non-existent pattern', () => {
			const updated = contextPatterns.updatePattern('react', 'non-existent', {
				confidence: 0.5,
			});
			expect(updated).toBe(false);
		});
	});

	describe('statistics', () => {
		it('should return pattern count statistics', () => {
			const stats = contextPatterns.getStats();

			expect(stats.react).toBeGreaterThan(0);
			expect(stats.typescript).toBeGreaterThan(0);
			expect(stats.node).toBeGreaterThan(0);
			expect(stats.express).toBeGreaterThan(0);
			expect(stats.next).toBeGreaterThan(0);
			expect(stats.vue).toBeGreaterThan(0);
			expect(stats.unknown).toBe(0);
		});
	});

	describe('getAllPatterns', () => {
		it('should return all patterns from all frameworks', () => {
			const allPatterns = contextPatterns.getAllPatterns();

			expect(allPatterns.length).toBeGreaterThan(0);

			// Should include patterns from different frameworks
			expect(allPatterns.some(p => p.framework === 'react')).toBe(true);
			expect(allPatterns.some(p => p.framework === 'typescript')).toBe(true);
			expect(allPatterns.some(p => p.framework === 'node')).toBe(true);
		});
	});
});
