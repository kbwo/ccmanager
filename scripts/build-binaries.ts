#!/usr/bin/env bun

import { mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const NPM_DIR = join(ROOT_DIR, "npm");
const ENTRY_POINT = join(ROOT_DIR, "src", "cli.tsx");

// Map of npm platform names to Bun target names
const TARGETS = [
	{
		npmPlatform: "darwin-arm64",
		bunTarget: "bun-darwin-arm64",
		binaryName: "ccmanager",
	},
	{
		npmPlatform: "darwin-x64",
		bunTarget: "bun-darwin-x64",
		binaryName: "ccmanager",
	},
	{
		npmPlatform: "linux-arm64",
		bunTarget: "bun-linux-arm64",
		binaryName: "ccmanager",
	},
	{
		npmPlatform: "linux-x64",
		bunTarget: "bun-linux-x64",
		binaryName: "ccmanager",
	},
	{
		npmPlatform: "win32-x64",
		bunTarget: "bun-windows-x64",
		binaryName: "ccmanager.exe",
	},
];

async function buildBinary(target: (typeof TARGETS)[number]) {
	const outputDir = join(NPM_DIR, target.npmPlatform, "bin");
	const outputPath = join(outputDir, target.binaryName);

	console.log(`Building for ${target.npmPlatform}...`);

	mkdirSync(outputDir, { recursive: true });

	try {
		await $`bun build ${ENTRY_POINT} --compile --target=${target.bunTarget} --outfile=${outputPath}`;
		console.log(`  -> Created ${outputPath}`);
		return true;
	} catch (error) {
		console.error(`  -> Failed to build for ${target.npmPlatform}:`, error);
		return false;
	}
}

async function updateVersions(version: string) {
	console.log(`\nUpdating versions to ${version}...`);

	// Update main package.json optionalDependencies
	const mainPackagePath = join(ROOT_DIR, "package.json");
	const mainPackage = JSON.parse(readFileSync(mainPackagePath, "utf-8"));
	mainPackage.version = version;

	for (const dep of Object.keys(mainPackage.optionalDependencies || {})) {
		mainPackage.optionalDependencies[dep] = version;
	}

	writeFileSync(mainPackagePath, JSON.stringify(mainPackage, null, "\t") + "\n");
	console.log(`  -> Updated ${mainPackagePath}`);

	// Update platform package.json files
	for (const target of TARGETS) {
		const platformPackagePath = join(NPM_DIR, target.npmPlatform, "package.json");
		if (existsSync(platformPackagePath)) {
			const platformPackage = JSON.parse(readFileSync(platformPackagePath, "utf-8"));
			platformPackage.version = version;
			writeFileSync(platformPackagePath, JSON.stringify(platformPackage, null, "\t") + "\n");
			console.log(`  -> Updated ${platformPackagePath}`);
		}
	}
}

async function main() {
	const args = process.argv.slice(2);
	const targetArg = args.find((arg) => arg.startsWith("--target="));
	const versionArg = args.find((arg) => arg.startsWith("--version="));

	// Update versions if specified
	if (versionArg) {
		const version = versionArg.split("=")[1];
		await updateVersions(version);
	}

	// Determine which targets to build
	let targetsToBuild = TARGETS;
	if (targetArg) {
		const requestedTarget = targetArg.split("=")[1];
		if (requestedTarget === "native") {
			// Build for current platform only
			const platform = process.platform;
			const arch = process.arch;
			const nativeKey = `${platform}-${arch}`;
			targetsToBuild = TARGETS.filter((t) => t.npmPlatform === nativeKey);
			if (targetsToBuild.length === 0) {
				console.error(`Unsupported native platform: ${nativeKey}`);
				process.exit(1);
			}
		} else if (requestedTarget !== "all") {
			targetsToBuild = TARGETS.filter((t) => t.npmPlatform === requestedTarget);
			if (targetsToBuild.length === 0) {
				console.error(`Unknown target: ${requestedTarget}`);
				console.error(`Available targets: ${TARGETS.map((t) => t.npmPlatform).join(", ")}`);
				process.exit(1);
			}
		}
	}

	console.log("Building binaries for ccmanager\n");
	console.log(`Entry point: ${ENTRY_POINT}`);
	console.log(`Output directory: ${NPM_DIR}`);
	console.log(`Targets: ${targetsToBuild.map((t) => t.npmPlatform).join(", ")}\n`);

	let successCount = 0;
	let failCount = 0;

	for (const target of targetsToBuild) {
		const success = await buildBinary(target);
		if (success) {
			successCount++;
		} else {
			failCount++;
		}
	}

	console.log(`\nBuild complete: ${successCount} succeeded, ${failCount} failed`);

	if (failCount > 0) {
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Build failed:", error);
	process.exit(1);
});
