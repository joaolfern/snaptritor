import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// A relative import, not the bare "@snaptritor/shared" specifier: Node's native TypeScript
// support resolves a relative .ts path directly, but doesn't reliably follow a *third-party*
// package's "main": "./src/index.ts" field the way a bundler (or vitest, which is how this
// package's own tests run it) would — confirmed by hitting ERR_MODULE_NOT_FOUND with the bare
// specifier here, despite the exact same import resolving fine from packages/collector/src/state.ts
// under vitest. The relative path sidesteps package-main resolution entirely.
import { InspectionSubmission, isSameImage, perceptualHash } from "../../../shared/src/index.ts";
import {
  readState,
  recordError,
  recordInspection,
  shouldRunInspection,
  writeState,
} from "../../src/state.ts";
import { DAILY_CARDS_REGION, GAME_WINDOW_TITLE, NAVIGATE_TO_DAILY_CARDS } from "./navigation.ts";
import { clickProportional } from "./windows/click.ts";
import { capture, saveCapture, toHashablePixels } from "./windows/capture.ts";
import { findWindow, focusWindow, type WindowRect } from "./windows/findWindow.ts";

export interface InspectOptions {
  statePath: string;
  workerUrl: string;
  collectorSecret: string;
  /**
   * RF10's "can be disabled by configuration for debugging": skips putting the PC to sleep at the
   * end of the run. Does NOT skip the POST to `workerUrl` — pointing `workerUrl` at a local
   * `wrangler dev` instance (not a deployed Worker) is what makes this testable without a real
   * deployment, independent of this flag.
   */
  dryRun: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function regionFromFractions(
  rect: WindowRect,
  fractions: { leftFraction: number; topFraction: number; widthFraction: number; heightFraction: number },
): WindowRect {
  return {
    left: Math.round(rect.left + rect.width * fractions.leftFraction),
    top: Math.round(rect.top + rect.height * fractions.topFraction),
    width: Math.round(rect.width * fractions.widthFraction),
    height: Math.round(rect.height * fractions.heightFraction),
  };
}

/**
 * Polls `region` until two consecutive captures agree closely (navigation.ts's documented
 * approach: no loading-spinner state was ever observed in T009 to diff against instead). A
 * tighter threshold than {@link isSameImage}'s change-detection default, since "settled" means
 * near-pixel-identical, not merely "still the same shop". Returns `null` on timeout — the caller
 * treats that as a failed run (NF06), never a half-loaded capture.
 */
const SETTLE_THRESHOLD_BITS = 2;

async function waitForStableCapture(
  region: WindowRect,
  options: { timeoutMs: number; intervalMs: number },
): Promise<Awaited<ReturnType<typeof capture>> | null> {
  const deadline = Date.now() + options.timeoutMs;
  let previousHash: string | null = null;

  while (Date.now() < deadline) {
    const image = await capture(region);
    const hashable = await toHashablePixels(image);
    const currentHash = perceptualHash(hashable.data, hashable.width, hashable.height, hashable.channels);

    if (previousHash !== null && isSameImage(previousHash, currentHash, SETTLE_THRESHOLD_BITS)) {
      return image;
    }
    previousHash = currentHash;
    await sleep(options.intervalMs);
  }
  return null;
}

async function postInspection(options: {
  workerUrl: string;
  collectorSecret: string;
  capturedAt: string;
  imageHash: string;
  pngPath: string;
}): Promise<void> {
  const imageBytes = await readFile(options.pngPath);
  const submission = InspectionSubmission.parse({
    capturedAt: options.capturedAt,
    imageHash: options.imageHash,
  });

  const form = new FormData();
  form.set("metadata", JSON.stringify(submission));
  form.set("image", new Blob([imageBytes], { type: "image/png" }), "shop.png");

  const response = await fetch(new URL("/inspections", options.workerUrl), {
    method: "POST",
    headers: { "X-Collector-Secret": options.collectorSecret },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Worker rejected the inspection: ${response.status} ${await response.text()}`);
  }
}

/**
 * Runs one inspection (RF02–RF06, RF10): check the pause flag, navigate to Daily Cards, capture
 * it, compare against the last stored hash, and send onward only if it changed. Composes
 * T001–T002's state/hash logic with T007–T009's window/capture/click/navigation modules.
 */
export async function runInspection(options: InspectOptions): Promise<void> {
  let state = await readState(options.statePath);

  if (!shouldRunInspection(state)) {
    console.log("Inspection is paused; skipping this run.");
    return;
  }

  const found = await findWindow(GAME_WINDOW_TITLE);
  if (!found) {
    state = recordError(state, `Game window "${GAME_WINDOW_TITLE}" not found — is the game running?`);
    await writeState(options.statePath, state);
    console.error(state.lastError);
    return;
  }

  await focusWindow(found);
  await sleep(300);

  for (const step of NAVIGATE_TO_DAILY_CARDS) {
    console.log(`Navigating: ${step.description}`);
    await clickProportional(found.rect, step.xFraction, step.yFraction);
    await sleep(500);
  }

  const region = regionFromFractions(found.rect, DAILY_CARDS_REGION);
  const image = await waitForStableCapture(region, { timeoutMs: 8000, intervalMs: 300 });
  if (!image) {
    state = recordError(state, "Shop screen never settled within 8s — navigation may have failed");
    await writeState(options.statePath, state);
    console.error(state.lastError);
    return;
  }

  const hashable = await toHashablePixels(image);
  const imageHash = perceptualHash(hashable.data, hashable.width, hashable.height, hashable.channels);
  const capturedAt = new Date().toISOString();

  if (state.lastImageHash && isSameImage(state.lastImageHash, imageHash)) {
    console.log("Shop unchanged; nothing sent.");
  } else {
    const pngPath = join(tmpdir(), `snaptritor-inspection-${Date.now()}.png`);
    await saveCapture(image, pngPath);

    await postInspection({
      workerUrl: options.workerUrl,
      collectorSecret: options.collectorSecret,
      capturedAt,
      imageHash,
      pngPath,
    });
    console.log(`Changed shop detected; sent to ${options.workerUrl}/inspections`);
  }

  state = recordInspection(state, { inspectedAt: capturedAt, nextInspectionAt: null, imageHash });
  await writeState(options.statePath, state);

  // RF10, for both outcomes above — the run is finished either way. Only re-sleep the PC if this
  // run's own wake-capable trigger is what woke it (the user's correction): a scheduled inspection
  // that happens to run while the player is actively using the PC for something else must not yank
  // it to sleep out from under them.
  if (options.dryRun) {
    console.log("[dry-run] Skipping sleep (RF10 disabled for debugging).");
  } else if (await wasAsleepBeforeThisRun()) {
    await sleepPc();
  } else {
    console.log("PC was already awake before this run started; leaving it awake.");
  }
}

/**
 * Puts the PC to sleep (RF10). `SetSuspendState` is the standard command-line mechanism on
 * Windows; `Force=1` closes the current user session's apps without prompting (the collector runs
 * unattended, so nothing can answer a "save your work?" dialog anyway), `DisableWakeEvent=0`
 * leaves scheduled wake events (T011's wake-capable task) able to wake it again.
 */
async function sleepPc(): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]);
}

/**
 * Whether the PC appears to have been asleep until *this run's own* wake-capable trigger (T011)
 * woke it, as opposed to already being awake (the player using it) when the scheduled time
 * arrived. There is no direct "did my own task wake this machine" signal, so this is a heuristic:
 * the most recent system resume-from-sleep event (Windows Event Log, `Microsoft-Windows-Power-
 * Troubleshooter` provider, event ID 1) is checked against a short time window from now. A resume
 * just now strongly suggests this run caused it; no recent resume means the PC was already up.
 *
 * **Not verified against a real sleep/wake cycle** — doing that from this session would risk
 * disconnecting the very interop channel this automation runs through. Treat this as implemented
 * but unverified until it's exercised for real (T011/T018, once wake-capable scheduling exists).
 * Fails safe: if the query itself fails for any reason, this returns `false` (don't sleep) — an
 * unexpected extra wakeful PC is a much smaller problem than yanking it to sleep under the player.
 */
async function wasAsleepBeforeThisRun(thresholdMs = 2 * 60 * 1000): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try {
    const { stdout } = await promisify(execFile)("powershell.exe", [
      "-NoProfile",
      "-Command",
      "(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Power-Troubleshooter'; Id=1} -MaxEvents 1).TimeCreated.ToString('o')",
    ]);
    const lastResume = new Date(stdout.trim());
    if (Number.isNaN(lastResume.getTime())) return false;
    return Date.now() - lastResume.getTime() < thresholdMs;
  } catch {
    return false;
  }
}
