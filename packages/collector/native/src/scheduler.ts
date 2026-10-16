/**
 * Wake-capable Scheduled Task registration (RF01, RF12, plan.md's Q06 resolution: the PC wakes
 * itself via this task rather than an externally-sent Wake-on-LAN packet).
 *
 * `schtasks.exe`'s plain command-line flags do not expose "wake the computer to run this task" —
 * that setting only exists via XML task definitions or the Task Scheduler COM API. PowerShell's
 * `*-ScheduledTask` cmdlets wrap that API cleanly, so this shells out to `powershell.exe` rather
 * than hand-rolling XML. Verified live before writing this: `New-ScheduledTaskSettingsSet
 * -WakeToRun` really does set `WakeToRun: True` (confirmed via `Get-ScheduledTask`), multiple
 * `New-ScheduledTaskTrigger -Daily -At <time>` objects really do combine into one task's trigger
 * list, and `Disable-ScheduledTask`/`Enable-ScheduledTask` really do flip `State` between
 * `Disabled` and `Ready`.
 */

async function runPowerShell(script: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", script]);
  return stdout;
}

/** PowerShell string literal escaping (single-quoted: double any embedded single quote). */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface RegisterTaskOptions {
  taskName: string;
  /** The executable to run (e.g. a path to `node.exe`). */
  executable: string;
  /** Arguments passed to `executable` (e.g. `["cli.ts", "--inspect"]`). */
  arguments: string[];
  /** Daily run times, 24h `"HH:mm"` format (plan.md's Q02 — the real cadence is a user decision). */
  dailyTimes: string[];
}

/** Registers (or replaces) the wake-capable Scheduled Task that runs `--inspect` (RF01, RF12). */
export async function registerInspectionTask(options: RegisterTaskOptions): Promise<void> {
  const triggers = options.dailyTimes
    .map((time, i) => `$trigger${i} = New-ScheduledTaskTrigger -Daily -At ${psQuote(time)}`)
    .join("; ");
  const triggerList = options.dailyTimes.map((_, i) => `$trigger${i}`).join(",");

  await runPowerShell(`
    $action = New-ScheduledTaskAction -Execute ${psQuote(options.executable)} -Argument ${psQuote(options.arguments.join(" "))}
    ${triggers}
    $settings = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName ${psQuote(options.taskName)} -Action $action -Trigger @(${triggerList}) -Settings $settings -Force | Out-Null
  `);
}

/** Removes a registered task entirely (used by the installer's uninstall path, and by tests). */
export async function unregisterTask(taskName: string): Promise<void> {
  await runPowerShell(`Unregister-ScheduledTask -TaskName ${psQuote(taskName)} -Confirm:$false -ErrorAction SilentlyContinue`);
}

/**
 * RF15's "pause wake automation" toggle: disabling the task stops Task Scheduler from running
 * it at all, which is what actually prevents the PC being woken for it — not a flag `--inspect`
 * itself checks, since `--inspect` never runs if the task never fired.
 */
export async function setWakeAutomationEnabled(taskName: string, enabled: boolean): Promise<void> {
  const cmdlet = enabled ? "Enable-ScheduledTask" : "Disable-ScheduledTask";
  await runPowerShell(`${cmdlet} -TaskName ${psQuote(taskName)} | Out-Null`);
}

/**
 * Fires the task immediately (used by the installer right after registration, so "Last
 * inspection" isn't stuck on "never yet" until the first scheduled boundary — found live, from a
 * real user report after a real install: the status window had nothing to show for potentially
 * hours). `Start-ScheduledTask` only signals Task Scheduler to begin the run and returns
 * immediately — it does not wait for `--inspect` itself to finish, so this stays fast enough to
 * call from the installer's own synchronous flow.
 */
export async function startTaskNow(taskName: string): Promise<void> {
  await runPowerShell(`Start-ScheduledTask -TaskName ${psQuote(taskName)}`);
}

export interface TaskStatus {
  exists: boolean;
  enabled: boolean;
  wakeToRun: boolean;
}

/** Reads back a registered task's real state — used by T012's status window and by tests. */
export async function getTaskStatus(taskName: string): Promise<TaskStatus> {
  const output = await runPowerShell(`
    $t = Get-ScheduledTask -TaskName ${psQuote(taskName)} -ErrorAction SilentlyContinue
    if ($null -eq $t) { Write-Output '{"exists":false,"enabled":false,"wakeToRun":false}' }
    else { Write-Output ('{"exists":true,"enabled":' + ($t.State -ne 'Disabled').ToString().ToLower() + ',"wakeToRun":' + $t.Settings.WakeToRun.ToString().ToLower() + '}') }
  `);
  return JSON.parse(output.trim()) as TaskStatus;
}
