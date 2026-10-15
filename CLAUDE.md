# Snaptritor

Marvel Snap card-shop rotation notifier. The game's card shop rotates every 8 hours; opening the app
just to look is slow, so Snaptritor reads the rotation from the game's local state file on the PC and
sends a Web Push notification when it changes.

Stakeholder-facing requirements live in the shared doc
[Notificador de Loja do Marvel Snap](https://claude.ai/code/artifact/8f3c8a0e-8be1-4cd6-804b-536abe9155b2)
(Portuguese). It is kept updated, not replaced. The repo's specs are the engineering source of truth.

## Spec-driven development is mandatory here

Read `.specify/memory/constitution.md` before planning or writing anything. Its eight articles
outrank convenience.

The loop, in order — skipping a stage is not allowed:

| Stage | Command | Output |
| --- | --- | --- |
| 1 | `/specify <description>` | `specs/NNN-slug/spec.md` — WHAT and WHY, no technology |
| 2 | `/plan` | `specs/NNN-slug/plan.md` — HOW, with an explicit constitution check |
| 3 | `/tasks` | `specs/NNN-slug/tasks.md` — ordered, each with a real verify command |
| 4 | `/implement` | code, with each task verified before it is checked off |

No source file is written for a feature with no `spec.md`. If reality contradicts a spec during
implementation, the spec gets corrected in the same pass.

## Environment facts (validated — do not re-derive)

- WSL2 on Windows. Node 24.20, pnpm 11.25. `wrangler` and `gh` are **not** installed; `uv` is not either.
- Game state root: `/mnt/c/Users/joaoa/AppData/LocalLow/Second Dinner/SNAP/`
- All these JSON files are **UTF-8 with BOM**. In Node, strip it before `JSON.parse`
  (`text.replace(/^﻿/, '')`); in Python use `encoding='utf-8-sig'`.
- Game files are read-only to us (Article 4): copy, then parse the copy.
- Raw state snapshots are personal data and are git-ignored. Keep them out of commits and the doc.

### `ShopState.json` does NOT reflect the live shop — do not read it for card data

`SNAP/Standalone/States/nvprod/ShopState.json` (~240 KB) looks exactly like what you'd want: a
`ServerState.CardShopModules[]` tree with each item's `RewardData.Card.CardDefId`, `CurrencyCost`,
`Purchased`, `NextRefresh`, etc. **It is stale and stays stale.** Feature `000`'s spike (full
account in `specs/000-shopstate-write-trigger/findings.md`) tested every path a normal player would
take — launching to the menu, launching and opening Shop → Cards, waiting minutes afterward — and
none of them touched this file. A session where the on-screen shop clearly showed different cards
(confirmed by the user) still left the file byte-for-byte identical to a five-month-old baseline.
No other file under `States/nvprod/` was found holding the live offer either.

**Decision: the project does not read any local file for shop content.** The collector brings
Shop → Cards into view (by driving the game's UI — RF02) and captures a screenshot of it (RF03),
forwarded undecoded (constitution Article 2, revised). There is no JSON parsing step for the shop
left to design. If a future session is tempted to go back to `CardShopModules` because the schema
looks so convenient — don't; that convenience is exactly what made this take a full spike to rule
out.

The two files below are superseded by that decision but kept here for context, since the shared
doc and early commits still reference them:

- `SNAP/nvprod/data-patch.json` (~1.3 MB) — card definitions; would have been the source of display
  names under the old JSON-reading design. Not needed now that RF09 shows the raw screenshot.
- `SNAP/nvprod/service-discovery.json` — `EnvironmentAttributes.shop_runtime_url`. The one path
  this spike did *not* test (querying it directly) — unofficial-API territory on the user's own
  account, never pursued because screenshots solved the problem first.

## Delivery: the collector ships as an installed Windows app, not a WSL script

The user's requirement (2026-10-15): the final collector is a single Windows installer (`.exe`).
Once installed, it runs its own schedule unattended — no WSL, no terminal, no Claude Code session —
and shows a small window with the last/next inspection time plus two independent controls: pause
inspection, and pause the automation that wakes the PC. This is captured as RF11–RF15 in
`specs/001-shop-rotation-notifier/spec.md`; read that before touching the collector's design.

This changes where WSL sits in the picture: **WSL is the development and experimentation
environment only.** Everything validated above (the `/mnt/c` paths, the BOM, the parsing traps) was
learned from WSL because that is where this Claude Code session runs, and feature `000`'s spike
still runs its experiments from WSL for the same reason. But the shipped collector reads those same
paths as a native Windows process, directly, with no WSL in between. Do not design the production
collector as something WSL invokes — the packaging technology (Electron, Tauri, .NET, …) is a
decision for `plan.md`, not for this file.

One consequence worth noting early: a native Windows app can ask the OS's own Task Scheduler to
wake the machine for a scheduled task, which may remove the need for an externally-sent
Wake-on-LAN packet entirely (nothing in the original doc ever named what would send one). This is
flagged as Open Question Q06 in the `001` spec rather than decided here.

## Conventions

- Specs, code, comments and commit messages in English. The shared doc stays Portuguese.
- `packages/*` is a pnpm workspace: `shared` (contracts), `collector` (the installed Windows app),
  `worker` (Cloudflare), `client` (PWA/TWA). Packages are created when a task calls for them, not
  in advance.
