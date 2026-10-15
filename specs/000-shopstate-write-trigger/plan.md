# Plan: ShopState write trigger

- **Spec:** `./spec.md` (status: ready)
- **Status:** approved

## Chosen approach

Answer the question by observation, in increasing order of cost and risk, and stop at the first
experiment that settles it. The whole spike is file timestamps and JSON field comparisons around
manual game sessions — no automation is built, because what the automation needs to do is exactly
what is being determined.

Cheap and safe first (E1–E4: launch the game by hand, watch the files), and the one risky avenue
last and gated (E5: the game's own shop endpoint, only on an explicit yes from the user). This
ordering matters: E5 would make verdict C painless, but it is an unofficial API used with the
user's own account, so it is not something to try speculatively while a free observation might
make it unnecessary.

The user drives the game; the observations are scripted so the two sessions are compared the same
way and nothing is eyeballed.

## Constitution check

| Article | Holds? | Note |
| --- | --- | --- |
| 1 — Spec before code | Yes | `spec.md` written and marked ready before this plan. |
| 2 — JSON is the only source of truth | Yes | The spike exists precisely to keep the JSON path viable instead of falling back to screen reading. |
| 3 — Zero recurring cost | Yes | No services involved. |
| 4 — Collector never writes to game files | Yes | Every read copies to `snapshots/` first; nothing under `Second Dinner` is written. NF01. |
| 5 — Contract first | N/A | The spike produces no payload crossing a boundary. |
| 6 — Traceability | Yes | Tasks cite `S01`–`S06`. |
| 7 — Runnable without waiting on the house | Yes | Each experiment is a few minutes of hand-driven play; no waiting for an 8-hour rotation. |
| 8 — Secrets never land in the repo | Yes | `snapshots/` is git-ignored; `findings.md` quotes timestamps and card ids only, never account ids or tokens. |

## Components and data flow

One throwaway script plus two manual sessions:

1. `scripts/observe.mjs` — copies the whole of `States/nvprod/` into
   `specs/000-shopstate-write-trigger/snapshots/<label>/`, then prints a summary line per file
   (mtime, size, sha256) and the four baseline values from `ShopState.json`.
2. The user launches and quits the game; the script runs before and after each session.
3. A compare mode diffs two snapshot labels and prints which files changed.

The script is deliberately standalone and dependency-free — it is not part of the product and gets
deleted or moved when feature 001 starts.

## Data contracts

None crossing a boundary. The snapshot directory layout is internal to this spike:

```
snapshots/<label>/manifest.json   { takenAt, files: [{ path, mtimeMs, size, sha256 }] }
snapshots/<label>/nvprod/*.json   verbatim copies
```

## External dependencies

| Dependency | Version | Why this one | Cost |
| --- | --- | --- | --- |
| Node | 24.20 (installed) | Already present; stdlib `fs` and `crypto` cover the whole script | none |

Nothing else. No npm packages — the script uses only the standard library, so the spike needs no
`package.json` and leaves no install behind.

## Risks and fallbacks

| Risk | Likelihood | If it happens |
| --- | --- | --- |
| The shop has not rotated between the two sessions, so "unchanged" is ambiguous | Medium | Compare `TimeUpdated` and `NextRefresh` against the wall clock: if `NextRefresh` is in the past and the file still shows it, the file is stale regardless of rotation. Re-run E1 after a known rotation boundary if still ambiguous. |
| The game holds the file open and the copy is torn | Low | `sha256` twice with a second between; a differing hash means a write in progress, so re-copy. |
| The game writes only on a clean quit, and the collector would have to quit it too | Medium | This is exactly S04/Q02; the finding feeds RF02 and RF10 rather than blocking. |
| Verdict C and the user declines Q01 | Medium | Feature 001 proceeds with UI automation, scoped and isolated behind one module so its fragility is contained. |

## Rejected alternatives

- **Skip the spike, assume verdict C, build UI automation.** Rejected: it is the most expensive and
  most fragile branch, and two manual game sessions are enough to avoid it if A or B holds.
- **Watch the file with a long-running `fs.watch` for 24 hours instead of hand-driven sessions.**
  Rejected: it cannot distinguish "the game refreshed it" from "the user opened the shop", which is
  the whole question. It is also 24 hours of waiting against Article 7.
- **Read `shop_runtime_url` first because it is the cleanest answer.** Rejected as an opening move:
  it is unofficial-API territory on the user's own account, so it needs their explicit consent and
  only earns its risk if the free observations fail.
