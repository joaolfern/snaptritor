# Spec: ShopState write trigger

- **ID:** `000-shopstate-write-trigger`
- **Status:** implemented — see `findings.md`. The spike concluded with a pivot (screenshot capture, no JSON extraction) rather than one of the three verdicts it anticipated.
- **Source:** item **T02** of the shared doc, and its open thread asking whether to simulate
  in-game clicks or look for another way to force the refresh first. The answer chosen was:
  investigate first.

> This is a spike, not a product feature. Its deliverable is a decision recorded in `findings.md`,
> and the decision constrains feature `001`. No shipping code comes out of it.

## Problem

Snaptritor reads the card rotation from `ShopState.json`. That only works if the file is actually
current when the collector reads it. The evidence says it may not be: on the development machine the
file was last written **2026-05-13 22:34**, while every other file in `States/nvprod/` was rewritten
in the **2026-09-26 18:37** session. The game was launched in September and the shop state was not
touched — which suggests the game fetches and persists shop state only when the player navigates to
the Shop screen.

If that is true, the collector cannot be a pure file reader. It has to make the game open its own
shop first, which means UI automation: slow, fragile, and broken by any layout change. That is the
single most expensive unknown in the whole design, and feature `001`'s collector cannot be planned
around a guess.

## Goals

- A yes/no answer, backed by observed timestamps, to: **does `ShopState.json` refresh without the
  Shop screen being opened?**
- If no: the cheapest known way to make it refresh, and how long that takes.
- A written constraint that feature `001`'s plan can be built on.

## Non-goals

- Building any part of the collector. No parser, no diff, no scheduler.
- Automating the game's UI. The spike only learns whether automation is needed.
- Modifying the game, its files or its install in any way (Article 4).

## User scenarios

1. **Given** the game has not been launched today, **when** the collector reads `ShopState.json`,
   **then** either it holds the current rotation (best case) or it holds a stale one (the case this
   spike exists to detect).

## Functional requirements

| ID | Requirement |
| --- | --- |
| S01 | Record a reproducible baseline of `ShopState.json`: file mtime, `CardShopModuleLog.TimeUpdated`, `MyCardsShopModule.NextRefresh`, and the offered card set. |
| S02 | Determine whether launching the game to the main menu alone updates `ShopState.json`. |
| S03 | Determine whether opening Shop → Cards updates `ShopState.json`. |
| S04 | Determine when the write happens — on fetch while the game runs, or only on quit — and how long after launch. |
| S05 | Determine whether any smaller or more cheaply-refreshed file in `States/nvprod/` also carries the rotation, or a marker that it changed. |
| S06 | Record the verdict and its consequence for feature `001` in `findings.md`. |

## Non-functional requirements

| ID | Constraint | Why |
| --- | --- | --- |
| NF01 | Every observation is read-only against the game's files. | Article 4 |
| NF02 | Snapshots taken during the spike stay out of version control. | Article 8 — they are personal account data |
| NF03 | No request is sent to any Second Dinner service during S01–S05. | Keeps the cheap experiments free of ToS risk; see Open questions |

## Acceptance criteria

- **S01** — A baseline file exists under `snapshots/` (git-ignored) and the four baseline values are
  quoted in `findings.md`.
- **S02** — `findings.md` states the mtime and `TimeUpdated` before and after a menu-only session,
  and whether they moved.
- **S03** — Same, for a session where Shop → Cards was opened.
- **S04** — `findings.md` gives the observed delay between game launch and the write, or states that
  the write happened only at quit.
- **S05** — A diff of `States/nvprod/` across the two sessions is summarised: which files changed,
  and whether any of them carries rotation data.
- **S06** — `findings.md` ends with one of the three verdicts below and the constraint it imposes.

### The three possible verdicts

| Verdict | Consequence for feature 001 |
| --- | --- |
| **A — refreshes on its own** | The collector is a pure file reader. No game launch, no UI automation. RF02 drops from the spec. |
| **B — refreshes on launch, without the Shop screen** | The collector launches the game, waits for the write, reads, quits. No UI automation. RF02 shrinks to "launch and wait". |
| **C — refreshes only when the Shop screen is opened** | The collector needs UI automation, and feature 001's plan must pick a mechanism and accept its fragility. The doc's second open *pendência* becomes live. |

## Open questions

| ID | Question | Blocks | Owner |
| --- | --- | --- | --- |
| Q01 | If verdict C holds, is querying `shop_runtime_url` (`https://shop.shop-prod.snapgametech.com`) directly with the account's own session token acceptable? It would avoid UI automation entirely, but it is an unofficial API and carries Second Dinner ToS exposure on the user's own account. | Whether experiment E5 is ever run, and whether 001 needs UI automation at all | user |
| Q02 | Does the game write `ShopState.json` while running, or buffer it to quit? | How long the collector must keep the game open (RF02, RF10) | settled by S04 |
