#!/usr/bin/env node
// Real entry point: `--inspect` is what the wake-capable Scheduled Task (T011) runs headlessly.

import { runInspection } from "./src/inspect.ts";
import { readState } from "../src/state.ts";

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

// The real per-install secret lives in state.json, written there by T012's status window once
// the player claims a pairing code (RF18) — it is not known at install time, so the Scheduled
// Task's action can never bake it in as a literal argument. The env var remains only as a
// dev-time convenience for exercising --inspect against a state file that was never paired (e.g.
// a fresh fixture during local testing).
const collectorSecret = (await readState(statePath)).collectorSecret ?? process.env.SNAPTRITOR_COLLECTOR_SECRET;

if (!collectorSecret) {
  console.error(
    "No collector secret found in state — this install hasn't been paired yet. " +
      "Open the status window and enter the pairing code shown on your phone.",
  );
  process.exit(1);
}

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
