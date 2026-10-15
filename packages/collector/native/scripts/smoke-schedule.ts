#!/usr/bin/env node
// T011's smoke test: registers a throwaway wake-capable task, verifies its real settings stuck
// (not just that the registration call didn't throw), exercises the pause/resume toggle, then
// cleans up. No game involved; proves the scheduling mechanism independent of everything else.

import {
  getTaskStatus,
  registerInspectionTask,
  setWakeAutomationEnabled,
  unregisterTask,
} from "../src/scheduler.ts";

const TASK_NAME = "SnaptritorSmoke";

try {
  await registerInspectionTask({
    taskName: TASK_NAME,
    executable: "cmd.exe",
    arguments: ["/c", "echo smoke test"],
    dailyTimes: ["03:10", "11:10", "19:10"],
  });

  const afterCreate = await getTaskStatus(TASK_NAME);
  console.log("After create:", JSON.stringify(afterCreate));
  if (!afterCreate.exists || !afterCreate.enabled || !afterCreate.wakeToRun) {
    throw new Error("Task did not register with the expected state");
  }

  await setWakeAutomationEnabled(TASK_NAME, false);
  const afterDisable = await getTaskStatus(TASK_NAME);
  console.log("After disable:", JSON.stringify(afterDisable));
  if (afterDisable.enabled) throw new Error("Task should be disabled but isn't");

  await setWakeAutomationEnabled(TASK_NAME, true);
  const afterEnable = await getTaskStatus(TASK_NAME);
  console.log("After re-enable:", JSON.stringify(afterEnable));
  if (!afterEnable.enabled) throw new Error("Task should be enabled but isn't");

  console.log("PASS");
} finally {
  await unregisterTask(TASK_NAME);
  const afterDelete = await getTaskStatus(TASK_NAME);
  console.log("After delete:", JSON.stringify(afterDelete));
}
