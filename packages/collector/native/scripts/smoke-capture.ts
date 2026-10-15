#!/usr/bin/env node
// T007's smoke test: proves window-finding + screen capture work natively on this Windows
// machine, independent of the real game. Run via Windows' own node (not WSL's) -- see
// packages/collector/native/README.md.
//
// Usage: node smoke-capture.ts <window title substring>

import { fileURLToPath } from "node:url";
import { findWindow, focusWindow } from "../src/windows/findWindow.ts";
import { capture, saveCapture } from "../src/windows/capture.ts";

const titleSubstring = process.argv[2];
if (!titleSubstring) {
  console.error("Usage: node smoke-capture.ts <window title substring>");
  process.exit(1);
}

const found = await findWindow(titleSubstring);
if (!found) {
  console.error(`No window found matching "${titleSubstring}"`);
  process.exit(1);
}

console.log(`Found window: "${found.title}"`);
console.log(`Rect: ${JSON.stringify(found.rect)}`);

// Capturing without focusing first grabs whatever is actually on top of the screen at that
// rect, not necessarily this window's own content — confirmed the hard way: an earlier run of
// this script (before this line existed) captured VS Code because it happened to be on top of
// Notepad's screen region at the time.
await focusWindow(found);
await new Promise((resolve) => setTimeout(resolve, 300)); // let the window-manager finish raising it

const image = await capture(found.rect);
const outputPath = fileURLToPath(new URL("../smoke-capture-output.png", import.meta.url));
await saveCapture(image, outputPath);
console.log(`Saved capture to: ${outputPath}`);
