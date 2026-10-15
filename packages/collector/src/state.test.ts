import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INITIAL_COLLECTOR_STATE, type CollectorState } from "@snaptritor/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readState, recordError, recordInspection, shouldRunInspection, writeState } from "./state.js";

let tempDir: string;

beforeEach(async () => {
  // Explicitly the OS tmp dir (never the repo, never anywhere under the game's own files —
  // constitution Article 4 is about the game's files specifically, but this keeps the habit).
  tempDir = await mkdtemp(join(tmpdir(), "snaptritor-state-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("readState / writeState", () => {
  it("returns the initial state when no file exists yet", async () => {
    const state = await readState(join(tempDir, "missing.json"));
    expect(state).toEqual(INITIAL_COLLECTOR_STATE);
  });

  it("round-trips a written state back unchanged", async () => {
    const path = join(tempDir, "state.json");
    const state: CollectorState = {
      ...INITIAL_COLLECTOR_STATE,
      lastInspectionAt: "2026-10-15T19:10:00.000Z",
      lastImageHash: "0123456789abcdef",
    };
    await writeState(path, state);
    const readBack = await readState(path);
    expect(readBack).toEqual(state);
  });

  it("throws on a file that exists but isn't valid CollectorState JSON", async () => {
    const path = join(tempDir, "corrupt.json");
    await writeState(path, INITIAL_COLLECTOR_STATE);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "{ not valid json", "utf8");
    await expect(readState(path)).rejects.toThrow();
  });
});

describe("shouldRunInspection", () => {
  it("is true when inspection is not paused", () => {
    expect(shouldRunInspection(INITIAL_COLLECTOR_STATE)).toBe(true);
  });

  it("is false when inspection is paused", () => {
    expect(shouldRunInspection({ ...INITIAL_COLLECTOR_STATE, inspectionPaused: true })).toBe(false);
  });
});

describe("recordError", () => {
  it("sets lastError without touching other fields", () => {
    const before: CollectorState = {
      ...INITIAL_COLLECTOR_STATE,
      lastInspectionAt: "2026-10-15T19:10:00.000Z",
      inspectionPaused: true,
    };
    const after = recordError(before, "window not found");
    expect(after.lastError).toBe("window not found");
    expect(after.lastInspectionAt).toBe(before.lastInspectionAt);
    expect(after.inspectionPaused).toBe(before.inspectionPaused);
  });
});

describe("recordInspection", () => {
  it("sets the inspection timestamps and hash, and clears any previous error", () => {
    const before: CollectorState = { ...INITIAL_COLLECTOR_STATE, lastError: "previous failure" };
    const after = recordInspection(before, {
      inspectedAt: "2026-10-15T19:10:00.000Z",
      nextInspectionAt: "2026-10-16T03:10:00.000Z",
      imageHash: "abcdef0123456789",
    });
    expect(after.lastInspectionAt).toBe("2026-10-15T19:10:00.000Z");
    expect(after.nextInspectionAt).toBe("2026-10-16T03:10:00.000Z");
    expect(after.lastImageHash).toBe("abcdef0123456789");
    expect(after.lastError).toBeNull();
  });
});
