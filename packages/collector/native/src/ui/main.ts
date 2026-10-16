/**
 * Electron main process for the status window (T012: RF13, RF14, RF15, RF18).
 *
 * Deliberately self-contained rather than importing `../../../src/state.ts` or `../scheduler.ts`:
 * Electron 33 bundles Node 20.18 (confirmed live — `process.versions.node` under
 * `ELECTRON_RUN_AS_NODE=1`), which has no native TypeScript support, unlike the Node 25 this
 * repo's other native/ scripts run under directly. Cross-compiling those files into this
 * process's build would mean reaching outside this project (into `packages/collector/src/` and
 * transitively `packages/shared/src/`), which breaks `tsc`'s single-rootDir output mapping. The
 * pragmatic choice: duplicate the small amount of logic this window actually needs, in plain
 * Node-20-compatible TypeScript, documented here as a deliberate trade-off rather than an
 * oversight. If `CollectorState`'s shape changes, this file's `State` interface needs updating too
 * — there is no shared compile-time check across this boundary.
 */
import { app, BrowserWindow, ipcMain } from "electron";
// Not `import { autoUpdater } from "electron-updater"` — electron-updater is CommonJS, and
// Node's ESM loader statically analyzes a CJS module's exports (cjs-module-lexer) to decide what
// counts as a "named export"; it doesn't always find everything the package actually exposes at
// runtime, even though the package's own .d.ts (which only TypeScript's type-checker reads, not
// Node's loader) claims a named export exists. Confirmed live: this exact line crashed the
// packaged app on launch with "SyntaxError: Named export 'autoUpdater' not found", despite `tsc`
// raising no error at all — a real gap between compile-time type-checking and runtime module
// resolution that only shows up by actually running the built app, not by compiling it.
import electronUpdater from "electron-updater";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";

const { autoUpdater } = electronUpdater;

// Chromium's GPU process crashes fatally on this machine with zero flags (confirmed live: "GPU
// process isn't usable. Goodbye", app exits) — these two avoid that. A *separate* problem (window
// chrome rendered, content area stayed permanently blank, no error at all) needed a different fix
// entirely — see the `ready-to-show` handler below, not more GPU flags.
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");

interface State {
  lastInspectionAt: string | null;
  nextInspectionAt: string | null;
  inspectionPaused: boolean;
  wakeAutomationPaused: boolean;
  lastImageHash: string | null;
  lastError: string | null;
  collectorSecret: string | null;
}

const INITIAL_STATE: State = {
  lastInspectionAt: null,
  nextInspectionAt: null,
  inspectionPaused: false,
  wakeAutomationPaused: false,
  lastImageHash: null,
  lastError: null,
  collectorSecret: null,
};

// "appData" (plain %APPDATA%), not "userData" (%APPDATA%\<app name>): Electron derives the app
// name from package.json's "name" field ("snaptritor-collector-native"), which would silently
// diverge from the literal "%APPDATA%\Snaptritor\state.json" path T013's installer registers the
// headless Scheduled Task against. Resolving explicitly to the same literal "Snaptritor" folder
// here means both sides agree by construction, independent of any package.json renaming later.
const STATE_PATH = process.env.SNAPTRITOR_STATE_PATH ?? join(app.getPath("appData"), "Snaptritor", "state.json");
const WORKER_URL = process.env.SNAPTRITOR_WORKER_URL ?? "https://snaptritor.nosnocabo.com.br";
const TASK_NAME = "SnaptritorInspection";

function readState(): State {
  if (!existsSync(STATE_PATH)) return INITIAL_STATE;
  return { ...INITIAL_STATE, ...JSON.parse(readFileSync(STATE_PATH, "utf8")) };
}

function writeState(state: State): void {
  // Unlike Electron's auto-created "userData" dir, the explicit appData/Snaptritor path above
  // isn't guaranteed to exist yet (e.g. a dev run with no installer-created folder) — the
  // installer creates it before this ever runs in production, but this stays correct either way.
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", script]);
  return stdout;
}

