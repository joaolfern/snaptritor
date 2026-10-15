---
description: Turn a ready spec into a technical plan, with an explicit constitution check
argument-hint: [feature id, e.g. 001 — defaults to the newest spec]
---

Write the technical plan for feature **$ARGUMENTS** (no argument: the highest-numbered feature in `specs/`).

This is stage 2 of 4 (`/specify` → `/plan` → `/tasks` → `/implement`).

## Gates — check these first, and stop if one fails

1. The feature's `spec.md` exists. If not: stop and tell the user to run `/specify` first.
2. Read `.specify/memory/constitution.md` in full.
3. Read the feature's `spec.md`. If its Open questions table holds a question that blocks a design
   decision this plan must make, **stop** and put that question to the user (AskUserQuestion)
   before writing anything. Planning around an unanswered blocker is how a spike gets skipped.
4. Read `CLAUDE.md` for the validated environment facts — the game-state paths, the WSL quirks,
   the installed toolchain. Do not re-derive them.

## Writing the plan

Write `specs/NNN-slug/plan.md` from `.specify/templates/plan-template.md`.

- Lead with the decision, then the reasoning. One approach, not a survey.
- Fill the **constitution check table row by row.** If an article does not hold, the plan is wrong —
  change the plan, not the article. If an article genuinely does not apply, write "N/A" and why.
- Name real versions in External dependencies, and the cost of each (Article 3 means the answer is
  normally "free tier" or "none" — say so explicitly).
- Write out the data contracts that cross a package boundary, and where the shared schema lives
  (Article 5).
- Rejected alternatives is not optional: it is what stops the next session re-proposing them.

## After writing

Report the path, the approach in two sentences, and any constitution article that needed care.
Do not write tasks — that is `/tasks`.
