#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const NPM_DIR = join(ROOT_DIR, "npm");

const PLATFORMS = [
	"darwin-arm64",
	"darwin-x64",
	"linux-arm64",
	"linux-x64",
	"win32-x64",
];

async function publishPlatformPackage(platform: string, dryRun: boolean) {
	const packageDir = join(NPM_DIR, platform);
	const packageJsonPath = join(packageDir, "package.json");

	if (!existsSync(packageJsonPath)) {
		console.error(`  -> Package.json not found: ${packageJsonPath}`);
		return false;
	}

	const binaryPath = join(
		packageDir,
		"bin",
		platform.startsWith("win32") ? "ccmanager.exe" : "ccmanager"
	);

	if (!existsSync(binaryPath)) {
		console.error(`  -> Binary not found: ${binaryPath}`);
		console.error(`     Run 'bun run build:binary --target=${platform}' first`);
		return false;
	}

	console.log(`Publishing @kodaikabasawa/ccmanager-bun-test-${platform}...`);

	try {
		if (dryRun) {
			await $`cd ${packageDir} && npm publish --access public --dry-run`;
		} else {
			await $`cd ${packageDir} && npm publish --access public`;
		}
		console.log(`  -> Published successfully`);
		return true;
	} catch (error) {
		console.error(`  -> Failed to publish:`, error);
		return false;
	}
}

async function publishMainPackage(dryRun: boolean) {
	console.log(`\nPublishing main package @kodaikabasawa/ccmanager-bun-test...`);

	try {
		if (dryRun) {
			await $`cd ${ROOT_DIR} && npm publish --access public --dry-run`;
		} else {
			await $`cd ${ROOT_DIR} && npm publish --access public`;
		}
		console.log(`  -> Published successfully`);
		return true;
	} catch (error) {
		console.error(`  -> Failed to publish:`, error);
		return false;
	}
}

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const platformOnly = args.includes("--platform-only");
	const mainOnly = args.includes("--main-only");

	if (dryRun) {
		console.log("DRY RUN MODE - No packages will actually be published\n");
	}

	const mainPackage = JSON.parse(
		readFileSync(join(ROOT_DIR, "package.json"), "utf-8")
	);
	console.log(`Version: ${mainPackage.version}\n`);

	let successCount = 0;
	let failCount = 0;

	// Publish platform packages first
	if (!mainOnly) {
		console.log("Publishing platform packages...\n");
		for (const platform of PLATFORMS) {
			const success = await publishPlatformPackage(platform, dryRun);
			if (success) {
				successCount++;
			} else {
				failCount++;
			}
		}
	}

	// Publish main package
	if (!platformOnly) {
		const success = await publishMainPackage(dryRun);
		if (success) {
			successCount++;
		} else {
			failCount++;
		}
	}

	console.log(`\nPublish complete: ${successCount} succeeded, ${failCount} failed`);

	if (failCount > 0) {
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Publish failed:", error);
	process.exit(1);
});
