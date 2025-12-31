#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Read version from package.json
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;

const PACKAGE_SCOPE = "@kodaikabasawa";
const PACKAGE_NAME = "ccmanager";
const BINARY_NAME = "ccmanager";

const PLATFORM_PACKAGES = {
	"darwin-arm64": `${PACKAGE_SCOPE}/${PACKAGE_NAME}-darwin-arm64`,
	"darwin-x64": `${PACKAGE_SCOPE}/${PACKAGE_NAME}-darwin-x64`,
	"linux-arm64": `${PACKAGE_SCOPE}/${PACKAGE_NAME}-linux-arm64`,
	"linux-x64": `${PACKAGE_SCOPE}/${PACKAGE_NAME}-linux-x64`,
	"win32-x64": `${PACKAGE_SCOPE}/${PACKAGE_NAME}-win32-x64`,
};

function getPlatformKey() {
	const platform = process.platform;
	const arch = process.arch;
	return `${platform}-${arch}`;
}

function getBinaryName() {
	return process.platform === "win32" ? `${BINARY_NAME}.exe` : BINARY_NAME;
}

function getBinaryPath() {
	const platformKey = getPlatformKey();
	const platformPackage = PLATFORM_PACKAGES[platformKey];
	const binaryName = getBinaryName();

	if (!platformPackage) {
		console.error(`Unsupported platform: ${platformKey}`);
		console.error(
			`Supported platforms: ${Object.keys(PLATFORM_PACKAGES).join(", ")}`,
		);
		process.exit(1);
	}

	// Try to resolve from platform-specific package (installed via optionalDependencies)
	try {
		const packagePath = dirname(
			require.resolve(`${platformPackage}/package.json`),
		);
		const binaryPath = join(packagePath, "bin", binaryName);
		if (existsSync(binaryPath)) {
			return binaryPath;
		}
	} catch {
		// Platform package not installed, continue to fallback
	}

	// Fallback: check if binary was downloaded by postinstall script
	const fallbackPath = join(__dirname, binaryName);
	if (existsSync(fallbackPath)) {
		return fallbackPath;
	}

	console.error(`Could not find ${BINARY_NAME} binary for ${platformKey}`);
	console.error("Please try reinstalling the package:");
	console.error(`  npm install -g ${PACKAGE_NAME}`);
	process.exit(1);
}

try {
	const binaryPath = getBinaryPath();
	const args = process.argv.slice(2);

	// Pass version via environment variable
	const env = {
		...process.env,
		CCMANAGER_VERSION: version,
	};

	execFileSync(binaryPath, args, {
		stdio: "inherit",
		env: env,
	});
} catch (error) {
	if (error.status !== undefined) {
		process.exit(error.status);
	}
	console.error("Failed to execute ccmanager:", error.message);
	process.exit(1);
}
