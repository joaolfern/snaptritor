/**
 * Run by the NSIS installer (T013), via the bundled portable `node.exe` — never the dev
 * machine's own system Node, never Electron's. Reuses T011's `scheduler.ts` and T002's
 * `state.ts` directly rather than duplicating their logic: unlike the Electron status window
 * (T012), the bundled portable Node here is a real Node 25.x with native TS support, the same
 * runtime these modules were already built and verified against, so there's no runtime boundary
 * forcing a copy.
 *
 * Usage:
 *   node postinstall.ts --install --node-exe <path> --cli <path> --state-path <path> --worker-url <url>
 *   node postinstall.ts --uninstall
 */
import { existsSync } from "node:fs";
import { readState, writeState } from "../../src/state.ts";
import { INITIAL_COLLECTOR_STATE } from "../../../shared/src/index.ts";
import { registerInspectionTask, startTaskNow, unregisterTask } from "../src/scheduler.ts";

const TASK_NAME = "SnaptritorInspection";
// T018 (resolved 2026-10-15, by the user): the shop's daily reset is 19:00 UTC (16:00 BRT), and
// featured/spotlight rotate every 8h from that same anchor — boundaries at 16:00/00:00/08:00 BRT.
// `New-ScheduledTaskTrigger -At` uses the Task Scheduler's own local system time, not UTC, so
// these are BRT wall-clock times directly (the installer only ever targets this one machine,
// already in that timezone) — not the earlier arbitrary 03:10/11:10/19:10 placeholder, which was
// just evenly spaced for T011's own smoke test and never actually anchored to the real reset.
// 10 minutes after each boundary, same buffer rationale as before: give the server-side rotation
// time to actually land before checking.
const DEFAULT_DAILY_TIMES = ["00:10", "08:10", "16:10"];

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function install(): Promise<void> {
  const nodeExe = flagValue("node-exe");
  const cliPath = flagValue("cli");
  const statePath = flagValue("state-path");
  const workerUrl = flagValue("worker-url");
  if (!nodeExe || !cliPath || !statePath || !workerUrl) {
    console.error("--install needs --node-exe, --cli, --state-path and --worker-url");
    process.exit(1);
  }

  if (!existsSync(statePath)) {
    await writeState(statePath, INITIAL_COLLECTOR_STATE);
  }

  await registerInspectionTask({
    taskName: TASK_NAME,
    executable: nodeExe,
    arguments: [cliPath, "--inspect", "--worker-url", workerUrl, "--state-path", statePath],
    dailyTimes: DEFAULT_DAILY_TIMES,
  });

  console.log(`Registered ${TASK_NAME} and wrote initial state at ${statePath}`);

  // Found live, from a real reinstall: "Last inspection" stayed "never yet" for potentially
  // hours, until the next scheduled boundary — nothing ran an inspection right after install.
  // Only meaningful on a reinstall that preserves an existing paired state.json (a brand-new,
  // never-paired install has no collectorSecret yet, and cli.ts correctly refuses to run without
  // one — that case gets its own immediate trigger from main.ts, right after pairing succeeds,
  // not from here).
  const existingState = await readState(statePath);
  if (existingState.collectorSecret) {
    await startTaskNow(TASK_NAME);
    console.log("Already paired — triggered an immediate inspection run.");
  }
}

async function uninstall(): Promise<void> {
  await unregisterTask(TASK_NAME);
  console.log(`Unregistered ${TASK_NAME}`);
}

if (process.argv.includes("--uninstall")) {
  await uninstall();
} else if (process.argv.includes("--install")) {
  await install();
} else {
  console.error("Usage: postinstall.ts --install ... | --uninstall");
  process.exit(1);
}
