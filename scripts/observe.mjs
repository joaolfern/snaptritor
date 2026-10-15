#!/usr/bin/env node
// Snapshot + diff tool for the ShopState write-trigger spike
// (specs/000-shopstate-write-trigger). Dependency-free (stdlib only) and
// read-only toward the game's files (constitution Article 4): every file is
// hashed until it stabilizes, then copied — nothing is written back to the
// source directory.
//
// Usage:
//   node scripts/observe.mjs snap <label>
//   node scripts/observe.mjs diff <labelA> <labelB>

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIR =
  '/mnt/c/Users/joaoa/AppData/LocalLow/Second Dinner/SNAP/Standalone/States/nvprod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_ROOT = path.join(
  __dirname,
  '..',
  'specs',
  '000-shopstate-write-trigger',
  'snapshots'
);

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function sha256(filePath) {
  const buf = await readFile(filePath);
  return { buf, hash: createHash('sha256').update(buf).digest('hex') };
}

// Guards against copying a torn write while the game is mid-save: hash the
// file, wait a second, hash again. Only once two reads agree do we treat the
// buffer as safe to copy.
async function readStableCopy(filePath, { retries = 5, delayMs = 1000 } = {}) {
  let previous = await sha256(filePath);
  for (let attempt = 0; attempt < retries; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const next = await sha256(filePath);
    if (next.hash === previous.hash) return next;
    previous = next;
  }
  throw new Error(`${filePath} did not stabilize after ${retries} retries`);
}

function summarizeShopState(buf) {
  const data = JSON.parse(stripBom(buf.toString('utf8')));
  const log = data.ServerState.CardShopModuleLog;
  const myCards = data.ServerState.CardShopModules.find(
    (m) => m.CardShopDefId === 'MyCardsShopModule'
  );
  const offered = log.OfferedCardDefIds.map((o) =>
    o.Item2 ? `${o.Item1} (${o.Item2})` : o.Item1
  );
  return {
    logTimeUpdated: log.TimeUpdated,
    nextRefresh: myCards?.NextRefresh ?? null,
    refreshIntervalHours: myCards?.CardShopDefConstants?.RefreshIntervalHours ?? null,
    offered,
  };
}

async function snap(label) {
  if (!label) throw new Error('Usage: node scripts/observe.mjs snap <label>');
  const destDir = path.join(SNAPSHOTS_ROOT, label, 'nvprod');
  await mkdir(destDir, { recursive: true });

  const entries = (await readdir(SOURCE_DIR, { withFileTypes: true })).filter((e) =>
    e.isFile()
  );

  const manifestFiles = [];
  let shopStateBuf = null;

  for (const entry of entries) {
    const srcPath = path.join(SOURCE_DIR, entry.name);
    const srcStat = await stat(srcPath);
    const { buf, hash } = await readStableCopy(srcPath);
    await writeFile(path.join(destDir, entry.name), buf);
    manifestFiles.push({ path: entry.name, mtimeMs: srcStat.mtimeMs, size: buf.length, sha256: hash });
    if (entry.name === 'ShopState.json') shopStateBuf = buf;
  }

  const manifest = {
    takenAt: new Date().toISOString(),
    sourceDir: SOURCE_DIR,
    files: manifestFiles,
  };
  await writeFile(
    path.join(SNAPSHOTS_ROOT, label, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`Snapshot "${label}" taken: ${manifestFiles.length} files copied.`);
  if (shopStateBuf) {
    const summary = summarizeShopState(shopStateBuf);
    const shopStateEntry = manifestFiles.find((f) => f.path === 'ShopState.json');
    console.log('ShopState.json:');
    console.log(`  file mtime:                    ${new Date(shopStateEntry.mtimeMs).toISOString()}`);
    console.log(`  CardShopModuleLog.TimeUpdated: ${summary.logTimeUpdated}`);
    console.log(
      `  MyCardsShopModule.NextRefresh: ${summary.nextRefresh} (every ${summary.refreshIntervalHours}h)`
    );
    console.log(`  offered: ${summary.offered.join(', ')}`);
  } else {
    console.log('  ShopState.json was not found in this snapshot.');
  }
}

async function loadManifest(label) {
  const raw = await readFile(path.join(SNAPSHOTS_ROOT, label, 'manifest.json'), 'utf8');
  return JSON.parse(raw);
}

async function diff(labelA, labelB) {
  if (!labelA || !labelB)
    throw new Error('Usage: node scripts/observe.mjs diff <labelA> <labelB>');

  const [manifestA, manifestB] = await Promise.all([loadManifest(labelA), loadManifest(labelB)]);
  const byPathA = new Map(manifestA.files.map((f) => [f.path, f]));
  const byPathB = new Map(manifestB.files.map((f) => [f.path, f]));
  const allPaths = new Set([...byPathA.keys(), ...byPathB.keys()]);

  console.log(`Diff: ${labelA} -> ${labelB}`);
  let anyChanged = false;
  for (const p of [...allPaths].sort()) {
    const a = byPathA.get(p);
    const b = byPathB.get(p);
    if (!a) {
      console.log(`  + ${p} (new in ${labelB})`);
      anyChanged = true;
    } else if (!b) {
      console.log(`  - ${p} (missing in ${labelB})`);
      anyChanged = true;
    } else if (a.sha256 !== b.sha256) {
      console.log(`  ~ ${p} (changed)`);
      anyChanged = true;
    }
  }
  if (!anyChanged) console.log('  (no files changed)');

  const shopA = byPathA.get('ShopState.json');
  const shopB = byPathB.get('ShopState.json');
  if (shopA && shopB) {
    console.log('\nShopState.json detail:');
    if (shopA.sha256 === shopB.sha256) {
      console.log('  unchanged (same content hash)');
    } else {
      const [bufA, bufB] = await Promise.all([
        readFile(path.join(SNAPSHOTS_ROOT, labelA, 'nvprod', 'ShopState.json')),
        readFile(path.join(SNAPSHOTS_ROOT, labelB, 'nvprod', 'ShopState.json')),
      ]);
      const sumA = summarizeShopState(bufA);
      const sumB = summarizeShopState(bufB);
      console.log(
        `  mtime:       ${new Date(shopA.mtimeMs).toISOString()} -> ${new Date(shopB.mtimeMs).toISOString()}`
      );
      console.log(`  TimeUpdated: ${sumA.logTimeUpdated} -> ${sumB.logTimeUpdated}`);
      console.log(`  offered:     [${sumA.offered.join(', ')}] -> [${sumB.offered.join(', ')}]`);
    }
  }
}

const [, , mode, ...args] = process.argv;

try {
  if (mode === 'snap') {
    await snap(args[0]);
  } else if (mode === 'diff') {
    await diff(args[0], args[1]);
  } else {
    console.error('Usage:');
    console.error('  node scripts/observe.mjs snap <label>');
    console.error('  node scripts/observe.mjs diff <labelA> <labelB>');
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
