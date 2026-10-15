# Tasks: ShopState write trigger

- **Spec:** `./spec.md` · **Plan:** `./plan.md`

## Coverage check

| Requirement | Tasks |
| --- | --- |
| S01 | T001, T002 |
| S02 | T003, T004 |
| S03 | T005, T006 |
| S04 | T006 |
| S05 | T007 |
| S06 | T008 |

No orphans: every task above serves a listed requirement.

## Tasks

### T001 — Write the observation script

- **Serves:** S01
- **Files:** `scripts/observe.mjs` (new)
- **Do:** A dependency-free Node script with two modes.
  `node scripts/observe.mjs snap <label>` copies every file in
  `/mnt/c/Users/joaoa/AppData/LocalLow/Second Dinner/SNAP/Standalone/States/nvprod/` into
  `specs/000-shopstate-write-trigger/snapshots/<label>/nvprod/`, writes a `manifest.json`
  (`takenAt`, and per file `path`, `mtimeMs`, `size`, `sha256`), and prints the four baseline values
  from `ShopState.json`: file mtime, `ServerState.CardShopModuleLog.TimeUpdated`,
  `MyCardsShopModule.NextRefresh`, and the offered card set.
  `node scripts/observe.mjs diff <labelA> <labelB>` prints each file whose sha256 or mtime moved,
  and highlights `ShopState.json` specifically.
  Read-only toward the game (Article 4): copy first, parse the copy. Strip the UTF-8 BOM before
  `JSON.parse`. Hash twice a second apart and re-copy on mismatch (torn-write guard from the plan).
- **Verify:** `node scripts/observe.mjs snap smoke` exits 0, prints the offered card set
  (currently `PunisherWarMachine, KarenPage, WebSling, ElsaBloodstone (ElsaBloodstone_05),
  JeffTheBabyLandShark (JeffTheBabyLandShark_08)`), and `snapshots/smoke/manifest.json` lists
  36 files. Confirm `git status` shows nothing under `snapshots/`.
- **Status:** `[x]` — ran clean; 36 files matches the source directory exactly, `git status` shows
  nothing under `snapshots/`. Smoke snapshot deleted afterward.

### T002 — Take the baseline, game closed

- **Serves:** S01
- **Files:** `snapshots/baseline/` (git-ignored)
- **Do:** With Marvel Snap **not** running, `node scripts/observe.mjs snap baseline`. Record the four
  values in `findings.md` under "Baseline".
- **Verify:** `snapshots/baseline/manifest.json` exists and `findings.md` quotes the four values.
- **Status:** `[x]` — game confirmed closed via `tasklist.exe` immediately before the snapshot.
  `NextRefresh` reads `2026-05-14T03:00:00Z`, five months in the past, already strong evidence of a
  stale file. See `findings.md`.

### T003 — Checkpoint: menu-only session (needs the user)

- **Serves:** S02
- **Files:** none
- **Do:** Ask the user to launch Marvel Snap, stay on the main menu for ~2 minutes, **not** open the
  Shop, and quit cleanly. Tell them when to start and wait for confirmation that the game has fully
  exited.
- **Verify:** The user confirms. Note the start and end times in `findings.md`.
- **Status:** `[x]` — user confirmed: launched, stayed on main menu, no navigation, quit cleanly.

### T004 — Observe after the menu-only session

- **Serves:** S02
- **Files:** `snapshots/e1-menu-only/` (git-ignored)
- **Do:** `node scripts/observe.mjs snap e1-menu-only`, then
  `node scripts/observe.mjs diff baseline e1-menu-only`. Record whether `ShopState.json`'s mtime
  and `TimeUpdated` moved.
- **Verify:** `findings.md` states before/after for both values and a yes/no on whether it changed.
  If it changed, verdict **A or B** is live and T005 confirms which.
- **Status:** `[x]` — unchanged. `ShopState.json` mtime and `TimeUpdated` identical to baseline;
  content hash identical. 12 other state files did change, confirming the session was real.
  Verdict A ruled out. See `findings.md`.

### T005 — Checkpoint: shop-opened session (needs the user)

- **Serves:** S03
- **Files:** none
- **Do:** Ask the user to launch the game, go to Shop → Cards, let it load, then quit cleanly.
- **Verify:** The user confirms, with the approximate time the Shop screen finished loading.
- **Status:** `[x]` — user confirmed: loaded normally, logged into the normal online account,
  on-screen cards (Karen Page, Miek, Gamora variant, Silk variant) captured for comparison.

### T006 — Observe during and after the shop-opened session

- **Serves:** S03, S04
- **Files:** `snapshots/e2-shop-*/` (git-ignored)
- **Do:** While the game from T005 is running, snapshot every 30 s with incrementing labels
  (`e2-shop-t030`, `-t060`, …) until the user quits, then take `e2-shop-final`. Diff the sequence to
  find the first snapshot in which `ShopState.json` changed, and whether it changed before or only
  after the quit.
- **Verify:** `findings.md` names the first changed snapshot and the elapsed seconds from launch, or
  states that the only change appeared in `e2-shop-final` (write-on-quit — settles Q02).
- **Status:** `[x]` — modified: a single post-quit snapshot plus a delayed recheck were sufficient,
  since both show **zero change** to `ShopState.json` at all — there is no write to time. The
  on-screen shop (Karen Page, Miek, Gamora variant, Silk variant) does not match the file's stale
  content (Punisher War Machine, Karen Page, Web Sling, Elsa Bloodstone variant, Jeff the Baby
  Land Shark variant), so Q02 is moot: there is no observed write-on-quit to date either. See
  `findings.md`.

### T007 — Look for a cheaper signal

- **Serves:** S05
- **Files:** none
- **Do:** From the diffs already collected, list every file in `States/nvprod/` that changed in the
  menu-only session. For each, check whether it carries rotation data or a marker that the shop
  changed — in particular `ShopClientState.json`, `TimeModelState.json` and `CommandIndexState.json`.
- **Verify:** `findings.md` has a table of changed files with a yes/no on rotation data, and a
  one-line conclusion on whether a cheaper signal exists.
- **Status:** `[ ]`

### T008 — Write the verdict

- **Serves:** S06
- **Files:** `findings.md` (new)
- **Do:** Close `findings.md` with verdict **A**, **B** or **C** from `spec.md`, the evidence for it,
  and the constraint it places on feature `001` (which of RF02/RF10 survive, and in what form).
  If the verdict is **C**, put Q01 to the user explicitly — direct `shop_runtime_url` access versus
  UI automation — and record their answer before `001`'s plan is written.
  Set `spec.md` status to `implemented`. Update **T02** in the shared doc with the verdict.
- **Verify:** `findings.md` ends with a named verdict and a stated consequence. Feature `001`'s
  `plan.md` can be written without re-opening the question.
- **Status:** `[ ]`

### E5 — Direct shop endpoint (gated, not scheduled)

- **Serves:** Q01
- **Files:** none yet
- **Do:** **Not to be run** unless T004–T007 yield verdict C *and* the user answers Q01 with an
  explicit yes. It would query `EnvironmentAttributes.shop_runtime_url` from
  `SNAP/nvprod/service-discovery.json` using the account's own session material to read the user's
  own shop. It is an unofficial API: it can break without notice and carries Second Dinner ToS
  exposure on the user's account.
- **Verify:** n/a until unblocked.
- **Status:** `[-]` blocked on Q01 — deliberately unscheduled
