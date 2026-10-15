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
import { writeState } from "../../src/state.ts";
import { INITIAL_COLLECTOR_STATE } from "../../../shared/src/index.ts";
import { registerInspectionTask, unregisterTask } from "../src/scheduler.ts";

const TASK_NAME = "SnaptritorInspection";
// 3x/day, 10 minutes after each 8-hour shop-refresh boundary (plan.md's Q02: the real cadence is
// still a user decision, finalized at T018 — this placeholder matches T011's own smoke-tested
// value so the installer's default behaves exactly like what was already verified live).
const DEFAULT_DAILY_TIMES = ["03:10", "11:10", "19:10"];

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
