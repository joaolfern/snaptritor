# Tasks: Shop rotation notifier

- **Spec:** `./spec.md` · **Plan:** `./plan.md`

Executed in order unless marked `[parallel-safe]`. A task is checked off only when its
verification step has actually been run and passed — not when the code looks right.

Tasks T001–T006 need only WSL/Node — no Windows GUI. T007–T013 need the native Windows automation
to actually run, which is available here via WSL→Windows interop (`powershell.exe`/`node.exe`
against the repo's own UNC path) and, for T009, the real game. T016–T018 are checkpoints that need
the user directly (a Cloudflare account, the physical PC's BIOS, an Android device).

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

No orphans: every task below cites at least one requirement it serves.

## Tasks

### T001 — `packages/shared`: contracts and the change-detection hash

- **Serves:** RF04, RF06, RF08, Article 5, NF02
- **Files:** `packages/shared/package.json`, `packages/shared/src/schemas.ts`,
  `packages/shared/src/imageHash.ts`, `packages/shared/src/imageHash.test.ts` (all new)
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
- **Status:** `[ ]`

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
- **Status:** `[ ]`

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
- **Status:** `[ ]`

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
- **Status:** `[ ]`

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
- **Status:** `[ ]`

### T006 — `packages/worker`: `GET /inspections/latest` `[parallel-safe with T004, T005]`

- **Serves:** RF09 (server side)
- **Files:** `packages/worker/src/inspections.ts` (route added),
  `packages/worker/test/inspectionsLatest.test.ts` (new)
- **Do:** Returns the most recently stored inspection's metadata + R2 URL as JSON. Empty state (no
  inspection stored yet) returns `404`, not a crash.
- **Verify:** `pnpm --filter worker test` — after T004's store, a `GET /inspections/latest` returns
  that same metadata and URL; with nothing stored, it returns `404`.
- **Status:** `[ ]`

### T007 — `packages/collector`: Windows window-finder and screenshot capture

- **Serves:** RF02 (partial — finding/foregrounding the window), RF03, NF05
- **Files:** `packages/collector/src/windows/findWindow.ts`,
  `packages/collector/src/windows/capture.ts`,
  `packages/collector/scripts/smoke-capture.ts` (all new)
- **Do:** `findWindow(titlePattern)` (via `node-window-manager`) returns the game window's handle
  and client rect, or `null` — never throws on "not found", since `--inspect` needs to log that and
  exit cleanly (NF06). `capture(rect)` (via `@nut-tree/nut-js`'s `screen` module) returns the pixel
  buffer for a given rect. `smoke-capture.ts` is a tiny standalone script: find any window matching
  a title substring given on the CLI, foreground it, capture it, and write a PNG to disk — proof the
  native modules actually work on this machine, independent of the real game being installed.
- **Verify:** Run for real via Windows' own Node (not WSL's) over the repo's UNC path:
  `powershell.exe -Command "node \\wsl.localhost\Ubuntu\home\joaolfern\dev\snaptritor\packages\collector\scripts\smoke-capture.ts Notepad"`
  (with Notepad open) — prints the found window's rect and the saved PNG's path, and the PNG file
  exists with a non-zero size. Proves native window-finding + capture work from this exact
  environment before any game automation is attempted.
- **Status:** `[ ]`

### T008 — `packages/collector`: Windows simulated-click module

- **Serves:** RF02, NF05
- **Files:** `packages/collector/src/windows/click.ts`,
  `packages/collector/scripts/smoke-click.ts` (new)
- **Do:** `clickProportional(rect, xFraction, yFraction)` (via `@nut-tree/nut-js`'s `mouse`) moves
  to and clicks a point computed as a fraction of the given window rect — never an absolute screen
  coordinate, so it keeps working if the window moves (plan.md's design). `smoke-click.ts` opens
  (or expects open) a benign target window, e.g. Notepad, and clicks a known menu location as a
  generic proof the input simulation reaches a real window — no game involved yet.
- **Verify:** Same interop pattern as T007:
  `powershell.exe -Command "node \\wsl.localhost\...\smoke-click.ts"` with Notepad open — the
  click visibly lands (e.g. opens Notepad's File menu) and the script prints success. This is a
  manual-eyes-on check since "a menu opened" has no clean stdout signal; note in the run log what
  was observed.
- **Status:** `[ ]`

### T009 — Checkpoint: tune real navigation against the game

- **Serves:** RF02
- **Files:** none yet — this produces the concrete constants T010 needs
  (`packages/collector/src/navigation.ts`'s click sequence and landmark region)
- **Do:** Ask the user to launch Marvel Snap on the PC and leave it at the main menu. Using T007's
  capture script and T008's click module interactively (a short throwaway script, run step by step),
  find: the click sequence from main menu to Shop → Cards as fractions of the window rect, and a
  small region that reliably looks different between "still loading" and "shop loaded" (the
  landmark T010's polling loop watches). Record both as constants.
- **Verify:** The user confirms the recorded click sequence actually lands on Shop → Cards when
  re-run from the main menu, and that the chosen landmark region visibly changes between the
  loading and loaded states (shown by capturing both and comparing by eye).
- **Status:** `[ ]`

### T010 — `packages/collector`: wire `--inspect` end to end

- **Serves:** RF02, RF03, RF04, RF05, RF06, RF10, NF06
- **Files:** `packages/collector/src/inspect.ts`, `packages/collector/src/cli.ts` (new)
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
- **Status:** `[ ]`

### T011 — `packages/collector`: wake-capable Scheduled Task registration

- **Serves:** RF01, RF12, Q06 (self-wake)
- **Files:** `packages/collector/src/scheduler.ts`,
  `packages/collector/scripts/smoke-schedule.ts` (new)
- **Do:** Wraps `schtasks.exe /create` (via Node's `child_process`) to register a task that runs
  `--inspect` at given times with the "wake the computer to run this task" flag set, and
  `schtasks.exe /change /disable` / `/enable` to implement the pause-wake-automation toggle RF15
  needs (this is what T012's toggle actually calls). `smoke-schedule.ts` registers a throwaway task
  one minute in the future, then deletes it.
- **Verify:** Via interop: `powershell.exe -Command "node ...\smoke-schedule.ts"` —
  `schtasks /query /tn SnaptritorSmoke` shows the task exists with `Scheduled Task State: Enabled`
  and its wake-capable property set, immediately after creation; the script's own cleanup step
  removes it and a second query confirms it's gone.
- **Status:** `[ ]`

### T012 — `packages/collector`: status window

- **Serves:** RF13, RF14, RF15
- **Files:** `packages/collector/src/ui/status.html`, `packages/collector/src/ui/main.ts`,
  `packages/collector/src/cli.ts` (default entry added)
- **Do:** An Electron `BrowserWindow` (no Chromium devtools shown) that reads `CollectorState` (T002)
  on open and renders last/next inspection time plus two toggle switches: one flips
  `inspectionPaused` and writes state back (T002's `writeState`); the other calls T011's
  enable/disable on the registered Scheduled Task directly (not just a flag `--inspect` reads,
  since `--inspect` never runs at all if the task didn't wake anything).
- **Verify:** Via interop, with Electron installed:
  `powershell.exe -Command "node ...\collector\dist\cli.js"` opens the window showing the values
  currently in `state.json`; clicking the inspection-pause toggle updates `state.json`'s
  `inspectionPaused` on disk (confirmed by reading the file after); clicking the wake-pause toggle
  changes the registered task's enabled state (confirmed by `schtasks /query`).
- **Status:** `[ ]`

### T013 — `packages/collector`: Windows installer

- **Serves:** RF11
- **Files:** `packages/collector/electron-builder.yml`, `packages/collector/package.json` (build
  script added)
- **Do:** `electron-builder` configured for an NSIS target. The install step (NSIS custom script or
  a post-install hook invoking T011's registration) creates the Scheduled Task and writes the
  initial `state.json`, so first run needs nothing from the player beyond running the installer.
- **Verify:** Via interop: `powershell.exe -Command "cd ...\collector; npm run build:installer"`
  produces `dist/Snaptritor Setup <version>.exe` with a non-zero size. Actually running the
  installer end to end on a clean account is not exercised by this task (no clean test account
  available) — note that residual risk rather than claim it's covered.
- **Status:** `[ ]`

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
- **Status:** `[ ]`

### T015 — `packages/client`: app shell and subscribe flow `[parallel-safe with T014]`

- **Serves:** RF08, RF09
- **Files:** `packages/client/src/app.ts`, `packages/client/index.html` (new)
- **Do:** A subscribe button that requests notification permission, creates a `PushSubscription`
  via the browser's Push API, and `POST`s it to the Worker's `/subscriptions` (T003). The main view
  fetches `GET /inspections/latest` and displays the image.
- **Verify:** `pnpm --filter client build` succeeds (typecheck + bundle). End-to-end subscribe →
  receive → display is only provable on a real device, deferred to T017.
- **Status:** `[ ]`

### T016 — Checkpoint: Cloudflare account, bindings, VAPID keys, deploy

- **Serves:** RF06, RF07, Article 8
- **Files:** none from here — fills in real values T003's `wrangler.toml` left as placeholders
- **Do:** Ask the user to log into (or create) a Cloudflare account and authorize `wrangler`. Create
  the real KV namespace and R2 bucket, generate a VAPID keypair, and store it with
  `wrangler secret put VAPID_PRIVATE_KEY` (Article 8 — never in the repo). Deploy the Worker.
- **Verify:** `pnpm --filter worker exec wrangler deploy` succeeds; a manual `curl` `POST` to the
  deployed `/subscriptions` with a real browser-generated subscription returns `201`; subscribing a
  real device and manually `POST`ing a test image to `/inspections` results in an actual push
  notification arriving (the first real end-to-end proof of RF07).
- **Status:** `[ ]`

### T017 — Checkpoint: wrap the client as a TWA and install on the user's phone

- **Serves:** RF08, RF09
- **Files:** none from here — Android/TWA packaging config, added once this checkpoint starts
- **Do:** Ask the user for an Android device to install on, and confirm they're fine generating a
  signing key for the TWA (Bubblewrap or Android Studio). Wrap T015's PWA, install it, subscribe,
  and confirm a real push notification shows the screenshot inline (ties together T014's `image`
  option end to end on a real device).
- **Verify:** The user confirms a test notification arrived on their phone and showed the image
  without needing to tap it first.
- **Status:** `[ ]`

### T018 — Checkpoint: confirm wake-timer support and schedule cadence

- **Serves:** RF01
- **Files:** `packages/collector/src/scheduler.ts` (the real schedule times, once known)
- **Do:** Ask the user to check their BIOS/firmware for RTC/ACPI wake-timer support (Q03) — not
  full Wake-on-LAN, just the narrower setting the self-wake Scheduled Task needs — and to confirm
  how often they want inspection to run (Q02): a fixed schedule (e.g. three times a day) is the
  simplest default if they have no preference.
- **Verify:** The user confirms wake timers are enabled (or what they found), and states the
  cadence they want; T011's registration is updated with the real times if they differ from the
  placeholder used during T011's own testing.
- **Status:** `[ ]`
