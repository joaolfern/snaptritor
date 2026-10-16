// Re-applies a fix that a fresh `npm install` (or the local-install-then-robocopy pattern used
// for every native dependency here — see CLAUDE.md) would otherwise silently undo: mime@2.x ships
// both `mime.js` and `Mime.js` in the same directory, two genuinely different files that Windows'
// case-insensitive NTFS merges into one during packaging, silently keeping the wrong file's
// content under one of the two names. This isn't cosmetic — it crashed every real `--inspect` run
// in the packaged app (v0.1.0-v0.3.1) with "TypeError: Mime is not a constructor", since nothing
// ever surfaced an error at build time. Checked in (not left as an undocumented one-off edit to a
// gitignored node_modules) specifically so this can't silently regress again. See CLAUDE.md for
// the full incident writeup.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const mimeDir = join(import.meta.dirname, "..", "node_modules", "mime");
const brokenClassFile = join(mimeDir, "Mime.js");
const fixedClassFile = join(mimeDir, "MimeClass.js");
const indexFile = join(mimeDir, "index.js");

if (!existsSync(mimeDir)) {
  console.log("node_modules/mime not present — nothing to patch (nut-js not installed yet?).");
  process.exit(0);
}

if (existsSync(fixedClassFile)) {
  console.log("mime already patched (MimeClass.js exists).");
  process.exit(0);
}

if (!existsSync(brokenClassFile)) {
  console.error("node_modules/mime/Mime.js not found — mime's layout may have changed; check this script still applies.");
  process.exit(1);
}

renameSync(brokenClassFile, fixedClassFile);

const indexSource = readFileSync(indexFile, "utf8");
const patchedIndexSource = indexSource.replace("require('./Mime')", "require('./MimeClass')");
if (patchedIndexSource === indexSource) {
  console.error("index.js didn't contain the expected require('./Mime') — check this script still applies.");
  process.exit(1);
}
writeFileSync(indexFile, patchedIndexSource, "utf8");

console.log("Patched node_modules/mime: Mime.js -> MimeClass.js, index.js updated.");
