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

### Install flow and the client's domain (2026-10-15)

The user specified the real onboarding sequence (`specs/001-shop-rotation-notifier/spec.md`'s
scenario 8, RF16–RF18): the client PWA is served from **`snaptritor.nosnocabo.com.br`** — the
user's own domain, not a `*.workers.dev`/`*.pages.dev` default. A first-time visitor opens that
page on their phone, allows notifications, and sees a short pairing code plus a Windows-installer
download link while the page shows "not linked"; installing and entering that code once flips it
to "linked". The Worker serves the installer itself (`GET /download/collector`, same pattern as
`/images/:key` — no separate static host needed for the binary). Provisioning the custom domain is
part of the T016 Cloudflare checkpoint, not yet done.

One consequence worth noting early: a native Windows app can ask the OS's own Task Scheduler to
wake the machine for a scheduled task, which may remove the need for an externally-sent
Wake-on-LAN packet entirely (nothing in the original doc ever named what would send one). This is
flagged as Open Question Q06 in the `001` spec rather than decided here.

### Running and installing Windows-native code from here (validated — do not re-derive)

This session (a Claude Code session running in WSL) can actually drive real Windows-native code,
not just write it — useful, with real limits worth knowing before re-discovering them:

- **Interop works, but quote your UNC paths carefully.** `powershell.exe -Command "..."` and
  `cmd.exe /c "..."` both run from WSL. The repo is reachable from Windows at
  `\\wsl.localhost\Ubuntu\home\joaolfern\dev\snaptritor`. Inside a *double-quoted bash* string,
  each literal backslash you want PowerShell to see needs **two** backslashes in the bash source
  (bash's own double-quote escaping eats one level) — so a UNC path's leading `\\` needs `\\\\` in
  the bash command string. Get this wrong and PowerShell silently resolves to the wrong path rather
  than erroring.
- **PowerShell can't `Set-Location`/`cd` directly into a raw UNC path** ("Current directory cannot
  be set" is the symptom, though it may also silently stay in its previous directory instead of
  erroring — always echo `(Get-Location).Path` to confirm where a script actually ran). Map a
  PSDrive first: `New-PSDrive -Name S -PSProvider FileSystem -Root '\\wsl.localhost\Ubuntu\...'
  -Scope Global`, then `Set-Location S:\...` — and the drive only lives for that one
  `powershell.exe` process, so map-and-use has to happen in the same invocation every time.
  `cmd.exe`'s `pushd` (which normally auto-maps UNC paths) and `net use` both failed against
  `wsl.localhost` specifically on this machine — PowerShell's own FileSystem provider is the
  reliable path in.
- **`npm install` cannot run from a UNC-backed directory at all** if the package has a native
  postinstall/rebuild script. The script shells out via `cmd.exe`, which refuses a UNC working
  directory outright — this breaks even though plain file reads/writes and `node some-script.ts`
  over the same UNC path work fine. The fix: `npm install` into a real local Windows path (e.g.
  `C:\Users\<user>\<scratch-dir>`), then `robocopy` the resulting `node_modules` onto the repo's
  UNC path — a plain file copy isn't affected by the cmd.exe/UNC limitation, only build scripts are.
  **`npm run <script>` hits this exact same wall for the same reason** (npm always shells a
  package.json script out through its own `cmd.exe`, not just install hooks) — confirmed live:
  `npm run build:ui` over the `New-PSDrive` bridge failed with "Não há suporte para caminhos UNC",
  while running the script's own two commands directly via `powershell.exe -Command "node ..."`
  (no `npm run` in between) succeeded immediately. The `package.json` scripts are still correct and
  useful for a real local-path install (where this never comes up) — only invoking them *through
  this WSL/UNC interop bridge specifically* needs the direct-command workaround.
