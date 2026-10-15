// Downloads a portable Windows Node.js build (no installer, no registry entries) so the NSIS
// installer (T013) can bundle it for the headless `--inspect` Scheduled Task, instead of relying
// on a Node install already being on the target player's machine (constitution art. 7 -- the
// installer must be self-sufficient on a clean PC). Pinned to the exact version already proven
// to run nut-js's native bindings correctly on the dev machine (see CLAUDE.md) -- not "latest",
// to avoid a surprise ABI or behavior change between dev-time testing and what ships.
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";

const NODE_VERSION = "v25.6.1";
const ARCHIVE_NAME = `node-${NODE_VERSION}-win-x64`;
const DOWNLOAD_URL = `https://nodejs.org/dist/${NODE_VERSION}/${ARCHIVE_NAME}.zip`;
const VENDOR_DIR = new URL("../vendor", import.meta.url).pathname;
const OUT_PATH = `${VENDOR_DIR}/node.exe`;

if (existsSync(OUT_PATH)) {
  console.log(`${OUT_PATH} already present; skipping download.`);
  process.exit(0);
}

mkdirSync(VENDOR_DIR, { recursive: true });

// nodejs.org only ships Windows builds as .zip, not .tar.gz -- using the system `unzip` (present
// on this WSL dev machine) rather than pulling in a zip-reading npm package for a one-time,
// build-time-only script.
const zipPath = `${VENDOR_DIR}/${ARCHIVE_NAME}.zip`;
console.log(`Downloading ${DOWNLOAD_URL} ...`);
const response = await fetch(DOWNLOAD_URL);
if (!response.ok) {
  throw new Error(`Download failed: HTTP ${response.status}`);
}
await pipeline(response.body, createWriteStream(zipPath));

// `unzip` isn't installed on this dev machine; python3's stdlib zipfile module is already
// present and avoids adding a new system dependency for a one-time, build-time-only step.
const { execFileSync } = await import("node:child_process");
execFileSync("python3", ["-m", "zipfile", "-e", zipPath, VENDOR_DIR]);
execFileSync("mv", [`${VENDOR_DIR}/${ARCHIVE_NAME}/node.exe`, OUT_PATH]);
rmSync(`${VENDOR_DIR}/${ARCHIVE_NAME}`, { recursive: true, force: true });
rmSync(zipPath, { force: true });

console.log(`Fetched portable node.exe (${NODE_VERSION}) to ${OUT_PATH}`);
