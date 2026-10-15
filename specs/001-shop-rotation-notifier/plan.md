# Plan: Shop rotation notifier

- **Spec:** `./spec.md` (status: ready)
- **Status:** approved — tasks.md written from it

## Chosen approach

Three packages, one shared contract, no persistent process anywhere. The collector is an Electron
app (TypeScript, matching the user's "one language end to end" choice for collector + Worker) with
**two entry points sharing one binary**: a headless `--inspect` run that Windows' own Task
Scheduler launches at scheduled times, and an on-demand window the player opens from the Start Menu
to see status and flip the two pause toggles. There is no tray icon and no always-running daemon —
between inspections, nothing of this project is running on the PC at all, which satisfies NF07 more
strongly than "negligible footprint" asks for for free, and keeps Article 7's "runnable without the
house" true by construction: `--inspect` is just a CLI invocation, testable on demand.

`--inspect` does five things in order: check `CollectorState.inspectionPaused` and exit immediately
if set; bring the already-running game's window to the foreground and drive it to Shop → Cards by
simulated mouse input, using the window's own client rect (not absolute screen coordinates) so it
works regardless of where the window sits; confirm the screen finished loading by matching a known
visual landmark instead of a fixed delay; capture that region; and compare its hash against the
last stored one, uploading to the Worker only when it changed. The Worker's job stays deliberately
small: accept an image, store it in R2 with its metadata in KV, and fan out Web Push to every
stored subscription. The client's service worker shows the image inline via the Notification API's
own `image` option — no tap needed to see it (resolves Q09, already in `spec.md`).

PC wake uses the Scheduled Task's own "wake this computer to run this task" capability rather than
an externally-sent Wake-on-LAN packet (resolves Q06): the installed app schedules its own wake, so
there is nothing else on the network that needs to exist to send a magic packet, and the task is
what the pause-wake-automation toggle (RF15) directly enables or disables.

## Constitution check

| Article | Holds? | Note |
| --- | --- | --- |
| 1 — Spec before code | Yes | `spec.md` status `ready`; no source file for this feature exists yet. |
| 2 — No interpretation of pixels | Yes | The screenshot is relayed byte-for-byte from collector → Worker → client. The only pixel-level step is the change-detection hash (a similarity *measurement*, not content interpretation — no OCR, no model, same category as a checksum, which is explicitly the article's own carve-out). |
| 3 — Zero recurring cost | Yes | Workers, KV and R2 all stay on Cloudflare's free tier at this volume (a handful of images a day); Electron, the automation library and the hashing code are all OSS; Task Scheduler and wake timers are OS-built-in. See External dependencies for the free-tier ceiling each sits under. |
| 4 — Collector never writes to game files | Yes | Automation is simulated mouse input only — the article's own revision explicitly allows this. No game file is read, written, or had its process memory touched. The window's position/size is only *read*, never forced, so no game setting is touched either. |
| 5 — Contract first | Yes | `packages/shared` holds every schema crossing a boundary (`InspectionSubmission`, `PushSubscriptionRecord`, `CollectorState`); collector and Worker both import it, never re-declare it. |
| 6 — Traceability | Set up here, enforced by `/tasks` | Components and data flow below map every RF/NF to a package; `/tasks` assigns a requirement ID to each task from that mapping, so nothing lands without one. |
| 7 — Runnable without waiting on the house | Yes | `--inspect` runs on demand from the CLI against either the live game or a stored screenshot fixture (for testing the diff/upload path without touching the game at all); Task Scheduler, the wake timer, and the eventual sleep are all outside this core path and can each be disabled independently. |
| 8 — Secrets never land in the repo | Yes | VAPID keys live in `wrangler secret`. The collector's own Worker-URL + API secret (so a stranger can't POST fake inspections) are injected at **build** time from an env var into the installer, never committed — the shipped binary carrying a secret is not the repo carrying one. |

## Components and data flow

```
packages/shared          Zod schemas only: InspectionSubmission, PushSubscriptionRecord,
                          CollectorState. Imported by collector and worker.  [Article 5]

packages/collector        Electron app, TypeScript. One installed binary, two entry points:

  `--inspect` (headless)  RF02–RF06, RF10, RF14
                          1. read CollectorState; if inspectionPaused, log + exit 0
                          2. foreground the game window (by title), read its client rect
                          3. simulated-click through to Shop → Cards, proportional to that rect
                          4. poll a known visual landmark until the screen has settled (not a
                             fixed delay) — times out to a logged failure, never a half-loaded
                             capture
                          5. capture that region
                          6. hash it; compare to CollectorState.lastImageHash
                          7. unchanged → update lastInspectionAt/nextInspectionAt, exit 0
                          8. changed → POST image + hash to the Worker, then update state
                          9. let the machine go back to sleep (RF10) — but only if this run's own
                             wake is what woke it; a PC already awake for other reasons is left
                             alone. Either way, skippable for debugging

  default / status window RF13–RF15
                          Reads the same CollectorState file. Shows last/next inspection time.
                          Two toggles: inspectionPaused (a flag `--inspect` checks at its own
                          start); wakeAutomationPaused (calls into Task Scheduler to disable/
                          re-enable the registered task's wake-capable flag directly — this is
                          what actually stops the PC being woken, not a flag `--inspect` reads,
                          since `--inspect` never runs at all if the task didn't wake anything).

Installer (electron-builder → NSIS .exe)                                    RF11, RF12
                          Registers the Scheduled Task (wake-capable, runs `--inspect` on the
                          chosen cadence) and writes the initial CollectorState. No other setup:
                          the Worker URL and API secret are baked in at build time, not asked of
                          the player.

packages/worker           Cloudflare Worker, TypeScript.                     RF06, RF07
  POST /inspections        auth by the baked-in secret; validates InspectionSubmission; stores
                            the image in R2, metadata in KV; fans out Web Push (VAPID) to every
                            stored subscription; drops a subscription that answers 404/410
  POST /subscriptions      RF08 — stores a PushSubscriptionRecord from the client
  GET  /inspections/latest RF09 (client side) — latest image's metadata + R2 URL

packages/client            PWA/TWA, TypeScript.                              RF08, RF09
  service worker           `push` event → `showNotification(title, { image: <R2 url> })` —
                            renders inline, no tap needed (Q09, resolved in spec.md)
  app shell                `notificationclick` → open, fetch GET /inspections/latest, show it
```

## Data contracts

All in `packages/shared/src/inspection.ts`, as Zod schemas (Article 5):

```ts
export const InspectionSubmission = z.object({
  capturedAt: z.string().datetime(),   // ISO 8601 UTC
  imageHash: z.string(),               // the collector's own change-detection hash, sent so the
                                        // Worker can skip re-deriving it, not trusted as the
                                        // sole dedup gate — the Worker still compares it to the
                                        // last hash it stored before fanning out
});
// image bytes travel as the request body, not inside this JSON.

export const PushSubscriptionRecord = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  createdAt: z.string().datetime(),
});

export const CollectorState = z.object({
  lastInspectionAt: z.string().datetime().nullable(),
  nextInspectionAt: z.string().datetime().nullable(),
  inspectionPaused: z.boolean(),
  wakeAutomationPaused: z.boolean(),
  lastImageHash: z.string().nullable(),
  lastError: z.string().nullable(),      // NF06 — a failed run is visible without a terminal
});
```

A submission that fails `InspectionSubmission.parse()` at the Worker is rejected `400` and nothing
is stored — the collector's own `--inspect` logs that rejection into `CollectorState.lastError`
(NF06) rather than retrying blindly.

## External dependencies

| Dependency | Version | Why this one | Cost |
| --- | --- | --- | --- |
| Electron | latest stable (33.x) | One TypeScript codebase for the installed app; `electron-builder` gives the NSIS `.exe` installer (RF11) for free. | Free, OSS |
| electron-builder | latest | Builds the installer and registers app metadata Windows expects. | Free, OSS |
| `@nut-tree-fork/nut-js` | ^4.2.6 | Simulated mouse input, screen capture, *and* window-finding (`getWindows`) all in one dependency — verified during `/implement` (T007) that it covers window-finding by itself, so no separate window-management library is needed. Apache-2.0; the original `@nut-tree/nut-js` scope is abandoned (404s), this community fork is the actively maintained one. | Free, OSS |
| zod | latest | The shared contract (Article 5). | Free, OSS |
| Cloudflare Workers | — | Backend compute. | Free tier (well under its request volume at a few runs/day) |
| Cloudflare KV | — | Subscription + inspection metadata. | Free tier |
| Cloudflare R2 | — | Screenshot object storage; resolves Q09's hosting half. | Free tier (10 GB storage, no egress fee — orders of magnitude more than a few images a day need) |
| Web Crypto (`SubtleCrypto`, built into the Workers runtime) | — | VAPID JWT signing (ECDSA P-256) + Web Push payload encryption (AES-GCM, HKDF) — resolves Q04: Workers implement the same `SubtleCrypto` browsers do, which covers everything Web Push needs with no extra library. | Free, built-in |
| Windows Task Scheduler (`schtasks.exe` / its COM API), "wake this computer" flag | OS built-in | Scheduling and self-wake (resolves Q06) — no external Wake-on-LAN sender needed. | Free, built-in |

## Risks and fallbacks

| Risk | Likelihood | If it happens |
| --- | --- | --- |
| Automation can't reliably tell "Shop → Cards fully loaded" from "still loading" (Q07) | Medium | Poll a stable visual landmark with a timeout rather than a fixed delay; a timeout is a logged failure (NF06) and a skipped run, never a half-loaded capture. |
| The hash comparison (Q08) is too strict (animation/frame noise causes false "changed" notifications) or too loose (misses a real rotation) | Medium | Start with a coarse perceptual hash and a tunable Hamming-distance threshold stored in `CollectorState`, adjustable without reinstalling; tune against real captures during `/implement`. |
| Firmware wake timers disabled in BIOS (the residual form of Q03/Q06) | Medium | The scheduled task simply won't wake the PC; this is a one-line BIOS setting to document, not a design problem — and the collector still runs fine on any slot where the PC happens to already be awake. |
| A game update moves the Shop → Cards navigation path or its loading landmark | Medium | Was true of the old JSON-parsing design too, just moved to a different brittle surface; the navigation steps live behind one module so a game update is a one-file fix, and NF06 surfaces the break immediately instead of silently notifying nothing. |
| Electron's own startup cost makes a few-second `--inspect` run heavier than a minimal CLI would be | Low | Accepted: the process fully exits when the run finishes, so the cost is transient CPU/RAM a handful of times a day, not a standing footprint — satisfies NF07 as written even though Electron isn't the leanest runtime available. |
| A captured screenshot is larger than expected | Low | Downscale/compress before upload (PNG → JPEG, cap dimensions); R2's free-tier ceiling has enormous headroom at this volume regardless. |

## Rejected alternatives

- **Tauri/Rust for the collector.** Leaner idle footprint, but splits the stack into Rust + TS when
  the user explicitly chose one language end to end for collector and Worker. With no persistent
  process between runs (this plan's actual design), Electron's heavier runtime only costs anything
  while `--inspect` is actively running, which removes most of Tauri's advantage here.
- **A persistent tray daemon, always running while logged in.** Simpler mental model, but it is an
  always-on process the player has to trust and account for, for no benefit RF13–RF15 actually
  need — "show status when opened" doesn't require "always resident." Rejected in favor of
  Task-Scheduler-invoked one-shot runs plus an on-demand window, which gets to zero footprint
  between inspections instead of merely "negligible."
- **External Wake-on-LAN (a magic packet) for RF01.** The original doc never named what would send
  one, and solving that would mean a second always-on device on the LAN. The OS's own wake-capable
  Scheduled Task needs only firmware RTC wake support — common — and nothing else on the network.
- **Embedding the screenshot directly in the push payload.** Impossible at any useful image quality
  under Web Push's ~4 KB payload cap. Already resolved in `spec.md` (Q09): a URL plus the
  Notification API's `image` option instead.
- **Querying `shop_runtime_url` directly instead of screenshotting.** The other option feature
  `000` raised; the user chose screenshots, so the ToS exposure of querying the game's own
  undocumented endpoint was never taken on.
