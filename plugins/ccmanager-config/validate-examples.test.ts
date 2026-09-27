import {describe, it, expect} from 'vitest';
import {execFileSync} from 'child_process';
import {readFileSync, writeFileSync, mkdtempSync, readdirSync} from 'fs';
import {tmpdir} from 'os';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

/**
 * Guards the ccmanager-config skill: every configuration example it ships must
 * still pass the validator it ships, so the two cannot drift apart as the
 * config schema changes.
 */

const pluginRoot = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(pluginRoot, 'skills', 'ccmanager-config');
const validator = join(skillRoot, 'scripts', 'validate-ccmanager-config.mjs');

// Documents carrying config examples. SKILL.md deliberately carries none — it
// routes to these instead.
const docs = [
	join(skillRoot, 'references', 'config-reference.md'),
	join(skillRoot, 'references', 'recipes.md'),
	join(pluginRoot, 'README.md'),
];

function runValidator(config: string): {status: number; output: string} {
	const dir = mkdtempSync(join(tmpdir(), 'ccmanager-config-'));
	const file = join(dir, 'config.json');
	writeFileSync(file, config);
	try {
		const output = execFileSync('node', [validator, file], {encoding: 'utf-8'});
		return {status: 0, output};
	} catch (error) {
		const failure = error as {status: number; stdout: string; stderr: string};
		return {
			status: failure.status,
			output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
		};
	}
}

function jsonBlocks(doc: string): string[] {
	const text = readFileSync(doc, 'utf-8');
	return [...text.matchAll(/```json\n([\s\S]*?)```/g)].map(match => match[1]!);
}

describe('ccmanager-config skill', () => {
	it('ships a skill entrypoint with the frontmatter both CLIs require', () => {
		const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf-8');
		expect(skill.startsWith('---\n')).toBe(true);
		expect(skill).toMatch(/^name: ccmanager-config$/m);
		expect(skill).toMatch(/^description: /m);
	});

	it('is listed in the marketplace manifest', () => {
		const marketplace = JSON.parse(
			readFileSync(
				join(pluginRoot, '..', '..', '.claude-plugin', 'marketplace.json'),
				'utf-8',
			),
		) as {plugins: Array<{name: string; source: string}>};
		expect(
			marketplace.plugins.some(
				plugin =>
					plugin.name === 'ccmanager-config' &&
					plugin.source === './plugins/ccmanager-config',
			),
		).toBe(true);
	});

	for (const doc of docs) {
		const blocks = jsonBlocks(doc);
		it(`has at least one example in ${doc.slice(pluginRoot.length + 1)}`, () => {
			expect(blocks.length).toBeGreaterThan(0);
		});

		blocks.forEach((block, index) => {
			it(`validates example ${index} in ${doc.slice(pluginRoot.length + 1)}`, () => {
				const {status, output} = runValidator(block);
				expect(output).not.toMatch(/ERROR/);
				expect(status).toBe(0);
			});
		});
	}

	it('reports the silent failures CCManager itself hides', () => {
		const {status, output} = runValidator(
			JSON.stringify({
				worktree: {autoDirectory: true, copySesionData: true},
				statusHooks: {idle: {command: 'true'}},
				commandPresets: {
					presets: [{id: 'a', name: 'A', command: 'codex'}],
					defaultPresetId: 'missing',
				},
			}),
		);

		expect(status).toBe(1);
		// unknown key, with a suggestion
		expect(output).toMatch(/copySesionData.*copySessionData/);
		// hook that would never run
		expect(output).toMatch(/statusHooks\.idle.*enabled/);
		// preset id that resolves to nothing
		expect(output).toMatch(/defaultPresetId/);
		// detection strategy that does not match the command
		expect(output).toMatch(/detectionStrategy.*codex/);
	});

	it('rejects a config file placed inside a linked worktree', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ccmanager-config-wt-'));
		writeFileSync(join(dir, '.git'), 'gitdir: /repo/.git/worktrees/feature\n');
		writeFileSync(join(dir, '.ccmanager.json'), '{}');

		let status = 0;
		let output = '';
		try {
			output = execFileSync('node', [validator, join(dir, '.ccmanager.json')], {
				encoding: 'utf-8',
			});
		} catch (error) {
			const failure = error as {status: number; stdout: string};
			status = failure.status;
			output = failure.stdout ?? '';
		}

		expect(status).toBe(1);
		expect(output).toMatch(/linked worktree/);
	});

	it('keeps the schema and the validator in the same directory tree', () => {
		expect(readdirSync(join(skillRoot, 'schema'))).toContain(
			'ccmanager.schema.json',
		);
	});
});