async function setWakeAutomationEnabled(enabled: boolean): Promise<void> {
  const cmdlet = enabled ? "Enable-ScheduledTask" : "Disable-ScheduledTask";
  await runPowerShell(`${cmdlet} -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue | Out-Null`);
}

ipcMain.handle("get-state", () => readState());

ipcMain.handle("set-inspection-paused", (_event, paused: boolean) => {
  const state = readState();
  state.inspectionPaused = paused;
  writeState(state);
  return state;
});

ipcMain.handle("set-wake-paused", async (_event, paused: boolean) => {
  const state = readState();
  state.wakeAutomationPaused = paused;
  writeState(state);
  await setWakeAutomationEnabled(!paused); // RF15: disabling the task is what actually stops the wake
  return state;
});

ipcMain.handle("claim-pairing-code", async (_event, code: string) => {
  const response = await fetch(new URL("/pairing/claim", WORKER_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  const { collectorSecret } = (await response.json()) as { collectorSecret: string };
  const state = readState();
  state.collectorSecret = collectorSecret;
  writeState(state);
  return state;
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 420,
    height: 320,
    show: false,
    backgroundColor: "#ffffff",
    // Windows picks up the packaged .exe's own icon (electron-builder.yml's win.icon) for the
    // taskbar/shortcut by default; this is the separate, explicit runtime window/taskbar icon —
    // without it the window falls back to Electron's generic default while actually running.
    icon: join(import.meta.dirname, "icon.png"),
    webPreferences: {
      // .cjs, not .js: Electron's preload loader doesn't execute ESM even with
      // package.json's "type":"module" — .cts source (forces CommonJS) -> .cjs output fixes it.
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.on("console-message", (_event, level, message, line) => {
    console.log(`[renderer:${level}] ${message} (line ${line})`);
  });
  win.once("ready-to-show", () => {
    win.show();
    // Showing alone doesn't give the window OS-level keyboard focus — confirmed live
    // (document.activeElement stayed BODY, HTML's own `autofocus` never took effect either).
    win.focus();
  });
  // NF06-style observability: a failed load or a dead renderer should be visible after the fact,
  // not just a silently blank/missing window.
  win.webContents.on("did-fail-load", (_event, code, description) =>
    console.error(`[main] did-fail-load: ${code} ${description}`),
  );
  win.webContents.on("render-process-gone", (_event, details) =>
    console.error(`[main] render-process-gone: ${JSON.stringify(details)}`),
  );
  // status.html is copied alongside main.js/preload.js into dist/ui/ at build time (package.json's
  // build script) — not compiled (it's not TypeScript), just placed next to its compiled siblings
  // so this same-directory reference holds.
  const htmlPath = join(import.meta.dirname, "status.html");
  win.loadFile(htmlPath);
});

app.on("window-all-closed", () => app.quit());

// RF19/T020: this status window is the only Electron process with a UI to notify from, and is
// realistically running whenever the player might actually see a native "update ready" toast —
// the far-more-frequent headless --inspect process has neither and does not check itself.
// checkForUpdatesAndNotify() downloads silently and applies on the next quit+relaunch (standard
// NSIS differential-update behavior); it needs a real published GitHub Release to find anything,
// so this is a no-op (logged, not thrown) against a dev run with no publish config match.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

autoUpdater.on("error", (err) => console.error(`[autoUpdater] error: ${err.message}`));
autoUpdater.on("update-available", (info) => console.log(`[autoUpdater] update available: ${info.version}`));
autoUpdater.on("update-not-available", () => console.log("[autoUpdater] already on the latest version"));
autoUpdater.on("update-downloaded", (info) =>
  console.log(`[autoUpdater] update ${info.version} downloaded; applies on next restart`),
);

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error(`[autoUpdater] check failed: ${err.message}`));
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error(`[autoUpdater] check failed: ${err.message}`));
  }, UPDATE_CHECK_INTERVAL_MS);
});
