---
description: Execute a feature's tasks in order, verifying each before checking it off
argument-hint: [feature id, or feature id + task id, e.g. "001 T004"]
---

Execute tasks for **$ARGUMENTS** (no argument: the newest feature's first unchecked task onward;
a task id: that task only).

This is stage 4 of 4 (`/specify` → `/plan` → `/tasks` → `/implement`).

## Gates

1. The feature's `tasks.md` must exist. If not, stop: run `/tasks` first. Do not improvise a task list.
2. Read `.specify/memory/constitution.md`, the feature's `spec.md`, `plan.md` and `tasks.md`, and
   the repo's `CLAUDE.md`.

## Executing

For each task, in order:

1. Set its status to `[~]` in `tasks.md` before starting.
2. Build exactly what the task says. If the task turns out to be wrong or impossible as written,
   **stop and fix the spec or plan first** (Article 1) — do not quietly build something else and
   leave the documents describing a system that does not exist.
3. Run the task's own Verify command. Show its real output.
4. Only if it passed, set the status to `[x]`. If it failed, leave `[~]`, say what failed with the
   output, and fix it before moving on. Never mark a task done because the code looks correct.
5. A checkpoint task that needs the user: stop there, ask for exactly what is needed, and resume on
   their answer.

## Constitution reminders that bite during implementation

- **Article 4:** game state is read-only. Copy the file, then parse the copy. Never write anywhere
  under `AppData/LocalLow/Second Dinner`.
- **Article 7:** whatever you build must be runnable from the CLI right now, against a fixture if
  the live file is stale. No feature may be verifiable only by waiting for a shop rotation.
- **Article 8:** no VAPID key, push subscription, account token or raw state snapshot gets committed.

## After the run

Report which tasks moved to `[x]`, which did not and why, and anything that contradicted the plan.
If behaviour diverged from the spec, update the spec in the same pass — the documents are the
source of truth, not a record of intent.
