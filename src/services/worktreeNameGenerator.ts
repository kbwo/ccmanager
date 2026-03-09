import {randomBytes} from 'crypto';
import {Effect} from 'effect';
import {execFile, type ChildProcess} from 'child_process';
import {ProcessError} from '../types/errors.js';
import {logger} from '../utils/logger.js';

const JSON_SCHEMA = JSON.stringify({
	type: 'object',
	properties: {
		branchName: {type: 'string'},
	},
	required: ['branchName'],
	additionalProperties: false,
});

const DEFAULT_TIMEOUT_MS = 30_000;

const buildPrompt = (
	userPrompt: string,
	baseBranch: string,
): string => `You generate concise git branch names.

Base branch: ${baseBranch}
Task prompt:
${userPrompt}

Return a short git branch name using lowercase letters, numbers, hyphens, and forward slashes only.
Do not include markdown, explanations, refs/heads/, or surrounding quotes.
Examples: feature/add-prompt-mode, fix/worktree-loading-state`;

const normalizeBranchName = (branchName: string): string => {
	const normalized = branchName
		.trim()
		.replace(/^```[a-z]*\n?/i, '')
		.replace(/\n?```$/i, '')
		.replace(/^refs\/heads\//, '')
		.replace(/^"+|"+$/g, '')
		.replace(/^'+|'+$/g, '')
		.replace(/\s+/g, '-')
		.replace(/[^a-zA-Z0-9/_-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/\/+/g, '/')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();

	if (!normalized) {
		throw new Error('Generated branch name was empty');
	}

	return normalized;
};

const extractStringCandidate = (value: unknown): string | null => {
	if (typeof value === 'string') {
		return value;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const nested = extractStringCandidate(item);
			if (nested) return nested;
		}
	}

	if (typeof value === 'object' && value !== null) {
		const obj = value as Record<string, unknown>;
		for (const key of [
			'branchName',
			'result',
			'text',
			'content',
			'message',
			'completion',
		]) {
			const nested = extractStringCandidate(obj[key]);
			if (nested) return nested;
		}
	}

	return null;
};

export const extractBranchNameFromOutput = (stdout: string): string => {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error('`claude -p` returned empty output');
	}

	for (const pattern of [
		/"branchName"\s*:\s*"([^"]+)"/,
		/branchName\s*[:=]\s*["']?([A-Za-z0-9/_-]+)["']?/,
	]) {
		const match = trimmed.match(pattern);
		if (match?.[1]) {
			return normalizeBranchName(match[1]);
		}
	}

	const jsonLines = trimmed
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);

	for (const line of [trimmed, ...jsonLines]) {
		try {
			const parsed = JSON.parse(line) as unknown;
			const candidate = extractStringCandidate(parsed);
			if (candidate) {
				return normalizeBranchName(candidate);
			}
		} catch {
			// Fall through to other parsing strategies.
		}
	}

	const firstUsefulLine = trimmed
		.split('\n')
		.map(line => line.trim())
		.find(
			line =>
				line &&
				!line.startsWith('{') &&
				!line.startsWith('[') &&
				!line.startsWith('```'),
		);
	if (firstUsefulLine) {
		return normalizeBranchName(firstUsefulLine);
	}

	return normalizeBranchName(trimmed);
};

export const deduplicateBranchName = (
	name: string,
	existingBranches: string[],
): string => {
	const lowerSet = new Set(existingBranches.map(b => b.toLowerCase()));
	if (!lowerSet.has(name.toLowerCase())) {
		return name;
	}

	for (let i = 2; ; i++) {
		const candidate = `${name}-${i}`;
		if (!lowerSet.has(candidate.toLowerCase())) {
			return candidate;
		}
	}
};

export const generateFallbackBranchName = (
	existingBranches?: string[],
): string => {
	const date = new Date();
	const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
	const randomSuffix = randomBytes(3).toString('hex');
	const name = `${dateStr}-${randomSuffix}`;
	return existingBranches
		? deduplicateBranchName(name, existingBranches)
		: name;
};

export class WorktreeNameGenerator {
	generateBranchNameEffect(
		userPrompt: string,
		baseBranch: string,
		existingBranches?: string[],
	): Effect.Effect<string, ProcessError, never> {
		return Effect.tryPromise({
			try: () =>
				new Promise<string>((resolve, reject) => {
					let settled = false;
					let child: ChildProcess | undefined;

					const settle = (handler: () => void) => {
						if (settled) return;
						settled = true;
						clearTimeout(timeoutId);
						handler();
					};

					const timeoutId = setTimeout(() => {
						settle(() => {
							logger.warn(
								'Worktree branch-name generation timed out, terminating claude helper',
							);
							child?.kill('SIGKILL');
							reject(
								new Error(
									'Timed out while generating a branch name with `claude -p`',
								),
							);
						});
					}, DEFAULT_TIMEOUT_MS);

					child = execFile(
						'claude',
						['-p', '--output-format', 'json', '--json-schema', JSON_SCHEMA],
						{
							encoding: 'utf8',
							maxBuffer: 1024 * 1024,
						},
						(error, stdout) => {
							settle(() => {
								if (error) {
									reject(error);
									return;
								}

								const branchName = extractBranchNameFromOutput(stdout);
								resolve(
									existingBranches
										? deduplicateBranchName(branchName, existingBranches)
										: branchName,
								);
							});
						},
					);

					child.on('error', error => {
						settle(() => reject(error));
					});

					if (!child.stdin) {
						settle(() => reject(new Error('claude stdin unavailable')));
						return;
					}

					child.stdin.write(buildPrompt(userPrompt, baseBranch));
					child.stdin.end();
				}),
			catch: (error: unknown) =>
				new ProcessError({
					command: 'claude -p',
					message:
						(typeof error === 'object' &&
							error !== null &&
							'code' in error &&
							error.code === 'ENOENT') ||
						(error instanceof Error && error.message.includes('spawn claude'))
							? 'The `claude` command is required for automatic branch naming. Install it and make sure it is available in PATH.'
							: error instanceof Error
								? `Failed to generate a branch name with \`claude -p\`: ${error.message}`
								: 'Failed to generate branch name with `claude -p`',
				}),
		});
	}
}

export const worktreeNameGenerator = new WorktreeNameGenerator();
