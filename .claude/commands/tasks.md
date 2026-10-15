---
description: Break an approved plan into ordered, independently verifiable tasks
argument-hint: [feature id, e.g. 001 — defaults to the newest spec]
---

Write the task list for feature **$ARGUMENTS** (no argument: the highest-numbered feature in `specs/`).

This is stage 3 of 4 (`/specify` → `/plan` → `/tasks` → `/implement`).

## Gates

1. Both `spec.md` and `plan.md` must exist for the feature. If `plan.md` is missing, stop and say
   to run `/plan` first.
2. Read `.specify/memory/constitution.md`, then the feature's `spec.md` and `plan.md`.

## Writing the tasks

Write `specs/NNN-slug/tasks.md` from `.specify/templates/tasks-template.md`.

- Fill the **coverage check table first.** Every `RF` in the spec must map to at least one task and
  every task to a requirement (Article 6). If a requirement has no task, the list is incomplete; if
  a task serves no requirement, either the spec is missing something or the task is scope creep —
  resolve it rather than shipping the orphan.
- Order the tasks so each one leaves the repo in a working state. Shared schemas and contracts come
  before the code that imports them (Article 5).
- Mark `[parallel-safe]` only where tasks touch disjoint files.
- **Every task names its verification as a command**, with the output that means success: a test, a
  typecheck, a CLI invocation with expected stdout. "Check it works" is not a verification step.
- Each task carries a Files line listing what it creates or changes. If a task touches more than a
  handful of files, split it.
- A task that needs the user (launching the game, a BIOS setting, a Cloudflare login) is written as
  an explicit checkpoint task saying what to ask for.

## After writing

Report the path, the task count, and confirm the coverage table has no orphans on either side.
Do not start implementing — that is `/implement`.
