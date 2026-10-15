import { readFile, writeFile } from "node:fs/promises";
// Relative, not the bare "@snaptritor/shared" specifier — Node's native TS runtime (used when
// the collector's native/ code imports this file directly over the Windows side) doesn't reliably
// follow a third-party package's "main" field; the relative path works everywhere (both here under
// vitest and from native/'s raw-Node context) without needing two different versions of this file.
import { CollectorState, INITIAL_COLLECTOR_STATE } from "../../shared/src/index.ts";

/**
 * Reads the collector's local state file. A missing file is treated as a fresh install (returns
 * `INITIAL_COLLECTOR_STATE`, constitution Article 7 — no hidden config needed to get started), but
 * a file that exists and fails to parse is a real problem and throws, rather than silently
 * discarding whatever was there.
 */
export async function readState(path: string): Promise<CollectorState> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return INITIAL_COLLECTOR_STATE;
    }
    throw err;
  }
  return CollectorState.parse(JSON.parse(raw));
}

/** Writes the collector's local state file, validating it on the way out. */
export async function writeState(path: string, state: CollectorState): Promise<void> {
  const validated = CollectorState.parse(state);
  await writeFile(path, JSON.stringify(validated, null, 2), "utf8");
}

/**
 * Whether `--inspect` should actually run (RF14). Pure — takes a state value, not a path, so it's
 * testable with no disk and reusable from both the CLI entry point and its tests.
 */
export function shouldRunInspection(state: CollectorState): boolean {
  return !state.inspectionPaused;
}

/**
 * Records a failed run's error without disturbing any other field (NF06 — a failure must be
 * visible after the fact without a live terminal watching it happen).
 */
export function recordError(state: CollectorState, message: string): CollectorState {
  return { ...state, lastError: message };
}

/** Records a successful run's timestamps and hash, clearing any previous error. */
export function recordInspection(
  state: CollectorState,
  options: { inspectedAt: string; nextInspectionAt: string | null; imageHash: string | null },
): CollectorState {
  return {
    ...state,
    lastInspectionAt: options.inspectedAt,
    nextInspectionAt: options.nextInspectionAt,
    lastImageHash: options.imageHash,
    lastError: null,
  };
}
