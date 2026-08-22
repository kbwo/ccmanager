#!/usr/bin/env node
/**
 * Validates a CCManager config file (`.ccmanager.json` or the global
 * `config.json`) and prints errors and warnings.
 *
 * Why this exists: CCManager never reports a bad config. A file that fails to
 * parse is dropped whole (src/services/config/projectConfigManager.ts,
 * loadProjectConfig catches and sets null), and keys it does not know are
 * silently ignored — so a typo looks exactly like "the setting has no effect".
 *
 * Usage:
 *   node validate-ccmanager-config.mjs [path-to-config]
 *
 * Defaults to ./.ccmanager.json. Exits 1 if any error was found, 0 otherwise
 * (warnings alone do not fail).
 */

import {readFileSync, existsSync, statSync} from 'node:fs';
import {dirname, join, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCHEMA_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'schema',
	'ccmanager.schema.json',
);

const errors = [];
const warnings = [];

const error = (path, message) => errors.push({path, message});
const warn = (path, message) => warnings.push({path, message});

/* ------------------------------------------------------------------ *
 * Minimal JSON Schema subset validator
 * Supports: $ref (local), type, enum, properties, required,
 * additionalProperties: false, items, minItems, exclusiveMinimum.
 * ------------------------------------------------------------------ */

function deref(schema, root) {
	if (!schema || !schema.$ref) return schema;
	const segments = schema.$ref.replace(/^#\//, '').split('/');
	return segments.reduce((node, segment) => node?.[segment], root);
}

function typeOf(value) {
	if (Array.isArray(value)) return 'array';
	if (value === null) return 'null';
	return typeof value;
}

function distance(a, b) {
	const rows = Array.from({length: a.length + 1}, (_, i) => [
		i,
		...new Array(b.length).fill(0),
	]);
	for (let j = 0; j <= b.length; j++) rows[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			rows[i][j] = Math.min(
				rows[i - 1][j] + 1,
				rows[i][j - 1] + 1,
				rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
	}
	return rows[a.length][b.length];
}

function suggest(key, candidates) {
	const ranked = candidates
		.map(candidate => ({
			candidate,
			score: distance(key.toLowerCase(), candidate.toLowerCase()),
		}))
		.sort((a, b) => a.score - b.score);
	const best = ranked[0];
	if (best && best.score <= Math.max(2, Math.ceil(key.length / 3))) {
		return ` Did you mean "${best.candidate}"?`;
	}
	return '';
}

function validate(value, schema, path, root) {
	const resolved = deref(schema, root);
	if (!resolved) return;

	if (resolved.type && typeOf(value) !== resolved.type) {
		error(path, `expected ${resolved.type}, got ${typeOf(value)}`);
		return;
	}

	if (resolved.enum && !resolved.enum.includes(value)) {
		error(
			path,
			`"${value}" is not a supported value. Allowed: ${resolved.enum
				.map(v => `"${v}"`)
				.join(', ')}`,
		);
		return;
	}

	if (resolved.type === 'number' && resolved.exclusiveMinimum !== undefined) {
		if (!(value > resolved.exclusiveMinimum)) {
			error(path, `must be greater than ${resolved.exclusiveMinimum}`);
		}
	}

	if (resolved.type === 'array') {
		if (resolved.minItems !== undefined && value.length < resolved.minItems) {
			error(path, `needs at least ${resolved.minItems} item(s)`);
		}
		if (resolved.items) {
			value.forEach((item, index) =>
				validate(item, resolved.items, `${path}[${index}]`, root),
			);
		}
		return;
	}

	if (resolved.type === 'object' || resolved.properties) {
		const allowed = Object.keys(resolved.properties ?? {});

		for (const key of resolved.required ?? []) {
			if (!(key in value)) {
				error(path, `missing required key "${key}"`);
			}
		}

		for (const [key, child] of Object.entries(value)) {
			const childPath = path ? `${path}.${key}` : key;
			if (!allowed.includes(key)) {
				if (resolved.additionalProperties === false) {
					error(
						childPath,
						`unknown key — CCManager ignores it silently.${suggest(
							key,
							allowed,
						)}`,
					);
				}
				continue;
			}
			validate(child, resolved.properties[key], childPath, root);
		}
	}
}

/* ------------------------------------------------------------------ *
 * Checks the schema cannot express
 * ------------------------------------------------------------------ */

// Which detection strategy each known assistant command needs, so that
// CCManager reads idle/busy/waiting out of that CLI's output correctly.
const STRATEGY_BY_COMMAND = {
	claude: 'claude',
	gemini: 'gemini',
	codex: 'codex',
	'cursor-agent': 'cursor',
	copilot: 'github-copilot',
	cline: 'cline',
	opencode: 'opencode',
	kimi: 'kimi',
};

function lintCommandPresets(config) {
	const presetsConfig = config.commandPresets;
	if (!presetsConfig || typeof presetsConfig !== 'object') return;
	const presets = Array.isArray(presetsConfig.presets)
		? presetsConfig.presets
		: [];

	const seen = new Map();
	presets.forEach((preset, index) => {
		if (!preset || typeof preset !== 'object') return;
		const path = `commandPresets.presets[${index}]`;

		if (typeof preset.id === 'string') {
			if (seen.has(preset.id)) {
				error(
					`${path}.id`,
					`duplicate id "${preset.id}" (also used by preset ${seen.get(
						preset.id,
					)})`,
				);
			}
			seen.set(preset.id, index);
		}

		for (const key of ['args', 'fallbackArgs']) {
			const list = preset[key];
			if (!Array.isArray(list)) continue;
			list.forEach((argument, argIndex) => {
				if (typeof argument === 'string' && /\s/.test(argument.trim())) {
					warn(
						`${path}.${key}[${argIndex}]`,
						`"${argument}" is passed as one argv entry, spaces included. Split it: ${JSON.stringify(
							argument.trim().split(/\s+/),
						)}`,
					);
				}
			});
		}

		const expected = STRATEGY_BY_COMMAND[basename(preset.command ?? '')];
		const actual = preset.detectionStrategy ?? 'claude';
		if (expected && expected !== actual) {
			warn(
				`${path}.detectionStrategy`,
				`command "${preset.command}" reports its state differently from "${actual}". Set "detectionStrategy": "${expected}" or session status will be wrong.`,
			);
		}
	});

	if (typeof presetsConfig.defaultPresetId === 'string' && presets.length > 0) {
		if (!seen.has(presetsConfig.defaultPresetId)) {
			error(
				'commandPresets.defaultPresetId',
				`"${presetsConfig.defaultPresetId}" matches no preset in this file. CCManager falls back to the first preset.`,
			);
		}
	}
}

function lintShortcuts(config) {
	const shortcuts = config.shortcuts;
	if (!shortcuts || typeof shortcuts !== 'object') return;

	for (const [name, shortcut] of Object.entries(shortcuts)) {
		if (!shortcut || typeof shortcut !== 'object') continue;
		const path = `shortcuts.${name}`;

		if (shortcut.alt === true || shortcut.shift === true) {
			error(
				path,
				'alt and shift are never matched at runtime — such a shortcut can never fire. Use ctrl, or "escape".',
			);
		}

		if (typeof shortcut.key === 'string' && shortcut.key !== 'escape') {
			if (shortcut.key.length !== 1) {
				error(
					path,
					`key "${shortcut.key}" is neither a single character nor "escape".`,
				);
			}
			if (shortcut.ctrl !== true) {
				error(
					path,
					'non-escape shortcuts need "ctrl": true. Without it the binding either never fires or swallows a plain keystroke.',
				);
			}
			if (['c', 'd', '['].includes(shortcut.key.toLowerCase())) {
				warn(
					path,
					`Ctrl+${shortcut.key.toUpperCase()} is used by the terminal itself; pick another key.`,
				);
			}
		}
	}
}

function lintHooks(config) {
	for (const group of ['statusHooks', 'worktreeHooks']) {
		const hooks = config[group];
		if (!hooks || typeof hooks !== 'object') continue;
		for (const [name, hook] of Object.entries(hooks)) {
			if (!hook || typeof hook !== 'object') continue;
			if (hook.enabled === false) {
				warn(
					`${group}.${name}`,
					'"enabled": false — the command is stored but never runs.',
				);
			}
		}
	}
}

function lintWorktree(config) {
	const worktree = config.worktree;
	if (!worktree || typeof worktree !== 'object') return;

	const pattern = worktree.autoDirectoryPattern;
	if (typeof pattern === 'string' && !/\{branch\}/.test(pattern)) {
		error(
			'worktree.autoDirectoryPattern',
			'contains no {branch} placeholder, so every worktree resolves to the same directory and creation fails after the first.',
		);
	}
	if (typeof pattern === 'string' && worktree.autoDirectory !== true) {
		warn(
			'worktree.autoDirectoryPattern',
			'is only used when "autoDirectory": true is also set (here or in the global config).',
		);
	}
}

function lintAutoApproval(config) {
	const autoApproval = config.autoApproval;
	if (!autoApproval || typeof autoApproval !== 'object') return;

	if (autoApproval.enabled === true && !autoApproval.customCommand) {
		warn(
			'autoApproval',
			'the built-in check shells out to the `claude` CLI; it must be on PATH, or set "customCommand".',
		);
	}
	if (typeof autoApproval.timeout === 'number' && autoApproval.timeout > 600) {
		warn(
			'autoApproval.timeout',
			`${autoApproval.timeout} seconds — the session stays blocked that long on a hung check.`,
		);
	}
}

function lintLocation(configPath) {
	if (basename(configPath) !== '.ccmanager.json') return;

	const gitPath = join(dirname(configPath), '.git');
	if (!existsSync(gitPath)) {
		warn(
			configPath,
			'no .git here — CCManager only reads `.ccmanager.json` from the git repository root.',
		);
		return;
	}
	if (statSync(gitPath).isDirectory()) return;

	// A `.git` file means a linked worktree or a submodule. CCManager resolves
	// a linked worktree back to the main repository root
	// (src/utils/gitUtils.ts, getGitRepositoryRoot), so a config placed inside
	// the worktree is never read; a submodule keeps its own root.
	const gitdir = readFileSync(gitPath, 'utf-8');
	if (gitdir.includes('.git/worktrees/')) {
		error(
			configPath,
			'this is a linked worktree. CCManager reads the main repository\'s `.ccmanager.json` instead, so this file has no effect — move it to the main checkout.',
		);
	}
}

/* ------------------------------------------------------------------ */

const configPath = resolve(process.argv[2] ?? '.ccmanager.json');

if (!existsSync(configPath)) {
	console.error(`No config file at ${configPath}`);
	process.exit(1);
}

const raw = readFileSync(configPath, 'utf-8');
let config;
try {
	config = JSON.parse(raw);
} catch (parseError) {
	console.error(`${configPath}`);
	console.error(`  ERROR  invalid JSON: ${parseError.message}`);
	console.error(
		'  CCManager drops the whole file when it cannot parse it — every setting in it is currently inactive.',
	);
	process.exit(1);
}

if (typeOf(config) !== 'object') {
	console.error(`${configPath}`);
	console.error(`  ERROR  top level must be a JSON object`);
	process.exit(1);
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
validate(config, schema, '', schema);
lintCommandPresets(config);
lintShortcuts(config);
lintHooks(config);
lintWorktree(config);
lintAutoApproval(config);
lintLocation(configPath);

console.log(configPath);
for (const {path, message} of errors) {
	console.log(`  ERROR  ${path || '<root>'}: ${message}`);
}
for (const {path, message} of warnings) {
	console.log(`  WARN   ${path || '<root>'}: ${message}`);
}
if (errors.length === 0 && warnings.length === 0) {
	console.log('  OK     no problems found');
}

process.exit(errors.length > 0 ? 1 : 0);
