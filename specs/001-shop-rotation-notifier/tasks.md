# Tasks: Shop rotation notifier

- **Spec:** `./spec.md` · **Plan:** `./plan.md`

Executed in order unless marked `[parallel-safe]`. A task is checked off only when its
verification step has actually been run and passed — not when the code looks right.

Tasks T001–T006 need only WSL/Node — no Windows GUI. T007–T013 need the native Windows automation
to actually run, which is available here via WSL→Windows interop (`powershell.exe`/`node.exe`
against the repo's own UNC path) and, for T009, the real game. T016–T018 are checkpoints that need
the user directly (a Cloudflare account, the physical PC's BIOS, an Android device). T019 (added
2026-10-15, after T001–T011 were already built — the user's install-flow requirement) is
WSL/Node-only like T001–T006; it lands out of numeric order because it follows from T014–T016's
client/deployment work rather than the original build order. T020 (added 2026-10-15, after T016's
deployment) needs the same WSL→Windows interop as T007–T013 for the installer build, plus a
GitHub account/token for publishing — not a pure checkpoint like T016–T018, since most of it is
real code, but it still needed the user to install/authorize the `gh` CLI once.

## Coverage check

| Requirement | Tasks |
| --- | --- |
| RF01 | T011, T018 |
| RF02 | T007, T008, T009, T010 |
| RF03 | T007, T010 |
| RF04 | T001, T010 |
| RF05 | T004, T010 |
| RF06 | T001, T003, T004, T010, T016 |
| RF07 | T005, T016 |
| RF08 | T003, T014, T015, T017 |
| RF09 | T006, T014, T015, T017 |
| RF10 | T010 |
| RF11 | T013 |
| RF12 | T011 |
| RF13 | T002, T012 |
| RF14 | T002, T012 |
| RF15 | T002, T011, T012 |
| RF16 | T015, T019 |
| RF17 | T015, T019 |
| RF18 | T012, T013, T019 |
| RF19 | T020 |

No orphans: every task below cites at least one requirement it serves.

## Tasks

### T001 — `packages/shared`: contracts and the change-detection hash

- **Serves:** RF04, RF06, RF08, Article 5, NF02
- **Files:** `packages/shared/package.json`, `packages/shared/src/schemas.ts`,
  `packages/shared/src/imageHash.ts`, `packages/shared/src/index.ts`,
  `packages/shared/src/imageHash.test.ts`, `packages/shared/src/schemas.test.ts` (all new)
- **Do:** Create the workspace package. `schemas.ts` exports the three Zod schemas from
  `plan.md`'s Data contracts section verbatim: `InspectionSubmission`, `PushSubscriptionRecord`,
  `CollectorState`. `imageHash.ts` exports a pure `perceptualHash(pixels: Uint8ClampedArray, width:
  number, height: number): string` (downscale to a small grid, grayscale, average-hash) and
  `hammingDistance(a: string, b: string): number` — arithmetic only, no model, matching Article 2's
  "measurement, not interpretation" carve-out.
- **Verify:** `pnpm --filter shared test` — a vitest suite asserting: two near-identical synthetic
  images hash within a small Hamming distance of each other; two very different synthetic images
  hash far apart; `CollectorState.parse({})` fails (fields are required or explicitly `.nullable()`,
  never silently defaulted). Exits 0 with all assertions passing.
- **Status:** `[x]` — `pnpm --filter @snaptritor/shared test`: 13/13 passed (8 schema tests +
  5 hash tests); `typecheck`: clean.

### T002 — `packages/collector`: state persistence and pure scheduling/pause logic

- **Serves:** RF13, RF14, RF15, NF06
- **Files:** `packages/collector/package.json`, `packages/collector/src/state.ts`,
  `packages/collector/src/state.test.ts` (all new)
- **Do:** `state.ts` exports `readState(path)` / `writeState(path, state)` (JSON file,
  `CollectorState` from T001, created with sane defaults if absent) and pure functions
  `shouldRunInspection(state)` (false when `inspectionPaused`) and `recordError(state, message)`
  (sets `lastError`, satisfying NF06). No file I/O inside the pure functions — they take and return
  a `CollectorState` value, so they're testable with no disk at all.
- **Verify:** `pnpm --filter collector test` — asserts `shouldRunInspection` respects the pause
  flag, `recordError` sets `lastError` without touching unrelated fields, and a round-trip
  `writeState` → `readState` returns an equal object (using a temp file under the OS tmp dir, Node
  `os.tmpdir()` — not the repo, not game files).
- **Status:** `[x]` — `pnpm --filter @snaptritor/collector test`: 7/7 passed; `typecheck`: clean.
  (Added `recordInspection` beyond the task's literal list — the natural counterpart to
  `recordError` that T010 needs for a successful run; same file, same pure-function shape.)

### T003 — `packages/worker`: scaffold and `POST /subscriptions`

- **Serves:** RF08, RF06
- **Files:** `packages/worker/package.json`, `packages/worker/wrangler.toml`,
  `packages/worker/src/index.ts`, `packages/worker/src/subscriptions.ts`,
  `packages/worker/test/subscriptions.test.ts` (all new)
- **Do:** A minimal fetch-handler router (no framework needed for three routes). `wrangler.toml`
  declares a KV namespace binding `SUBSCRIPTIONS` and an R2 bucket binding `SHOP_IMAGES` (bucket
  names can be placeholders; real ones are created in T016). `POST /subscriptions` validates the
  body against `PushSubscriptionRecord` (T001) and writes it to KV keyed by `endpoint`.
- **Verify:** `pnpm --filter worker test` using `@cloudflare/vitest-pool-workers` (runs the real
  Workers runtime locally, no deployment, no Windows needed) — a valid subscription POST returns
  `201` and a later KV read returns it unchanged; an invalid body (fails `PushSubscriptionRecord`)
  returns `400` and nothing is written.
- **Status:** `[x]` — `pnpm --filter @snaptritor/worker test`: 4/4 passed (runs the real Workers
  runtime via vitest-pool-workers, no deployment); `typecheck`: clean. Needed two fixes beyond
  the task's literal description: `test/env.d.ts` to type `cloudflare:test`'s `env` against our
  own `Env` interface, and a third `_ctx: ExecutionContext` parameter on `fetch` so its inferred
  type matches `ExportedHandler`'s real signature under `satisfies` (which keeps the literal
  function's arity rather than widening it).

### T004 — `packages/worker`: `POST /inspections` `[parallel-safe with T005, T006]`

- **Serves:** RF05, RF06, NF06, NF08
- **Files:** `packages/worker/src/inspections.ts`,
  `packages/worker/test/inspections.test.ts` (new); `src/index.ts` (routes added)
- **Do:** Reads a shared-secret header (the build-time secret from `plan.md`'s Article 8 note) and
  rejects `401` if it doesn't match `env.COLLECTOR_SECRET`. Validates the JSON part of the body
  against `InspectionSubmission`; stores the image bytes in R2 under a timestamp-based key, the
  metadata (+ the R2 key) in KV. Returns `201` with the R2 object's public URL — this is the URL
  NF08 says the push payload carries.
- **Verify:** `pnpm --filter worker test` — a correctly authed, valid submission returns `201` with
  a URL; a bad secret returns `401` and nothing is stored; an invalid body returns `400`.
- **Status:** `[x]` — 6/6 tests in `inspections.test.ts` pass (part of the 17/17 full-suite run
  below). Also added `handleGetImage` (`GET /images/:key`, streams from R2) since the "public
  URL" NF08 needs had no natural source without it — R2's own dev-domain public access is a T016
  deployment decision, so the Worker serves its own images instead, keeping this task testable
  with zero Cloudflare account dependency.

  **Superseded in part, 2026-10-15 (RF18), resolved by T019:** the single baked-in
  `env.COLLECTOR_SECRET` this task checked against was replaced by a per-install secret issued at
  pairing time — a leaked installer download link must not carry a credential valid for the whole
  deployment. The auth check is now "does this secret match *some* install's issued secret"
  instead of "does it match the one global secret", and `COLLECTOR_SECRET` itself is gone from
  `env.ts`/`wrangler.toml`. This task's own tests and behavior are still correct for what
  RF05/RF06/NF06/NF08 ask, only the auth model
  underneath changes.

### T005 — `packages/worker`: VAPID Web Push fanout `[parallel-safe with T004, T006]`

- **Serves:** RF07
- **Files:** `packages/worker/src/push.ts`, `packages/worker/test/push.test.ts` (new); `src/
  inspections.ts` (calls into it after a successful store)
- **Do:** Hand-rolled Web Push send using the Workers runtime's `SubtleCrypto` (plan.md's Q04
  resolution) — VAPID JWT (ES256, P-256) in the `Authorization` header, payload encrypted per the
  Web Push encryption spec (ECDH + HKDF + AES-128-GCM) using each subscription's `p256dh`/`auth`
  keys. On success, nothing further; on a `404` or `410` response from the push service, delete
  that subscription from KV (RF07's second half).
- **Verify:** `pnpm --filter worker test` — the JWT-building function produces a token that decodes
  (header/payload/signature all present, `alg: "ES256"`) against a fixed test VAPID keypair; a
  mocked push-service response of `410` is asserted to trigger a KV delete for that subscription.
  Actually receiving a push on a real device is **not** verified here — that needs a deployed
  Worker and a real subscription (T016).
- **Status:** `[x]` — 5/5 tests pass, run against the real workerd runtime (not mocked crypto),
  including a full `encryptPushPayload` call exercising real ECDH + HKDF + AES-128-GCM. One
  runtime surprise: `@cloudflare/workers-types` names the ECDH `deriveBits` public-key field
  `$public`, but the actual workerd runtime only accepts the spec's real key, `public` — satisfying
  the type checker literally would have sent the wrong field name and failed at runtime
  ("Missing field \"public\" in \"derivedKeyParams\""), caught only because this test runs against
  the real runtime rather than a type-level or mocked check. Worked around with a narrow
  `as unknown as` cast, commented in `push.ts`. As the task itself anticipated: real interop with
  an actual push service (FCM/Mozilla's) is still unverified — only T016/T017 prove that.

### T006 — `packages/worker`: `GET /inspections/latest` `[parallel-safe with T004, T005]`

- **Serves:** RF09 (server side)
- **Files:** `packages/worker/src/inspections.ts` (route added),
  `packages/worker/test/inspectionsLatest.test.ts` (new)
- **Do:** Returns the most recently stored inspection's metadata + R2 URL as JSON. Empty state (no
  inspection stored yet) returns `404`, not a crash.
- **Verify:** `pnpm --filter worker test` — after T004's store, a `GET /inspections/latest` returns
  that same metadata and URL; with nothing stored, it returns `404`.
- **Status:** `[x]` — 2/2 tests pass. Full worker suite: `pnpm --filter @snaptritor/worker test` →
  17/17 passed across all four test files; `typecheck` clean.

### T007 — `packages/collector`: Windows window-finder and screenshot capture

- **Serves:** RF02 (partial — finding/foregrounding the window), RF03, NF05
- **Files:** `packages/collector/native/package.json`,
  `packages/collector/native/src/windows/findWindow.ts`,
  `packages/collector/native/src/windows/capture.ts`,
  `packages/collector/native/scripts/smoke-capture.ts` (all new — **relocated from
  `packages/collector/src|scripts/` to `packages/collector/native/`**, see note below)
- **Do:** `findWindow(titlePattern)` returns the game window's handle and client rect, or `null` —
  never throws on "not found", since `--inspect` needs to log that and exit cleanly (NF06).
  `capture(rect)` returns the pixel buffer for a given rect. `smoke-capture.ts` is a tiny standalone
  script: find any window matching a title substring given on the CLI, foreground it, capture it,
  and write a PNG to disk — proof the native modules actually work on this machine, independent of
  the real game being installed.
- **Verify:** Run for real via Windows' own Node (not WSL's) over the repo's UNC path:
  `powershell.exe -Command "node \\wsl.localhost\Ubuntu\home\joaolfern\dev\snaptritor\packages\collector\native\scripts\smoke-capture.ts Notepad"`
  (with Notepad open) — prints the found window's rect and the saved PNG's path, and the PNG file
  exists with a non-zero size. Proves native window-finding + capture work from this exact
  environment before any game automation is attempted.
- **Status:** `[x]` — ran for real. Four corrections to the plan along the way, each found by
  running against the real runtime rather than trusting a source or a library's name from memory:
  1. **`node-window-manager` dropped entirely.** It needs `node-gyp`/Visual Studio Build Tools to
     compile (not installed, and installing a multi-GB toolchain unprompted would be a real system
     change — asked first, see commit). `@nut-tree-fork/nut-js` alone covers window-finding
     (`getWindows()`) *and* capture *and* input simulation via prebuilt binaries, so the dependency
     is simply unnecessary.
  2. **Package name:** `@nut-tree/nut-js` 404s — it's abandoned; the actively maintained package is
     `@nut-tree-fork/nut-js` (Apache-2.0, free — the user asked directly, verified via registry
     metadata before proceeding, per constitution Article 3).
  3. **Install location:** native modules can't be `npm install`ed over the UNC path at all — their
     postinstall scripts shell out via `cmd.exe`, which refuses a UNC working directory. Installed
     into a real local Windows path instead, then `robocopy`'d the built `node_modules` onto the
     repo (a plain file copy over UNC is fine; it's specifically `cmd.exe`-spawning build scripts
     that aren't). This also forced relocating `findWindow.ts`/`capture.ts`/the smoke script from
     `packages/collector/src` and `scripts/` into `packages/collector/native/`, since Node's module
     resolution needs `node_modules` to be an ancestor of the importing file, not a sibling.
  4. **API surface:** fetched the real docs (nutjs.dev) per the user's steer away from guessing off
     source code, but the docs describe a `screen.capture(region?)` signature that doesn't match
     what's actually installed — confirmed against the installed version's own `.d.ts` files, which
     are authoritative for this exact version: `screen.grab()`/`grabRegion(region)` return an
     in-memory `Image`; the real `saveImage()` takes one `{ image, path }` object, not two
     positional args. Also: `windowWithTitle()` turned out to be a lazy query descriptor (for
     `screen.find()`), not a resolvable `Window` instance — `getWindows()` + filtering by title is
     the real way to get one.
  5. **Caught by actually looking at the output, not just checking exit code 0:** the first
     working-looking run silently captured the wrong window (VS Code, which happened to be on top
     on screen) because `smoke-capture.ts` never called `focus()` before capturing — `findWindow`
     finding a window's rect doesn't mean that window is what's visually on top of the screen at
     that rect. Caught only by reading the saved PNG as an image and seeing VS Code instead of
     Notepad; fixed by focusing before capture, with a short settle delay, then re-verified by
     looking at the corrected PNG. A naive "file exists, non-zero size" check would have missed
     this entirely and shipped a collector that silently photographs whatever's on top of the
     screen, not the game.

### T008 — `packages/collector`: Windows simulated-click module

- **Serves:** RF02, NF05
- **Files:** `packages/collector/native/src/windows/click.ts`,
  `packages/collector/native/scripts/smoke-click.ts` (new — under `native/`, same relocation
  reason as T007)
- **Do:** `clickProportional(rect, xFraction, yFraction)` (via `@nut-tree-fork/nut-js`'s `mouse`)
  moves to and clicks a point computed as a fraction of the given window rect — never an absolute
  screen coordinate, so it keeps working if the window moves (plan.md's design). `smoke-click.ts`
  focuses Notepad, clicks its "File" menu, captures the result (reusing T007's `capture`), and
  saves it so the outcome can actually be looked at — no game involved yet.
- **Verify:** Same interop pattern as T007:
  `powershell.exe -Command "node \\wsl.localhost\...\smoke-click.ts"` with Notepad open — then
  **read the saved screenshot as an image** and confirm the File menu is visibly open (T007's
  lesson: a clean exit code alone proves nothing about where the click landed).
- **Status:** `[x]` — ran for real; `Point`/`Region`/`Button`/`mouse`/`straightTo` all matched
  their published docs exactly this time (checked against the installed `.d.ts` files before
  writing any code, not assumed from T007's experience that they'd be wrong too). Read the saved
  `smoke-click-output.png` as an image: Notepad's full File menu (New tab, Save, Print, Exit, …)
  is visibly open, confirming the click landed exactly on the menu button. Closed the menu
  afterward (`{ESC}` via `SendKeys`) to leave Notepad in a clean state.

### T009 — Checkpoint: tune real navigation against the game

- **Serves:** RF02
- **Files:** `packages/collector/native/src/navigation.ts` (new)
- **Do:** Ask the user to launch Marvel Snap on the PC and leave it at the main menu. Using T007's
  capture script and T008's click module interactively (a short throwaway script, run step by step),
  find: the click sequence from main menu to Shop → Cards as fractions of the window rect, and a
  small region that reliably looks different between "still loading" and "shop loaded" (the
  landmark T010's polling loop watches). Record both as constants.
- **Verify:** The user confirms the recorded click sequence actually lands on Shop → Cards when
  re-run from the main menu, and that the chosen landmark region visibly changes between the
  loading and loaded states (shown by capturing both and comparing by eye).
- **Status:** `[x]` — the user gave the exact navigation path up front with reference screenshots
  (main menu → Shop → Cards tab → Daily Cards sub-tab), which turned out to be exactly the live
  rotation view (matching the earlier-described on-screen cards). Rather than trust pixel
  positions read off those reference images (different, possibly cropped dimensions), drove the
  **real, running game** with T007/T008's tools and verified every step by reading my own
  screenshots:
  - Clicking Shop alone landed directly on Daily Cards — but only because the game remembered its
    last-viewed shop tab from the user's own earlier session. Not safe to rely on after a fresh
    launch (RF02's actual scenario), so explicitly verified the fuller path: clicked **away** to
    the Offers tab (confirmed via screenshot — real money bundles, not Daily Cards), then back to
    the Cards tab, then the Daily Cards sub-icon, confirming each click target independently
    rather than accepting one lucky run.
  - Found a real window-matching hazard: `getWindows()` lists a window literally titled `"SNAP"`
    for the game, but a case-insensitive "snap" search also matches this repo's own VS Code window
    (title contains "snaptritor"). `findWindow()`'s default substring match is case-sensitive, so
    `findWindow("SNAP")` already avoids this correctly — documented as `GAME_WINDOW_TITLE` with an
    explicit warning rather than left to be rediscovered.
  - Recorded the three-step click sequence and the Daily Cards region as constants in
    `navigation.ts`, all as window-rect fractions (not absolute coordinates), with the real
    (1920×1080) resolution they were verified at noted for future re-verification if that changes.
  - Landmark/"settled" detection: no loading spinner was ever observed (the shop opened instantly
    in every run), so there was no "loading vs. loaded" pair of states to capture and diff as the
    task originally envisioned. Documented in `navigation.ts`'s own comments as a residual gap for
    T010: poll by comparing two consecutive captures' hashes for stability (unchanged = settled)
    rather than comparing against a known loading frame that was never actually observed.
  - Left the game in a clean state afterward (closed the shop panel).

### T010 — `packages/collector`: wire `--inspect` end to end

- **Serves:** RF02, RF03, RF04, RF05, RF06, RF10, NF06
- **Files:** `packages/collector/native/src/inspect.ts`, `packages/collector/native/cli.ts` (new,
  under `native/` — it imports T007–T009's native modules directly), plus
  `packages/collector/native/src/windows/capture.ts` (`toHashablePixels` added),
  `packages/shared/src/imageHash.ts` (`perceptualHash` gained a `channels` parameter)
- **Do:** `inspect.ts` composes T001–T002's state/hash logic with T007–T009's window/capture/click
  modules: check `shouldRunInspection`; find+foreground the game window; run T009's click sequence;
  poll the landmark region (timeout → `recordError` + exit, never a half-loaded capture); capture
  the shop region; hash it; compare to `state.lastImageHash`; if unchanged, update
  `lastInspectionAt`/`nextInspectionAt` and stop; if changed, `POST` the image + `InspectionSubmission`
  to the Worker's `/inspections` (T004) with the shared secret header, then update state. `cli.ts`
  exposes `--inspect` and a `--dry-run` flag that skips the real `POST` (hits a local `wrangler dev`
  instance instead) so this is testable without a deployed Worker.
- **Verify:** With `pnpm --filter worker dev` running locally and the game open at the main menu,
  from Windows' own Node over the UNC path:
  `powershell.exe -Command "node ...\collector\dist\cli.js --inspect --dry-run --worker-url http://localhost:8787"`
  — the game ends up on Shop → Cards, a screenshot file is written locally, and the log shows
  either "unchanged, nothing sent" or a successful `POST` to the local dev Worker (confirmed by
  that Worker's own console output). Run it twice in a row with nothing changed in the shop between
  runs: the second run must log "unchanged" and send nothing (RF04/RF05's real test).
- **Status:** `[x]` — ran the real pipeline twice against the live game with a local
  `wrangler dev` Worker: first run detected a change (first-ever run, no prior hash) and `POST`ed
  successfully (`201 Created` in the Worker's own log, confirmed by fetching the stored image back
  through `GET /images/:key` and reading it — the real Daily Cards rotation, correctly cropped);
  second run correctly logged "Shop unchanged; nothing sent" and sent nothing (RF04/RF05's literal
  test, though the capture region was also tuned between the two runs, so it's not a perfectly
  clean isolated repeat — noted honestly rather than overstated). Four real fixes beyond the task's
  literal description, each found by running for real rather than trusting the code:
  1. **The user's correction, incorporated:** RF10 was going to sleep the PC unconditionally.
     Changed to only sleep if *this run's own* wake trigger is what woke the PC — a scheduled
     inspection must never yank the PC to sleep out from under the player if they're actively using
     it for something else. Implemented as a heuristic (a recent system resume-from-sleep event in
     the Windows Event Log, within a short time window) since there's no direct "did my task wake
     this machine" signal. **Not verified against a real sleep/wake cycle** — doing that from this
     session would risk disconnecting the interop channel this automation runs through; flagged in
     the code as implemented-but-unverified until T011/T018 exercise it for real.
  2. **`@snaptritor/shared`'s bare-specifier import doesn't resolve** when Node's native TS loader
     runs the importing file from Windows over the UNC path (even though the identical import
     resolves fine under vitest/WSL) — it doesn't reliably follow a third-party package's
     `"main": "./src/index.ts"` field. Fixed by importing via a relative path instead, in both
     `inspect.ts` and `packages/collector/src/state.ts`; `packages/shared/src/index.ts`'s own
     internal re-exports needed the same `.js` → `.ts` fix, plus `allowImportingTsExtensions` added
     to every affected `tsconfig.json`. Recorded in `CLAUDE.md`.
  3. **A further, separate break once that was fixed:** `zod` (imported bare from
     `packages/shared/src/schemas.ts`) still failed to resolve on Windows — pnpm links it via a
     relative symlink, which Windows' `node.exe` doesn't reliably follow when read over the UNC
     bridge. Fixed the same way as the native modules: installed a real local copy on Windows,
     `robocopy`'d it directly over the symlink. Ephemeral (gitignored, reset by the next
     `pnpm install`) and documented as a redo-when-needed step in `CLAUDE.md`, not a permanent fix.
  4. **nut-js's `Image` defaults to BGR color mode**, not RGB, and its channel count varies (3 or
     4) — caught by reading `image.class.d.ts` *before* wiring it into `perceptualHash`, which had
     assumed RGBA. Added `toHashablePixels()` (calls `.toRGB()`, returns the real channel count)
     and generalized `perceptualHash` to take a `channels` parameter instead of hardcoding 4
     (default kept at 4, so T001's existing tests needed no changes — reran them to confirm: 13/13
     still pass).
  Also tuned `DAILY_CARDS_REGION` after the first live capture showed it clipped the "Daily Cards"
  title and the bottom pricing row; re-verified with a direct capture before settling on the wider
  region. Left the Worker dev server stopped and the game in its normal state afterward.

### T011 — `packages/collector`: wake-capable Scheduled Task registration

- **Serves:** RF01, RF12, Q06 (self-wake)
- **Files:** `packages/collector/native/src/scheduler.ts`,
  `packages/collector/native/scripts/smoke-schedule.ts` (new, under `native/`)
- **Do:** Registers a wake-capable Scheduled Task that runs `--inspect` at given times, and
  enables/disables it to implement the pause-wake-automation toggle RF15 needs (this is what
  T012's toggle actually calls). `smoke-schedule.ts` registers a throwaway task, verifies its real
  settings, exercises disable/enable, then deletes it.
- **Verify:** Via interop: `powershell.exe -Command "node ...\smoke-schedule.ts"` —
  `schtasks /query /tn SnaptritorSmoke` shows the task exists with `Scheduled Task State: Enabled`
  and its wake-capable property set, immediately after creation; the script's own cleanup step
  removes it and a second query confirms it's gone.
- **Status:** `[x]` — ran for real; all four states verified via `Get-ScheduledTask` (not just
  "the registration call didn't throw"): `{exists:true, enabled:true, wakeToRun:true}` right after
  creation, `enabled:false` after disable, `enabled:true` after re-enable, `exists:false` after
  delete. One correction to the task's own description: `schtasks.exe`'s plain command-line flags
  **cannot** set "wake the computer to run this task" at all — that's an XML/COM-API-only setting,
  not exposed by `schtasks /create`'s basic parameters. Used PowerShell's `*-ScheduledTask` cmdlets
  (`New-ScheduledTaskSettingsSet -WakeToRun`, `Register-ScheduledTask`, `Enable`/`Disable-
  ScheduledTask`) instead, verified live before writing any production code. This also sidesteps a
  separate, real gotcha found while cross-checking against `schtasks.exe` directly as the task
  originally specified: its text output is locale-dependent (this machine is pt-BR Windows), so a
  naive `Select-String 'Enabled'` match silently found nothing — exactly the kind of fragility the
  PowerShell object cmdlets (`$task.State`, a real enum, not a localized string) avoid.

### T012 — `packages/collector`: status window + first-run pairing prompt

- **Serves:** RF13, RF14, RF15, RF18
- **Files:** `packages/collector/native/src/ui/status.html`,
  `packages/collector/native/src/ui/main.ts`, `packages/collector/native/src/ui/preload.cts`,
  `packages/collector/native/tsconfig.json`, `packages/collector/native/package.json` (build/start
  scripts added)
- **Do:** An Electron `BrowserWindow` (no Chromium devtools shown) that reads `CollectorState` (T002)
  on open and renders last/next inspection time plus two toggle switches: one flips
  `inspectionPaused` and writes state back (T002's `writeState`); the other calls T011's
  enable/disable on the registered Scheduled Task directly (not just a flag `--inspect` reads,
  since `--inspect` never runs at all if the task didn't wake anything). **Added for RF18:** if
  `CollectorState` has no stored secret yet (first run), show a one-field pairing-code prompt
  instead of the normal status view; submitting it calls T019's `POST /pairing/claim`, and on
  success stores the returned `collectorSecret` in `CollectorState` and switches to the normal
  view. An expired/already-used code shows the Worker's own rejection reason, not a generic error.
- **Verify:** Via interop, with Electron installed:
  `powershell.exe -Command "node ...\collector\dist\cli.js"` — with no stored secret, shows the
  pairing prompt; entering a code obtained from T019's `POST /pairing/code` (against a local
  `wrangler dev`) stores a secret in `state.json` and switches views. With a secret already stored,
  opens straight to the normal view showing the values currently in `state.json`; clicking the
  inspection-pause toggle updates `state.json`'s `inspectionPaused` on disk (confirmed by reading
  the file after); clicking the wake-pause toggle changes the registered task's enabled state
  (confirmed by `schtasks /query`).
- **Status:** `[x]` — built in `packages/collector/native/` (not `packages/collector/src/`, matching
  the established native/ convention from T007–T011) as a self-contained window: Electron 33 bundles
  Node 20.18 (confirmed live), which has no native TS support, so importing T002's `state.ts` or
  T011's `scheduler.ts` directly would cross a `tsc` rootDir boundary this package can't cross either
  — the window instead duplicates the small slice of state-read/write and
  Enable/Disable-ScheduledTask logic it needs, documented at the top of `main.ts` as a deliberate
  trade-off. Verified end-to-end for real, twice (once with diagnostics, once clean after removing
  them): with no stored secret, launching shows the pairing prompt; a real code from a live
  `wrangler dev`'s `POST /pairing/code`, typed and submitted with Enter, stores the returned
  `collectorSecret` in `state.json` and switches to the status view (confirmed both via the on-disk
  file and via the Worker's `GET /collector/status` returning `linked: true`); both toggles confirmed
  writing `inspectionPaused`/`wakeAutomationPaused` to `state.json` from precisely-targeted clicks.
  Five real bugs found and fixed along the way (all added to CLAUDE.md so they aren't
  re-discovered): `electron.cmd`'s wrapper spawns its own `cmd.exe`, which is blind to
  `New-PSDrive`'s session-local mapping — call `electron.exe` directly; the GPU process crashes
  fatally with default flags (`disable-gpu` + `no-sandbox` fixes it); a second, separate bug left the
  window permanently blank even with GPU flags fixed and the DOM proven correct via forwarded
  console logs — root cause was Electron's default `show:true` painting a blank frame before the
  real one could composite, fixed with `show:false` + `ready-to-show`; the preload script failed
  with an ESM `SyntaxError` despite the package being `"type":"module"` — Electron's preload loader
  never runs ESM, fixed by naming it `preload.cts` so `tsc` emits CommonJS `.cjs`; and precise clicks
  landed 31px off their intended target — not a DPI issue (`devicePixelRatio` was `1`) but a
  `nut-js`-physical-pixels-include-title-bar vs. `getBoundingClientRect()`-CSS-pixels-exclude-it
  mismatch, found by forwarding `console-message` to log the real target rect.

### T013 — `packages/collector`: Windows installer

- **Serves:** RF11, RF12, RF18
- **Files:** `packages/collector/native/electron-builder.yml`,
  `packages/collector/native/installer/installer.nsh`,
  `packages/collector/native/scripts/postinstall.ts`,
  `packages/collector/native/scripts/fetch-portable-node.mjs`,
  `packages/collector/native/package.json` (build scripts added)
- **Do:** `electron-builder` configured for an NSIS target. A custom NSIS `customInstall` macro
  invokes `postinstall.ts` (via a bundled portable Node runtime, not the dev machine's own system
  Node, never Electron's — see plan.md's packaging decision), which reuses T011's
  `registerInspectionTask` directly to create the Scheduled Task and writes the initial
  `state.json`, so first run needs nothing from the player beyond running the installer — and
  then, per T012, entering the pairing code shown on their phone (RF18's one deliberate exception
  to "nothing to configure"). `customUnInstall` reuses T011's `unregisterTask` the same way.
- **Verify:** Via interop: `npm run build:installer` (invoked directly, not through `npm run` —
  see the finding below) produces `Snaptritor Setup <version>.exe` with a non-zero size. Actually
  running the installer end to end on a clean account is not exercised by this task (no clean test
  account available) — note that residual risk rather than claim it's covered.
- **Status:** `[x]` — built and verified for real, in stages:
  - **Runtime decision (plan.md):** the headless `--inspect` task and the Electron UI need
    different Node runtimes (nut-js's native bindings are built against system Node's ABI, not
    Electron's bundled one) — the installer bundles a portable Node 25.6.1 (fetched at build time
    by `fetch-portable-node.mjs`, pinned to the exact version already proven against nut-js) rather
    than using `ELECTRON_RUN_AS_NODE`.
  - **Real correctness gap found and fixed before this task could even be verified:** `cli.ts` was
    reading `collectorSecret` only from an env var (dev placeholder), never from the paired
    `state.json` T012's status window actually writes — meaning every real scheduled run would
    have silently sent the wrong secret. Fixed and verified live separately (own commit) before
    building the installer around it.
  - **extraResources mirrors the repo's own `packages/collector` and `packages/shared` relative
    layout** so `cli.ts`/`postinstall.ts`/`inspect.ts`'s existing relative imports resolve with
    zero rewriting inside the packaged app.
  - **`npm run` itself hits the same UNC wall as `npm install`'s postinstall scripts** (confirmed
    live, added to CLAUDE.md) — `build:installer` must be invoked via its two underlying commands
    directly when running over the WSL/UNC interop bridge; the script is still correct for a real
    local install.
  - **electron-builder cross-building the NSIS target directly from WSL/Linux failed** needing
    `wine` (for `rcedit`-based `.exe` metadata editing) — ran it from the Windows side instead,
    installed via the same local-path-then-robocopy pattern as every other native dependency.
  - **electron-builder's bundled `winCodeSign` package failed to extract on Windows** with "Cannot
    create symbolic link" (`O cliente não tem o privilégio necessário`) — the archive's `darwin/`
    subfolder contains real symlinks that an unprivileged Windows account can't recreate, even
    though nothing Windows-targeted needs that subfolder. Fixed by extracting the same archive on
    the WSL/Linux side (where symlinks aren't privileged) and robocopying everything except
    `darwin/` into `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\` ahead of
    the real build.
  - **7-Zip's NSIS packaging step failed with a false "Duplicate filename on disk" for
    `mime@2.6.0`'s genuinely distinct `mime.js`/`Mime.js` pair** (a real, long-shipping package
    layout, not an actual collision) — but only when the build's output tree lived on the
    `\\wsl.localhost\...` bridge. Fixed by pointing `directories.output` at a real local Windows
    path (`C:\snaptritor-dist-installer`) instead of a repo-relative one; built clean afterward.
  - **End-to-end verified for real** (not just "the build succeeded"): ran the packaged
    `postinstall.ts` via the packaged `node.exe` exactly as `customInstall` would, confirmed via
    `Get-ScheduledTask` that it registered a real `SnaptritorInspection` task (`State: Ready`) and
    wrote a real initial `state.json`; then ran it again with `--uninstall` and confirmed via
    `Get-ScheduledTask` that the task was gone. All scratch state (the built installer, the test
    Scheduled Task, the scratch `electron-builder` install) cleaned up afterward.
  - Residual risk, as originally noted: the installer's actual NSIS wizard flow (clicking through
    the installer UI itself as a player would) was not run on a clean account — only the packaged
    resources and the `customInstall`/`customUnInstall` logic they invoke were verified directly.

### T014 — `packages/client`: service worker `[parallel-safe with T015]`

- **Serves:** RF08, RF09, NF08
- **Files:** `packages/client/package.json`, `packages/client/src/sw.ts`,
  `packages/client/src/sw.test.ts` (new)
- **Do:** `push` event handler builds the `showNotification` options from the push payload's URL
  (`{ body: ..., image: url }` — Q09's resolution, no base64 embedding); `notificationclick` opens/
  focuses the client window at a URL that will fetch `/inspections/latest`. The options-building
  logic is a pure function (`buildNotificationOptions(payload)`) so it's testable without a real
  `ServiceWorkerGlobalScope`.
- **Verify:** `pnpm --filter client test` — `buildNotificationOptions` given a known payload
  returns an object with `image` set to that exact URL and no text field claiming to name cards.
- **Status:** `[x]` — 3/3 tests pass. One real fix: the event-listener registration
  (`self.addEventListener(...)`) ran at module load, so importing the file from plain Node (as the
  test does) threw `ReferenceError: self is not defined` before any test could even run — `self`
  only exists in a real service-worker context. Guarded the wiring behind
  `typeof self !== "undefined"` so the pure function stays importable on its own, same spirit as
  the task's own stated intent, just not achievable by file-splitting alone.

### T015 — `packages/client`: app shell, subscribe flow, and pairing UI `[parallel-safe with T014]`

- **Serves:** RF08, RF09, RF16, RF17
- **Files:** `packages/client/src/app.ts`, `packages/client/src/pure.ts`,
  `packages/client/src/app.test.ts`, `packages/client/index.html` (new); `packages/worker/src/
  index.ts` (`GET /vapid-public-key` added — not explicitly scoped by this task's own text, but a
  direct, necessary consequence of it: `pushManager.subscribe()` needs the VAPID public key as its
  `applicationServerKey`, and a static client build has no other way to know it)
- **Do:** A subscribe button that requests notification permission, creates a `PushSubscription`
  via the browser's Push API, and `POST`s it to the Worker's `/subscriptions` (T003). Right after a
  successful subscribe, call T019's `POST /pairing/code` and render the returned code prominently,
  next to a `GET /download/collector` link (RF17) and a "not linked" status (RF16); poll T019's
  `GET /collector/status` (for this subscription's endpoint) every few seconds and switch to
  "linked" once the collector claims it — no page reload required, but a reload must also pick up
  the right state (scenario 8). The main view fetches `GET /inspections/latest` and displays the
  image.
- **Verify:** `pnpm --filter client build` succeeds (typecheck + bundle). End-to-end subscribe →
  receive → display is only provable on a real device, deferred to T017. The pairing code →
  "linked" transition is provable against a local `wrangler dev` plus T012's collector pointed at
  it, without needing a real device or deployment.
- **Status:** `[x]` — build succeeds, emitting exactly `app.js`/`pure.js`/`sw.js` to `dist/` (no
  test files mixed in — added `tsconfig.build.json`/`tsconfig.build.sw.json`, which `exclude` the
  `.test.ts` files the plain typecheck configs `include`, since a real browser build must emit
  only what it actually ships). `pure.ts` split out from `app.ts` for the same reason T014 needed
  the `self` guard — `app.ts` touches `document` at module scope, so its pure helpers
  (`pairingStatusUrl`, `urlBase64ToUint8Array`) had to live somewhere importable from plain Node;
  3 tests added for them. Two real fixes along the way: `tsc`'s DOM-lib `Uint8Array` typing (newer
  lib.dom.d.ts makes it generic over its buffer type, which doesn't satisfy `BufferSource` without
  a cast — a real, if cosmetic, type-strictness wrinkle, not a logic bug) on
  `applicationServerKey`; and every in-repo `.ts`-extension import had to become `.js` here
  specifically, unlike `packages/collector/native/`'s raw-Node code — this package actually emits
  real browser-loadable files, and `tsc` passes import specifiers through unchanged, so the
  specifier has to match what gets emitted, not what's on disk as source.
  The full subscribe → pairing-code → collector-claims-it → "linked" loop is not run end-to-end
  here (needs a browser and a running collector together) — deferred to T017 as the task's own
  Verify text already said, now doubly true with the pairing step added.

### T016 — Checkpoint: Cloudflare account, bindings, VAPID keys, deploy

- **Serves:** RF06, RF07, RF08, RF09, RF17, Article 8
- **Files:** `packages/worker/wrangler.toml` (real KV id, R2 bucket, custom-domain route, `[assets]`
  binding), `packages/worker/.dev.vars` (new — the old dev-placeholder VAPID keypair, moved out of
  the checked-in `[vars]`), `packages/client/manifest.webmanifest` (new),
  `packages/client/package.json` (build script copies `index.html`/the manifest into `dist/`),
  `packages/client/src/app.ts` (service-worker registration fix, found during this checkpoint —
  see below)
- **Do:** Logged into the `joaolfern@proton.me` Cloudflare account and authorized `wrangler`.
  Created the real `SUBSCRIPTIONS` KV namespace and `snaptritor-shop-images` R2 bucket, generated a
  real VAPID keypair (Web Crypto, verified round-trip before use), stored
  `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` via `wrangler secret put` (Article 8 — only
  `VAPID_PUBLIC_KEY`, which is not secret by design, stays in checked-in `[vars]`). Pointed the
  Worker at `snaptritor.nosnocabo.com.br` (the `nosnocabo.com.br` zone already existed on the
  account) and uploaded the real built installer to R2 at `installer/snaptritor-setup.exe`. Also
  wired `packages/client` to be served from the **same** Worker deployment via `[assets]` (a plan.md
  decision made during this checkpoint — see plan.md's "hosting" note under `packages/client`), since
  nothing had previously deployed the client at all.
- **Verify:** `wrangler deploy` succeeds; `curl -X POST .../subscriptions` with a real
  `PushSubscriptionRecord`-shaped body against the live domain returns `201`; `curl -X POST
  .../pairing/code` → `.../pairing/claim` → `curl -X POST .../inspections` with a real per-install
  secret and a tiny test PNG returns `201`, the image is fetchable back from `/images/:key`, and
  `/inspections/latest` reflects it; `/collector/status` flips to `linked:true` after claim;
  `/download/collector` streams the real uploaded installer (confirmed as a genuine PE32 NSIS
  self-extracting archive, not just a non-empty response). A fully real "push notification arrives
  on a real device" proof is still blocked on T017 (no real device/browser subscription exists
  yet) — the push *attempt* was verified instead: POSTing to a fake-but-correctly-shaped FCM
  endpoint fired a real fetch to Google's push service, which rejected it, and the Worker's RF07
  cleanup logic correctly deleted that dead subscription from KV afterward (confirmed via `wrangler
  kv key list` before/after) — real proof the fan-out + cleanup path works, short of an actual
  phone buzzing.
- **Status:** `[x]` — deployed and verified live at `https://snaptritor.nosnocabo.com.br`, test
  data cleaned out of the real KV/R2 afterward. Real findings:
  - **A genuine client bug, found only because this was the first real browser test of RF08**:
    `sw.ts` exports `buildNotificationOptions` (so `sw.test.ts` can test it as plain data, no fake
    `self` needed) but `app.ts` registered it as a classic script — browsers error on `export`
    outside a module (`Uncaught SyntaxError: Unexpected token 'export'`), and registration's
    promise rejected with "script evaluation failed", silently breaking push end to end. Fixed by
    registering with `{ type: "module" }` (reported live by the user testing the real deployed
    page — exactly the kind of bug no amount of `vitest` coverage catches, since the unit tests
    import `sw.ts`'s exports directly rather than loading it as a browser would).
  - **`wrangler.toml` key ordering matters**: a TOML table header (`[assets]`, `[vars]`) silently
    absorbs every bare `key = value` line that follows it, including ones meant for the root table
    — confirmed live when `[assets]` placed before `kv_namespaces`/`routes` made
    `vitest-pool-workers` report "Unexpected fields found in assets field: routes,kv_namespaces,
    r2_buckets" and every binding came back `undefined`. Table headers must come last.
  - **R2 needs two separate dashboard-side enables, not one**: creating a bucket (`wrangler r2
    bucket create`) worked right after the user enabled R2 Object Storage, but `wrangler deploy`
    still failed binding to it ("R2 binding error... Please enable R2... code: 10136") for several
    minutes afterward — not a payment-method issue (one was already on file, R2 Paid already
    active), not a wrangler-version issue (reproduced identically on wrangler 4), just propagation
    delay for the Worker-to-R2 binding permission specifically. Retrying after a few minutes
    succeeded with no config change.
  - **A Worker `routes` entry does not create a DNS record.** It only attaches the Worker to
    traffic that already reaches Cloudflare for that hostname — `snaptritor.nosnocabo.com.br`
    didn't resolve at all until the user added a proxied (orange-cloud) DNS record for it (content
    doesn't matter — a placeholder `192.0.2.1` A record is standard practice here, since the Worker
    route handles real traffic, not whatever the record points to).
  - **DNS propagation after adding that record was genuinely flaky for a few minutes** (confirmed
    live: alternating `HTTP 000`/`Could not resolve host` and real `200`s from the same curl
    command seconds apart) — worth a few retries before assuming something is actually broken.
  - Residual gap, noted rather than silently skipped: `GET /download/collector` doesn't honor
    `Range` requests (a ranged `curl` still downloaded the full ~165 MB) — fine for correctness
    (confirmed: the downloaded bytes are a valid NSIS installer), just not resumable on a flaky
    connection. Not required by RF17 and not fixed here.
  - The manifest's `icons` array is empty — real icon assets are a design decision for T017
    (TWA packaging needs at least a 512×512 icon), not invented here.

### T017 — Checkpoint: confirm push works on the user's phone

- **Serves:** RF08, RF09
- **Files:** none
- **Do:** **Scope changed 2026-10-15** — dropped the originally-planned Android TWA wrap
  (Bubblewrap/Android Studio, a signing key, Play-Store-style packaging). Neither RF08 nor RF09
  mentions an installed native app; both only require subscribing and receiving a push, which a
  plain browser visit (optionally "Add to Home Screen," already supported — `manifest.webmanifest`
  exists and `display: "standalone"` is set) does identically, with none of the extra build
  tooling. The user visits `snaptritor.nosnocabo.com.br` on their phone, subscribes, and confirms a
  real push notification shows the screenshot inline.
- **Verify:** The user confirms a test notification arrived on their phone and showed the image
  without needing to tap it first.
- **Status:** `[ ]` — scope narrowed and ready to verify; needs the user to actually do it on their
  phone, which hasn't happened yet.

### T018 — Checkpoint: confirm wake-timer support and schedule cadence

- **Serves:** RF01
- **Files:** `packages/collector/native/scripts/postinstall.ts` (`DEFAULT_DAILY_TIMES`)
- **Do:** Ask the user to check their BIOS/firmware for RTC/ACPI wake-timer support (Q03) — not
  full Wake-on-LAN, just the narrower setting the self-wake Scheduled Task needs — and to confirm
  how often they want inspection to run (Q02).
- **Verify:** The user confirms wake timers are enabled (or what they found), and states the
  cadence they want; the installer's registration is updated with the real times if they differ
  from the placeholder used during T011's own testing.
- **Status:** `[~]` — Q02 resolved by the user (2026-10-15): the shop's real daily reset is 19:00
  UTC (16:00 BRT), with featured/spotlight rotating every 8h from that same anchor — boundaries at
  16:00/00:00/08:00 BRT, not the earlier arbitrary 03:10/11:10/19:10 placeholder (which was just
  evenly spaced for T011's own smoke test, never actually anchored to the real reset).
  `DEFAULT_DAILY_TIMES` updated to `["00:10", "08:10", "16:10"]` and republished (v0.3.0). **Not
  yet `[x]`: Q03 (BIOS/firmware wake-timer support) is still unanswered** — without it, RF01's
  "the PC wakes itself" premise is unverified; the Scheduled Task is registered wake-capable
  (`WakeToRun: true`, confirmed live in T011) but that only matters if the firmware actually
  honors it. Also: **auto-update (T020) does not re-register the Scheduled Task** — NSIS's
  `customInstall` macro only runs on a real install, not a differential auto-update, so an
  already-installed collector with the old cadence baked in needs one more manual reinstall to
  pick up these corrected times; a later improvement could have `main.ts` re-run the registration
  on every startup instead, flagged here rather than built under today's time pressure.

### T019 — `packages/worker`: pairing endpoints, and per-install secrets

- **Serves:** RF16, RF17, RF18 (added 2026-10-15, after T001–T011 were already built — see the
  user's install-flow requirement and the resulting spec/plan changes)
- **Files:** `packages/shared/src/schemas.ts` (`PairingCode`, `PairingClaimResult` added;
  `CollectorState` gains `collectorSecret: z.string().nullable()`), `packages/worker/src/pairing.ts`,
  `packages/worker/test/pairing.test.ts` (new); `packages/worker/src/inspections.ts` (auth check
  changed from a single `env.COLLECTOR_SECRET` equality check to a per-install secret lookup);
  `packages/worker/src/index.ts` (routes added); `packages/collector/src/state.ts` (`collectorSecret`
  threaded through alongside the existing fields)
- **Do:**
  - `POST /pairing/code` — generates a random 6-character code, stores `PairingCode` in KV keyed by
    the code with a short TTL (e.g. 15 minutes) and `claimed: false`, tied to the subscription
    endpoint the client just registered (T003).
  - `POST /pairing/claim` — given a code: `404`/expired if it's not in KV or past `expiresAt`,
    `409` if `claimed` is already `true` (one attempt per code, per the plan's stated mitigation —
    claiming it marks it used regardless of whether the attempt itself was "correct", since the
    code was already consumed by someone trying it); otherwise generates a fresh per-install secret,
    stores it (keyed by secret → valid, for `/inspections`' lookup) and marks the paired
    subscription "linked" (a KV flag keyed by subscription endpoint), then returns
    `PairingClaimResult`.
  - `GET /collector/status?endpoint=<subscription endpoint>` — returns `{ linked: boolean }` by
    checking that flag (RF16's polling target).
  - `GET /download/collector` — streams the installer from R2 (same pattern as `handleGetImage`),
    `404` if T016 hasn't uploaded one yet.
  - `POST /inspections`'s auth check changes from `providedSecret !== env.COLLECTOR_SECRET` to a KV
    lookup of the provided secret against the set issued by `/pairing/claim` — this is the follow-up
    T004's own entry flags.
- **Verify:** `pnpm --filter worker test` — `POST /pairing/code` returns a 6-character code;
  `POST /pairing/claim` with that code returns a secret and flips `/collector/status` to
  `linked: true`; claiming the same code again returns `409` and does not re-flip anything; an
  expired code (test by setting a KV entry with a past `expiresAt` directly) returns an error
  rather than succeeding; `POST /inspections` with the newly-issued secret succeeds, with the old
  single dev-placeholder secret from `wrangler.toml`'s `[vars]` now rejected (`401`) since it was
  never issued through pairing.
- **Status:** `[x]` — 28/28 worker tests pass (8 new in `pairing.test.ts`, 2 new in
  `download.test.ts`, plus `inspections.test.ts`/`inspectionsLatest.test.ts` updated to obtain a
  real secret through the actual pairing flow instead of a hardcoded placeholder, since there is
  no longer a fixed secret to hardcode); `typecheck` clean. Added an explicit test for the exact
  claim in this task's own Verify text — the old `dev-test-secret-change-me` placeholder is
  rejected (`401`) — rather than leave it merely implied by the auth rewrite. `COLLECTOR_SECRET`
  removed outright from `env.ts` and `wrangler.toml`'s `[vars]` (not just unused) once nothing
  referenced it anymore. T004's flagged follow-up is done: `POST /inspections`'s auth is now the
  per-install KV lookup, not the single equality check.

### T020 — `packages/collector`/`packages/worker`: auto-update (RF19)

- **Serves:** RF19 (added 2026-10-15, after a worker-URL fix needed a manual reinstall to reach
  an already-installed collector — exactly the friction this closes)
- **Files:** `packages/collector/native/package.json` (`electron-updater` dependency, version
  bumped to `0.1.0`), `packages/collector/native/electron-builder.yml` (`publish` config, pinned
  `artifactName`), `packages/collector/native/src/ui/main.ts` (`autoUpdater` wiring),
  `packages/worker/src/download.ts` (rewritten: redirects to the GitHub Release asset instead of
  proxying a hand-uploaded R2 copy), `packages/worker/test/download.test.ts` (rewritten for the
  redirect)
- **Do:** `electron-updater`'s `autoUpdater.checkForUpdatesAndNotify()`, called once at startup and
  every 4 hours thereafter from `main.ts` (the status window process — the only one with a UI to
  notify from; the far-more-frequent headless `--inspect` process doesn't check itself). Points at
  a public GitHub repo (`joaolfern/snaptritor`, created and pushed as part of this task) via
  `electron-builder.yml`'s `publish: { provider: github }`, which auto-generates `latest.yml`
  alongside the installer and blockmap on every publish — no manifest to hand-maintain, unlike the
  rejected generic-HTTP-feed alternative (see plan.md). `GET /download/collector` now redirects to
  `github.com/joaolfern/snaptritor/releases/latest/download/snaptritor-setup.exe` — a stable URL
  across versions because `artifactName` is pinned — instead of proxying R2, so there's exactly one
  copy of the installer, not two that can drift.
- **Verify:** `pnpm --filter worker test` passes with the rewritten redirect test;
  `electron-builder build --win nsis --publish always` (with a `GH_TOKEN`) successfully creates and
  uploads to a real GitHub Release; `curl -sL .../download/collector -o /dev/null -w
  '%{http_code} %{size_download}'` returns `200` with the real installer's byte size, following the
  full redirect chain. A genuine newer-version auto-update applying on a real already-installed
  collector is not exercised by this task (would need two real published versions and time for an
  actual background check to fire) — noted as residual risk rather than claimed.
- **Status:** `[x]` — built and verified live:
  - Created `gh` CLI access (not previously installed — installed and authenticated live by the
    user via `! sudo apt-get install gh && gh auth login`, since this session has no sudo/GitHub
    credentials of its own) and a new public GitHub repo, `joaolfern/snaptritor`, pushed for real.
  - `electron-builder build --publish always` **creates the GitHub Release as a draft by
    default** — confirmed live: the installer and `latest.yml` uploaded successfully (173 MB +
    337 B, both `state: uploaded`), but `.../releases/latest/download/<name>` 404'd until the
    release was explicitly un-drafted and marked latest (`gh release edit v0.1.0 --draft=false
    --latest`). Electron-builder's own CLI output never mentions this; only inspecting the
    release's real state (`gh release view --json isDraft`) revealed it.
  - Confirmed the full redirect chain for real: `/download/collector` → GitHub's `/latest` tag
    redirect → the tag's specific asset URL → a signed Azure blob storage URL → `200`, with the
    downloaded byte count matching the uploaded asset's size exactly (173,285,174 bytes).
  - Deleted the now-redundant R2 copy of the installer (`installer/snaptritor-setup.exe`) uploaded
    by hand during T016 — GitHub Releases is now the single source for this artifact.
  - Two unrelated real bugs found and fixed in the same pass, both from live user reports while
    this work was in flight: the install-download link's `href` was only ever set inside the
    pairing-code view (never ran before a successful subscribe, so clicking it did nothing before
    subscribing — RF17 requires it to work regardless); and `cli.ts`/`main.ts`/`installer.nsh` still
    defaulted to the pre-T016 placeholder Worker URL
    (`snaptritor-worker.example.workers.dev`), so an already-installed collector's pairing claim
    and its own Scheduled Task registration both silently pointed at a URL that was never real.
    Both fixed and redeployed; see their own commits.
  - **Custom app icon added in the same pass (v0.2.0 release), not separately spec'd — a direct
    user request, not an RF.** Sourced from Jubilee's base card art (marvelsnapzone.com, found via
    web search), cropped to a tight head/face portrait at
    `packages/collector/native/resources/{icon.ico,icon.png}`. The first crop attempt (full head +
    shoulders + the card's sparkly background) looked fine at full size but was illegible at
    16×16/32×32 — confirmed by actually rendering a small-size preview, not just eyeballing the
    source at full resolution — so it was re-cropped tighter around just the face before
    finalizing. Wired into `electron-builder.yml` (`icon`/`win.icon`, packaged installer + taskbar
    icon) and `main.ts` (`BrowserWindow`'s own runtime icon, separate from the packaged `.exe`'s).
    Verified for real by extracting the icon back out of the actual built `.exe`
    (`System.Drawing.Icon.ExtractAssociatedIcon`), not just trusting that the build didn't warn.
    Flagged plainly to the user: this card art is Marvel/Second Dinner's copyrighted work, now
    committed directly into a **public** repo (not just baked into a binary) — the user chose to
    leave it as-is, low practical risk for a non-commercial personal fan project.
