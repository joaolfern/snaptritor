#!/usr/bin/env node
// T008's smoke test: proves simulated mouse input reaches a real window. Clicks Notepad's "File"
// menu and captures the result, so success is verified by actually looking at the screenshot
// (a dropdown visibly open) -- not just "the script didn't throw", per T007's lesson.
//
// Usage: node smoke-click.ts

import { fileURLToPath } from "node:url";
import { findWindow, focusWindow } from "../src/windows/findWindow.ts";
import { clickProportional } from "../src/windows/click.ts";
import { capture, saveCapture } from "../src/windows/capture.ts";

const found = await findWindow("Notepad");
if (!found) {
  console.error('No window found matching "Notepad" -- open Notepad first.');
  process.exit(1);
}

console.log(`Found window: "${found.title}"`);
console.log(`Rect: ${JSON.stringify(found.rect)}`);

await focusWindow(found);
await new Promise((resolve) => setTimeout(resolve, 300));

// Modern Notepad's "File" menu button sits near the top-left of the window, proportionally.
await clickProportional(found.rect, 0.03, 0.08);
await new Promise((resolve) => setTimeout(resolve, 300)); // let the dropdown render

const image = await capture(found.rect);
const outputPath = fileURLToPath(new URL("../smoke-click-output.png", import.meta.url));
await saveCapture(image, outputPath);
console.log(`Clicked "File" menu area; saved result to: ${outputPath}`);