- **A native module's `node_modules` must be an ancestor of whatever imports it.** Node's ESM
  resolution walks up parent directories only — a sibling folder's `node_modules` is invisible.
  This is why Windows-native automation code lives under `packages/collector/native/` as a
  self-contained unit (own `package.json`, own `node_modules`) rather than inside
  `packages/collector/src/`: `native/` is deliberately nested one level deeper than
  `pnpm-workspace.yaml`'s `packages/*` glob matches, so a WSL-side `pnpm install` never touches it
  and can't clobber its Windows-compiled bindings with Linux ones. Install/update it only via the
  local-path-then-robocopy pattern above, never via the root `pnpm install`.
- **Node 25.6.1 on Windows runs `.ts` files directly**, no build step — but unlike a bundler, it
  does not resolve a `.js` import specifier to a sibling `.ts` file. Relative imports between these
  native `.ts` files must use the literal `.ts` extension (`from "./capture.ts"`), not `.js`.
- **A library's published docs can lag its actual installed version.** `nutjs.dev`'s examples
  describe a `screen.capture(region?)` call that doesn't match `@nut-tree-fork/nut-js@4.2.6`'s real
  API at all — confirmed by reading the installed package's own `.d.ts` files, which are
  authoritative for whatever version is actually on disk. Check those before trusting fetched docs
  when something doesn't typecheck or throws a confusing runtime error.
- **A window's reported rect isn't necessarily what's visually on top of the screen there.**
  `screen.grabRegion()` captures real screen pixels at a rect, regardless of which window the rect
  belongs to — call `.focus()` on the found window (with a short settle delay) before capturing, or
  the capture silently shows whatever else happens to be on top. Verify by actually looking at the
  saved image (the `Read` tool displays PNGs), not just by checking the file exists and is
  non-empty — that check alone passed while the captured content was still wrong.
