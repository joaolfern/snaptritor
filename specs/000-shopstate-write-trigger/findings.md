# Findings: ShopState write trigger

- **Spec:** `./spec.md` · **Plan:** `./plan.md` · **Tasks:** `./tasks.md`

## Baseline (T002)

Taken 2026-10-15, game confirmed **not running** (`tasklist.exe` showed no matching process
immediately before the snapshot):

| Value | Reading |
| --- | --- |
| `ShopState.json` file mtime | `2026-05-14T01:34:36.224Z` |
| `ServerState.CardShopModuleLog.TimeUpdated` | `2026-05-14T01:30:10.878Z` |
| `MyCardsShopModule.NextRefresh` | `2026-05-14T03:00:00Z` (every 8h) |
| Offered set | `PunisherWarMachine, KarenPage, WebSling, ElsaBloodstone (ElsaBloodstone_05), JeffTheBabyLandShark (JeffTheBabyLandShark_08)` |

`NextRefresh` is **2026-05-14T03:00:00Z — five months in the past** relative to today (2026-10-15).
That alone is strong evidence the file is stale: if the game had refreshed the shop on any ordinary
launch since May, this value would have advanced by multiples of 8 hours. It has not moved since at
least the last session recorded in this baseline.

36 files captured, matching the 36 files present in
`.../SNAP/Standalone/States/nvprod/` directly.

## E1 — menu-only session

Session: launched the game, stayed on the main menu, **no navigation performed**, quit cleanly.
Confirmed closed via `tasklist.exe` before snapshotting.

| Value | Before | After | Moved? |
| --- | --- | --- | --- |
| `ShopState.json` file mtime | `2026-05-14T01:34:36.224Z` | `2026-05-14T01:34:36.224Z` | **No** |
| `CardShopModuleLog.TimeUpdated` | `2026-05-14T01:30:10.878Z` | `2026-05-14T01:30:10.878Z` | **No** |
| `ShopState.json` content hash | — | — | **Unchanged** (`diff baseline e1-menu-only` reports identical) |

The session is confirmed real — the diff shows 12 other files changed in `States/nvprod/`
(`AccountState.json`, `AnalyticState.json`, `BattlePassClientState.json`,
`BrazeSdkManagerState.json`, `CharacterMasteryState.json`, `ClanState.json`,
`CollectionState.json`, `CustomGameManagerState.json`, `GameState.json`, `SchemaState.json`,
`ShopClientState.json`, `TimeClientState.json`) — but `ShopState.json` is byte-for-byte identical
to the baseline, not even its mtime moved.

**This settles S02: launching the game to the menu, with no shop navigation, does not refresh
`ShopState.json`.** Verdict A (refreshes on its own) is ruled out. The remaining question is
whether launch alone is enough with more time, or whether the Shop screen specifically must be
opened (verdict B vs C) — that is E2/E3, `tasks.md` T005–T006.

`ShopClientState.json` changed in this session despite no shop visit — worth a closer look under
S05 (T007), since it is the one shop-adjacent file that moved without the shop being opened.

## E2 / E3 — shop-opened session

*Pending — needs the user to open Shop → Cards, then quit, per `tasks.md` T005.*

## E4 — cheaper signal

*Pending — depends on E1/E2's diffs, per `tasks.md` T007.*

## Verdict

*Not yet determined — pending T003–T007.*
