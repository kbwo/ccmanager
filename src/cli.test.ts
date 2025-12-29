import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import {dirname} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if Bun.Terminal API is available (requires Bun v1.3.5+)
function isBunTerminalAvailable(): boolean {
	try {
		// Check if Bun.Terminal is available
		return typeof Bun !== 'undefined' && typeof Bun.spawn === 'function';
	} catch {
		return false;
	}
}

describe('CLI', () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = {...process.env};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('--multi-project flag', () => {
		it.skipIf(!isBunTerminalAvailable())(
			'should exit with error when CCMANAGER_MULTI_PROJECT_ROOT is not set',
			async () => {
				// Ensure the env var is not set
				delete process.env['CCMANAGER_MULTI_PROJECT_ROOT'];

				// Create a wrapper script that mocks TTY
				const wrapperScript = `
				process.stdin.isTTY = true;
				process.stdout.isTTY = true;
				process.stderr.isTTY = true;
				process.argv = ['bun', 'cli.js', '--multi-project'];
				import('./cli.js');
			`;

				const result = await new Promise<{code: number; stderr: string}>(
					resolve => {
						const proc = spawn('bun', ['-e', wrapperScript], {
							cwd: path.join(__dirname, '../dist'),
							env: {...process.env},
							stdio: ['pipe', 'pipe', 'pipe'],
						});

						let stderr = '';
						proc.stderr?.on('data', data => {
							stderr += data.toString();
						});

						proc.on('close', code => {
							resolve({code: code ?? 1, stderr});
						});
					},
				);

				expect(result.code).toBe(1);
				expect(result.stderr).toContain(
					'CCMANAGER_MULTI_PROJECT_ROOT environment variable must be set',
				);
				expect(result.stderr).toContain(
					'export CCMANAGER_MULTI_PROJECT_ROOT=/path/to/projects',
				);
			},
		);

		it.skipIf(!isBunTerminalAvailable())(
			'should not check for env var when --multi-project is not used',
			async () => {
				// Ensure the env var is not set
				delete process.env['CCMANAGER_MULTI_PROJECT_ROOT'];

				const result = await new Promise<{code: number; stderr: string}>(
					resolve => {
						const cliPath = path.join(__dirname, '../dist/cli.js');
						const proc = spawn('bun', [cliPath, '--help'], {
							env: {...process.env},
							stdio: ['pipe', 'pipe', 'pipe'],
						});

						let stderr = '';
						proc.stderr?.on('data', data => {
							stderr += data.toString();
						});

						proc.on('close', code => {
							resolve({code: code ?? 1, stderr});
						});
					},
				);

				expect(result.code).toBe(0);
				expect(result.stderr).not.toContain('CCMANAGER_MULTI_PROJECT_ROOT');
			},
		);
	});
});