- **A pnpm workspace package's bare specifier import (`@snaptritor/shared`) does not reliably
  resolve when Node's native TS runtime loads it from Windows over the UNC path**, even though the
  exact same import resolves fine under vitest (WSL) for the same file. Two separate causes, both
  worth knowing apart:
  - Node's native TS loader doesn't reliably follow a *third-party* package's
    `"main": "./src/index.ts"` field the way a bundler (or vitest) does. Fix: import the target
    `.ts` file by a **relative path** instead of the package name, from any file that needs to
    cross this boundary (e.g. `from "../../shared/src/index.ts"`, not `from "@snaptritor/shared"`).
    Internal re-exports need the same treatment — `packages/shared/src/index.ts` itself had to
    change its own `export * from "./schemas.js"` to `"./schemas.ts"` (plus
    `"allowImportingTsExtensions": true` in every package's `tsconfig.json` that now imports a
    `.ts` path, or `tsc --noEmit` rejects it even though `node` runs it fine).
  - Once that's fixed, a *further* resolution for the package's own dependencies (e.g. `zod`,
    imported bare from `packages/shared/src/schemas.ts`) can still fail on Windows specifically:
    pnpm links a workspace package's dependencies via a relative **symlink**
    (`packages/shared/node_modules/zod -> ../../../node_modules/.pnpm/zod@.../node_modules/zod`),
    and Windows' `node.exe` does not reliably follow a WSL-created relative symlink read over the
    UNC bridge — it reports the package as simply not found. The fix used here: install a real
    (non-symlinked) copy locally on Windows (same local-path-then-robocopy pattern as the native
    modules) and robocopy it directly over the symlink at `packages/shared/node_modules/<pkg>`,
    replacing it with a real directory. **This is a local, ephemeral fix** — it lives in a
    gitignored `node_modules` and gets reset by the next `pnpm install` from WSL, so redo it
    whenever a Windows-side run of collector code needs a shared package's own dependency and hits
    this. Mid-copy, a running `wrangler dev` process watching the filesystem can log a few
    transient "could not resolve" errors as it rebuilds against a half-copied tree — check the
    final state (a plain request against the dev server) before concluding something is actually
    broken. **`robocopy` itself doesn't honor a `New-PSDrive`-mapped letter as a destination
    either** — same family of bug as the `.cmd`-wrapper issue below (yet another process that
    doesn't see the calling PowerShell session's virtual drive), confirmed live: copying onto
    `S:\...\node_modules\zod` failed ("O sistema não pode encontrar o caminho especificado") even
    though `New-Item -ItemType Directory` at that exact `S:\` path succeeded moments earlier. Fix:
    give `robocopy` the raw UNC destination (`\\wsl.localhost\Ubuntu\...`) directly, never the
    mapped drive letter.
- **A `.cmd`/`.bat` wrapper script breaks `New-PSDrive`'s mapped drive, even though plain `node.exe`
  doesn't.** `New-PSDrive -Scope Global` (used to work around PowerShell's `Set-Location` not
  accepting a raw UNC path) is a **PowerShell-session-local virtual drive** — invisible to any
  child *process* PowerShell spawns, which only affects PowerShell's own provider-level cmdlets.
  Running a plain executable from inside the mapped directory works fine (the resolved path is
  handed to the child process directly). But `electron.cmd` (npm's generated Windows shim, same
  pattern as `schtasks`'s batch wrappers) internally spawns its *own* `cmd.exe`, and that fresh
  process doesn't know about the S: drive at all — it falls back to the real OS-level working
  directory, hits the UNC path, and fails with the exact same "UNC paths not supported" error all
  over again, despite `(Get-Location).Path` printing the correct mapped path right before it.
  **Fix: call the real binary directly** (`node_modules\electron\dist\electron.exe`, not
  `node_modules\.bin\electron.cmd`), bypassing the wrapper layer entirely.
- **Electron's GPU process fails to launch on this machine** (`GPU process launch failed:
  error_code=18`, fatal) with default settings. Needed two command-line switches, set via
  `app.commandLine.appendSwitch(...)` *before* `app.whenReady()`: `disable-gpu` and `no-sandbox`.
  `no-sandbox` disables Chromium's process sandboxing — a real security trade-off in general, but a
  low-risk one here specifically: this app only ever renders its own local HTML, never third-party
  or remote content. Likely a driver/security-software interaction specific to this machine, not an
  Electron bug — but since the collector only ever runs on this exact machine, these flags are
  simply required, not optional-for-cleaner-setups.
- **A second, independent rendering problem looks identical to the GPU crash but isn't: a
  perfectly healthy window stays permanently blank (chrome visible, content area white, no error
  logged anywhere).** This is a *separate* bug from the fatal GPU crash above and needs a different
  fix — more GPU flags do nothing for it. Root cause: Electron's default `show: true` paints the
  window with its native blank backing color before the first real frame composites; on this
  machine's constrained rendering path, no later repaint ever actually gets presented, so it just
  stays blank forever even though the renderer process is alive and the DOM is correct (confirmed
  by forwarding `console-message` events into the main process's log — the page's own JS was
  running fine). Fix: construct `BrowserWindow` with `show: false`, then
  `win.once("ready-to-show", () => { win.show(); win.focus(); })`. Ruled out "Electron just can't
  render on this machine at all" by comparing against VS Code (also Electron-based), which rendered
  normally side-by-side in the same screenshot.
- **Showing a window does not give it OS-level keyboard focus, even combined with the fix above.**
  `win.focus()` right after `win.show()` is still necessary — without it, `document.activeElement`
  stays `BODY` and typed keystrokes go nowhere.
- **A preload script written as plain `.ts`/`.js` fails with `SyntaxError: Cannot use import
  statement outside a module`, even though the rest of the package has `"type": "module"` in its
  `package.json`.** Electron's preload loader does not execute ESM, full stop — the root
  `package.json`'s module type is irrelevant to it. Fix: name the source file `preload.cts`
  (TypeScript's dedicated "always compile as CommonJS regardless of surrounding config" extension)
  so `tsc` emits `preload.cjs`, and point `webPreferences.preload` at the `.cjs` output.
- **The HTML `autofocus` attribute does not reliably take effect in this renderer context**
  (confirmed live: `document.activeElement` stayed `BODY` with it present). Don't rely on it for an
  input that needs to receive typed input immediately on view-switch — call `.focus()` on the
  element explicitly from JS instead (e.g. right when a view becomes visible).
- **Simulated clicks (`nut-js`) landed on the wrong element despite correct-looking coordinate math
  — not a DPI issue (`window.devicePixelRatio` was confirmed `1`).** The actual cause: a constant
  **31px offset** between the two coordinate systems in play. `nut-js`'s capture/click APIs work in
  physical pixels relative to the *full window rect* (title bar included); Chromium's own
  `getBoundingClientRect()` reports CSS pixels relative to the *content viewport* (title bar
  excluded). Clicking at a raw `rect.x / rect.y` against the full window rect was consistently
  31px low. Fix/methodology: forward `console-message` to the main process, `console.log` the
  target element's `getBoundingClientRect()` from the renderer, and compute the physical click
  target as `(cssX) / window.width, (cssY + 31) / window.height` (31 ≈ this machine's title-bar
  height; re-measure rather than assume the constant carries to a different window chrome/DPI).
  This technique — log the CSS rect, add the chrome offset, then click — is the reusable fix for
  any future precise click-targeting inside an Electron/Chromium window from outside the process.
- **`electron-builder` cannot cross-build the NSIS (Windows) target from WSL/Linux** without
  `wine` installed — it needs `wine` to run `rcedit` (a Windows PE-metadata editor) even when no
  code-signing certificate is configured. Confirmed live: building from WSL got through packaging
  and downloading, then failed at `⨯ wine is required`. Ran it from the Windows side instead (same
  local-path-then-robocopy pattern as every other native devDependency), passing an **absolute UNC
  `--project` path while keeping PowerShell's own location on a normal local drive** — this avoids
  `Set-Location`'s inability to `cd` into a raw UNC path without `New-PSDrive` at all, since the
  tool only needs that path as an argument, not as its process cwd.
- **`electron-builder`'s bundled `winCodeSign` helper package fails to extract on Windows** with
  "Cannot create symbolic link" (`O cliente não tem o privilégio necessário`) for files under its
  `darwin/` subfolder — an unprivileged Windows account lacks `SeCreateSymbolicLinkPrivilege`, and
  that subfolder's real macOS-signing symlinks need it just to extract, even though nothing in a
  Windows-only NSIS build ever reads that subfolder. Fix: extract the same `winCodeSign-x.x.x.7z`
  on the WSL/Linux side instead (symlink creation isn't privileged there), then `robocopy`
  everything **except** `darwin/` into
  `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-<version>\` ahead of the real
  build — electron-builder finds the pre-seeded cache and skips its own download/extract entirely.
- **7-Zip's NSIS packaging step can report a false "Duplicate filename on disk"** for two
  genuinely different, legitimately co-existing files that merely differ by case (hit with
  `mime@2.x`'s real `mime.js` + `Mime.js` pair, pulled in transitively via `nut-js` → `jimp` →
  `mime`) — but only reproduced when the build's **output directory** lived on the
  `\\wsl.localhost\...` bridge; a real local Windows path for `directories.output` (e.g.
  `C:\<scratch-dir>`) built the exact same input tree with no error. Likely a case-folding quirk
  of the 9P/UNC redirector's own directory listing, not a real collision — if a future NSIS/7-Zip
  packaging step reports a "duplicate" that looks like a legitimate case-variant pair, check
  whether the output path is UNC-backed before assuming the source package is actually broken.

## Cloudflare deployment (T016, validated — do not re-derive)

- **A `wrangler.toml` table header (`[assets]`, `[vars]`, …) silently absorbs every bare
  `key = value` line that follows it, including ones meant for the root table.** Confirmed live:
  placing `[assets]` before `kv_namespaces`/`routes` made `vitest-pool-workers` report "Unexpected
  fields found in assets field: routes,kv_namespaces,r2_buckets" and every binding came back
  `undefined` — ordinary TOML behavior, not a wrangler bug. Put every root-level `key = value`
  (`name`, `kv_namespaces`, `r2_buckets`, `routes`, …) **before** any `[table]` header.
- **A service worker registered without `{ type: "module" }` cannot contain an `export`
  statement** — the browser loads it as a classic script by default, and `export` outside a module
  is a syntax error (`Uncaught SyntaxError: Unexpected token 'export'`), which silently fails the
  whole `register()` promise with "script evaluation failed". This repo's `sw.ts` legitimately
  exports a pure function so `sw.test.ts` can test it without faking `self` — the fix is
  `navigator.serviceWorker.register("/sw.js", { type: "module" })`, not removing the export. Only
  surfaced when a real browser loaded the real deployed page; the unit tests import `sw.ts`'s
  exports directly and never exercise browser-side script-loading semantics at all.
- **Enabling R2 is two separate account-level steps, not one.** `wrangler r2 bucket create`
  succeeding (after the dashboard's "enable R2" prompt) does not mean `wrangler deploy` can bind a
  Worker to that bucket yet — it failed for several more minutes with "R2 binding error... Please
  enable R2... [code: 10136]" even with a payment method already on file and R2 Paid already
  active, and identically on both wrangler 3 and 4. Just a propagation delay for the Worker↔R2
  binding permission specifically; retrying after a few minutes with no config change succeeded.
- **A Worker `routes` entry does not create a DNS record — it only attaches the Worker to traffic
  that already reaches Cloudflare for that hostname.** A brand-new subdomain route (e.g.
  `snaptritor.nosnocabo.com.br/*`) needs its own proxied (orange-cloud) DNS record too, or the
  hostname doesn't resolve at all. The record's content is irrelevant when proxied — the Worker
  route handles real traffic, not whatever the record points to — so a placeholder `A` record
  (e.g. `192.0.2.1`) is standard practice. Expect a few minutes of flaky propagation afterward
  (alternating real `200`s and `Could not resolve host` from the same request seconds apart) before
  concluding something is actually broken.
- **The client and the Worker API are deployed as one Worker, not a separate Cloudflare Pages
  project** — `wrangler.toml`'s `[assets]` binding (`directory = "../client/dist"`) serves
  `packages/client`'s built files directly for any matching request, falling through to the
  existing `fetch` handler otherwise. `index.html` and `manifest.webmanifest` live at the client
  package root (not emitted by `tsc`), so the client's own `build` script copies them into `dist/`
  alongside the compiled JS — don't `tsc`-only build and expect the static page to be there.
- **A curl `HEAD` request against any Worker route in this codebase returns the generic JSON 404**,
  even for a route that works fine on `GET` — `index.ts`'s router only matches an exact
  `request.method === "GET"`/`"POST"`, with no `HEAD` case at all, so it silently falls through to
  the catch-all. Caused two false alarms this session (a route that looked broken via `curl -I` was
  actually fine on a plain `curl`) — always re-check with a real `GET` before concluding a route is
  down.
- **`electron-builder build --publish always` creates the GitHub Release as a draft by default.**
  Confirmed live: the installer and `latest.yml` uploaded successfully (`state: uploaded` on both),
  but `.../releases/latest/download/<name>` kept 404ing until the release was explicitly
  un-drafted and marked latest — `gh release edit <tag> --draft=false --latest`. Nothing in
  electron-builder's own CLI output mentions this; only `gh release view --json isDraft` revealed
  it. Check this after every publish, not just that the upload step logged success.

## Conventions

- Specs, code, comments and commit messages in English. The shared doc stays Portuguese.
- `packages/*` is a pnpm workspace: `shared` (contracts), `collector` (the installed Windows app),
  `worker` (Cloudflare), `client` (PWA/TWA). Packages are created when a task calls for them, not
  in advance.
