import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
	entryPoints: ['src/cli.tsx'],
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'esm',
	outfile: 'dist/cli.js',
	// Mark all dependencies as external - they'll be installed via npm
	packages: 'external',
	banner: {
		js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`.trim(),
	},
	sourcemap: true,
	logLevel: 'info',
	jsx: 'automatic',
	resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
};

if (isWatch) {
	const ctx = await esbuild.context(buildOptions);
	await ctx.watch();
	console.log('Watching for changes...');
} else {
	await esbuild.build(buildOptions);
}
