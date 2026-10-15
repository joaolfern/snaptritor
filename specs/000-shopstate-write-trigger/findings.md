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

Session: launched the game, navigated to Shop → Cards, let it load normally (no errors, no
offline indicator, logged into the normal online account), quit cleanly. Confirmed closed via
`tasklist.exe` before snapshotting.

| Value | Before | After | Moved? |
| --- | --- | --- | --- |
| `ShopState.json` file mtime | `2026-05-14T01:34:36.224Z` | `2026-05-14T01:34:36.224Z` | **No** |
| `CardShopModuleLog.TimeUpdated` | `2026-05-14T01:30:10.878Z` | `2026-05-14T01:30:10.878Z` | **No** |
| `ShopState.json` content hash | — | — | **Unchanged** (identical to both baseline and E1) |

11 other files changed (a real session happened — `AccountState.json`, `AnalyticState.json`,
`BrazeSdkManagerState.json`, `ClanState.json`, `CollectionState.json`, `ShopClientState.json`,
`TimeClientState.json`, plus overlap with E1's list), but `ShopState.json` itself is still
byte-for-byte identical to the May baseline.

A delayed recheck (`e2-recheck-delayed`, taken minutes later with no further game activity) shows
**no change either** — ruling out an asynchronous or deferred write.

### The critical discrepancy

What the on-screen Shop → Cards actually showed: **Karen Page, Miek, a Gamora variant, a Silk
variant.** What `ShopState.json`'s `MyCardsShopModule` still holds: **Punisher War Machine, Karen
Page, Web Sling, an Elsa Bloodstone variant, a Jeff the Baby Land Shark variant.** Only "Karen
Page" overlaps, and that is plausibly coincidental rather than meaningful (`CollectionState.json`
and other pools reference Karen Page independently of the shop).

This means the live client is rendering shop data from *somewhere* that is not this file, and is
not writing what it rendered back to this file either — not on view, not on quit, not minutes
later. The three verdicts the spec anticipated (A: auto-refreshes, B: refreshes on launch, C:
refreshes on shop view) are **all ruled out**. `ShopState.json`'s `CardShopModules` tree appears to
be a cache that simply is not being kept current by ordinary play, for reasons this spike has not
yet identified.

## E4 — cheaper signal

A targeted search for the on-screen cards (`Miek`, `Gamora`, `Silk`) across every snapshot found
them only in `CharacterMasteryState.json`, `CollectionState.json`, `ProfileState.json`,
`RewardState.json` and (incidentally, in unrelated bundle/variant-pool data) `ShopState.json` — not
as a current rotation anywhere. No file in `States/nvprod/` was found holding the live 4-card set
actually shown on screen. If a local mirror of the live offer exists at all, it is not among these
36 files, or it is written somewhere this spike has not looked yet.

## Verdict

**Not A, B, or C.** None of the three anticipated write triggers held, even combined with a
delayed recheck. The evidence points at one of two explanations, not yet distinguished:

1. **A different, undiscovered local trigger** writes this file — something beyond launching and
   viewing the shop (e.g. actually tapping into a card's detail/purchase flow, a longer dwell, a
   specific exit path, or a periodic background sync on its own schedule unrelated to play).
2. **The live shop is served directly from the network at render time** (`shop_runtime_url` in
   `service-discovery.json` is the obvious candidate) and `ShopState.json`'s `CardShopModules` tree
   is a stale cache that ordinary play does not refresh at all — meaning Article 2's "read JSON,
   never touch the network" premise may not hold for this specific data, and the project's
   approach needs reconsidering for the card-shop feature specifically.

Both possibilities need the user's input before continuing — see the open question raised with
them.
