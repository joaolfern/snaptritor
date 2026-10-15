#!/usr/bin/env node
// Real entry point: `--inspect` is what the wake-capable Scheduled Task (T011) runs headlessly.
// No GUI entry point yet (T012).

import { runInspection } from "./src/inspect.ts";

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

if (!hasFlag("inspect")) {
  console.error("Usage: node cli.ts --inspect [--dry-run] [--worker-url <url>] [--state-path <path>]");
  process.exit(1);
}

const workerUrl = flagValue("worker-url") ?? "https://snaptritor-worker.example.workers.dev";
const statePath = flagValue("state-path") ?? "./snaptritor-state.json";
const collectorSecret = process.env.SNAPTRITOR_COLLECTOR_SECRET ?? "dev-test-secret-change-me";

try {
  await runInspection({
    statePath,
    workerUrl,
    collectorSecret,
    dryRun: hasFlag("dry-run"),
  });
} catch (err) {
  console.error("Inspection run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
