/**
 * Launching and closing the game itself (RF02, corrected 2026-10-15): the unattended run starts
 * from a PC that just woke from sleep, where nothing is running, so the collector has to start
 * the game rather than assume it's already open.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Through Steam's own URI rather than SNAP.exe directly, so Steam's login/DRM handshake happens
// the same way it does when the player clicks Play. App id confirmed live via Get-StartApps.
const STEAM_LAUNCH_URI = "steam://rungameid/1997040";
const GAME_PROCESS = "SNAP.exe";

export async function isGameRunning(): Promise<boolean> {
  const { stdout } = await run("tasklist.exe", ["/FI", `IMAGENAME eq ${GAME_PROCESS}`, "/NH", "/FO", "CSV"]);
  return stdout.toLowerCase().includes(GAME_PROCESS.toLowerCase());
}

export async function launchGame(): Promise<void> {
  // `start` needs an (empty) window-title argument first, or it treats the quoted URI as the title.
  await run("cmd.exe", ["/c", "start", "", STEAM_LAUNCH_URI]);
}

/** Asks the game to close (WM_CLOSE), and only forces it if it's still there after a grace period. */
export async function closeGame(): Promise<void> {
  await run("taskkill.exe", ["/IM", GAME_PROCESS]).catch(() => undefined);
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!(await isGameRunning())) return;
  }
  await run("taskkill.exe", ["/F", "/IM", GAME_PROCESS]).catch(() => undefined);
}
