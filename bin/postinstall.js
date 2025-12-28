#!/usr/bin/env node

/**
 * Postinstall Fallback Script
 *
 * This script serves as a fallback mechanism for downloading the platform-specific
 * binary when optionalDependencies fail to install. This can happen in several scenarios:
 *
 * 1. User runs `npm install --ignore-optional` or `yarn install --ignore-optional`
 * 2. Package manager is configured to skip optional dependencies (e.g., pnpm strict mode)
 * 3. Network issues prevent the platform-specific package from being downloaded
 * 4. The platform package fails npm's os/cpu filter checks for some reason
 *
 * In these cases, this script directly downloads the binary from the npm registry
 * and places it in the bin/ directory, ensuring the CLI works regardless of how
 * the package was installed.
 *
 * If the platform-specific package was successfully installed via optionalDependencies,
 * this script detects that and exits early without doing anything.
 */

import { existsSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "node:https";
import { createGunzip } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_NAME = "@kodaikabasawa/ccmanager-bun-test";
const BINARY_NAME = "ccmanager";
const VERSION = process.env.npm_package_version || "3.1.5";

const PLATFORM_PACKAGES = {
	"darwin-arm64": `${PACKAGE_NAME}-darwin-arm64`,
	"darwin-x64": `${PACKAGE_NAME}-darwin-x64`,
	"linux-arm64": `${PACKAGE_NAME}-linux-arm64`,
	"linux-x64": `${PACKAGE_NAME}-linux-x64`,
	"win32-x64": `${PACKAGE_NAME}-win32-x64`,
};

function getPlatformKey() {
	const platform = process.platform;
	const arch = process.arch;
	return `${platform}-${arch}`;
}

function getBinaryName() {
	return process.platform === "win32" ? `${BINARY_NAME}.exe` : BINARY_NAME;
}

function isPlatformPackageInstalled() {
	const platformKey = getPlatformKey();
	const platformPackage = PLATFORM_PACKAGES[platformKey];

	if (!platformPackage) {
		return false;
	}

	try {
		const packagePath = dirname(
			require.resolve(`${platformPackage}/package.json`),
		);
		const binaryPath = join(packagePath, "bin", getBinaryName());
		return existsSync(binaryPath);
	} catch {
		return false;
	}
}

async function downloadFromNpm(packageName, version) {
	const registryUrl = `https://registry.npmjs.org/${packageName}/-/${packageName.replace("@", "").replace("/", "-")}-${version}.tgz`;

	return new Promise((resolve, reject) => {
		get(registryUrl, (response) => {
			if (response.statusCode === 302 || response.statusCode === 301) {
				get(response.headers.location, (redirectResponse) => {
					resolve(redirectResponse);
				}).on("error", reject);
			} else if (response.statusCode === 200) {
				resolve(response);
			} else {
				reject(
					new Error(
						`Failed to download: ${response.statusCode} ${response.statusMessage}`,
					),
				);
			}
		}).on("error", reject);
	});
}

async function extractTarball(stream, destDir) {
	const gunzip = createGunzip();
	const tempDir = join(destDir, ".tmp-extract");

	mkdirSync(tempDir, { recursive: true });

	return new Promise((resolve, reject) => {
		let dataChunks = [];

		stream.pipe(gunzip);

		gunzip.on("data", (chunk) => dataChunks.push(chunk));
		gunzip.on("end", async () => {
			try {
				const tarData = Buffer.concat(dataChunks);
				// Simple tar extraction - look for the binary file
				let offset = 0;
				while (offset < tarData.length) {
					const header = tarData.slice(offset, offset + 512);
					if (header[0] === 0) break;

					const fileName = header.toString("utf8", 0, 100).replace(/\0/g, "");
					const fileSizeStr = header.toString("utf8", 124, 136).replace(/\0/g, "").trim();
					const fileSize = parseInt(fileSizeStr, 8) || 0;

					offset += 512; // Move past header

					if (fileName.includes("bin/") && fileSize > 0) {
						const binaryName = getBinaryName();
						if (fileName.endsWith(binaryName)) {
							const content = tarData.slice(offset, offset + fileSize);
							const destPath = join(destDir, binaryName);
							writeFileSync(destPath, content);
							chmodSync(destPath, 0o755);
							resolve(destPath);
							return;
						}
					}

					// Move to next file (512-byte aligned)
					offset += Math.ceil(fileSize / 512) * 512;
				}
				reject(new Error("Binary not found in tarball"));
			} catch (err) {
				reject(err);
			}
		});
		gunzip.on("error", reject);
	});
}

async function downloadBinary() {
	const platformKey = getPlatformKey();
	const platformPackage = PLATFORM_PACKAGES[platformKey];

	if (!platformPackage) {
		console.log(`[postinstall] Unsupported platform: ${platformKey}`);
		return;
	}

	console.log(
		`[postinstall] Platform package not found, downloading ${platformPackage}@${VERSION}...`,
	);

	try {
		const response = await downloadFromNpm(platformPackage, VERSION);
		await extractTarball(response, __dirname);
		console.log(`[postinstall] Successfully installed binary for ${platformKey}`);
	} catch (error) {
		console.error(`[postinstall] Failed to download binary: ${error.message}`);
		console.error(
			"[postinstall] You may need to install the platform package manually:",
		);
		console.error(`  npm install ${platformPackage}`);
	}
}

async function main() {
	// Check if platform package is already installed via optionalDependencies
	if (isPlatformPackageInstalled()) {
		console.log("[postinstall] Platform binary already installed via optionalDependencies");
		return;
	}

	// Check if binary already exists in bin directory
	const binaryPath = join(__dirname, getBinaryName());
	if (existsSync(binaryPath)) {
		console.log("[postinstall] Binary already exists");
		return;
	}

	// Download as fallback
	await downloadBinary();
}

main().catch((error) => {
	console.error("[postinstall] Error:", error.message);
	// Don't fail the install, just warn
	process.exit(0);
});
