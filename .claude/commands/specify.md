---
description: Create a new feature spec (WHAT and WHY) from a description
argument-hint: <short description of the feature>
---

Create a new feature specification for: **$ARGUMENTS**

This is stage 1 of 4 in Snaptritor's spec-driven loop (`/specify` → `/plan` → `/tasks` → `/implement`).

## Before writing

1. Read `.specify/memory/constitution.md`. It constrains what may be specified at all.
2. Read `.specify/templates/spec-template.md` — the output follows it exactly.
3. `ls specs/` to find the highest existing number; the new feature is the next one, zero-padded
   (`003-slug`). Derive the slug from the description: lowercase, hyphenated, three words or fewer.
4. Skim the existing specs for overlap. If this description is really a change to an existing
   feature, say so and amend that spec instead of creating a new one.

## Writing the spec

Write `specs/NNN-slug/spec.md` from the template.

- **WHAT and WHY only.** No library names, no file paths, no API shapes, no package layout.
  Those are `/plan`'s decisions and putting them here freezes them before they are reasoned about.
- Every functional requirement is one testable statement with an `RF` ID, and every `RF` gets an
  acceptance criterion in Given/When/Then form. A requirement nobody can check is not a requirement.
- **Do not invent what you do not know.** Anything the description leaves genuinely ambiguous — and
  that would change the design — goes in the Open questions table with the decision it blocks.
  Prefer asking the user directly (AskUserQuestion) for anything that blocks the whole spec.
- Non-goals are mandatory. Name what this feature will not do, so scope can be defended later.
- Set `Status: draft`. It becomes `ready` only once Open questions no longer block the design.

## After writing

Report, in a few lines: the path written, the requirement IDs created, and any open question that
needs the user. Do not start planning — that is `/plan`.
