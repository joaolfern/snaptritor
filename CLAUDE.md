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

### Where the shop rotation lives

`SNAP/Standalone/States/nvprod/ShopState.json` (~240 KB):

- `ServerState.CardShopModules[]` — 5 modules. The card rotation is `MyCardsShopModule`; each module
  carries `CardShopDefConstants.RefreshIntervalHours: 8` and `NextRefresh`.
- `…CardShopModules[].Items[]` — per item: `DefId`, `ItemType` (`PreRolledSingleCard` | `SeriesPack` |
  `CurrencyPack`), `RewardData.Card.CardDefId` (e.g. `"KarenPage"`), optional
  `RewardData.Card.ArtVariantDefId`, `CurrencyTypeId` (`CollectorsTokens`), `CurrencyCost` (e.g. `6000`),
  `Purchased`, `NextRefresh`, `IsFreezable`.
- `ServerState.CardShopModuleLog.OfferedCardDefIds[]` — the current offered set, as
  `{Item1: cardDefId, Item2?: artVariantDefId}` tuples, with `TimeUpdated`. It spans modules, so it
  is not identical to any single module's items.

Two parsing traps, both confirmed on the live file:

- An item that has already been **purchased** drops its `RewardData` entirely — read
  `RewardData?.Card?.CardDefId` defensively, and treat a purchased item as "no card on offer"
  rather than a parse failure.
- `MyCardsShopModule` also carries `SpotlightVariantCardShopItem`, so its item list is 5 long and
  mixes plain cards with art variants. Keyed diffs must include `ArtVariantDefId`.

Related files worth knowing:

- `SNAP/nvprod/data-patch.json` (~1.3 MB) — card definitions; the likely source of display names.
- `SNAP/nvprod/service-discovery.json` — `EnvironmentAttributes.shop_runtime_url`. Unofficial API
  territory; see `specs/000-shopstate-write-trigger/spec.md` before going near it.
- `ShopClientState.json` — client-side "seen" lists only. Not the rotation.

### The open risk

`ShopState.json` appears to be rewritten only when the Shop screen is actually opened in-game
(it was last written months before the most recent play session, while every other state file was
current). Feature `000-shopstate-write-trigger` exists to settle this; the collector's design
depends on the answer, so do not design around a guess.

## Conventions

- Specs, code, comments and commit messages in English. The shared doc stays Portuguese.
- `packages/*` is a pnpm workspace: `shared` (contracts), `collector` (WSL), `worker` (Cloudflare),
  `client` (PWA/TWA). Packages are created when a task calls for them, not in advance.
