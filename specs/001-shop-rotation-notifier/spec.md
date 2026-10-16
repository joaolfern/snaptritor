# Spec: Shop rotation notifier

- **ID:** `001-shop-rotation-notifier`
- **Status:** ready — rewritten 2026-10-15 after feature `000` concluded with a pivot: the
  collector now captures a screenshot of the shop instead of reading `ShopState.json`'s card data
  (see `specs/000-shopstate-write-trigger/findings.md`). RF02–RF04 and RF09 reflect that pivot.
  Delivery requirements (RF11–RF15, added the same day) are unaffected either way. Remaining open
  questions (Q02, Q03, Q06–Q08) are all plan-level — none block writing `plan.md`.
- **Source:** the shared doc [Notificador de Loja do Marvel Snap](https://claude.ai/code/artifact/8f3c8a0e-8be1-4cd6-804b-536abe9155b2),
  requirements RF01–RF10. Requirement IDs are kept identical to the doc's so the two stay comparable.

## Problem

Marvel Snap's card shop rotates every 8 hours. To know what is on offer the player has to open a
heavy app, wait for it to load, and navigate to the shop — three times a day, mostly to find nothing
worth their Collector's Tokens. The cost is attention, not money: the rotation is missed because
checking it is tedious, and a card worth buying sits unbought for eight hours.

The game's own local record of the shop does not reliably reflect what is actually on offer
(`specs/000-shopstate-write-trigger/findings.md`), so there is no structured data to read at all —
only the screen itself, once the shop is on it.

## Goals

- The player learns the card shop changed without opening the game.
- The notification shows what is now on offer clearly enough that no follow-up check is needed to
  decide whether to care — as a picture of the shop, not a decoded list, since nothing in the data
  path may interpret what the shop shows (constitution Article 2).
- The whole system runs on hardware and services the player already pays for — no monthly bill.
- A rotation is reported at most once. Re-running collection must not re-notify.

## Non-goals

- Buying, freezing or reserving cards. Snaptritor reads; the player acts.
- Tracking anything but the card shop: no bundles, no daily offers, no gold vendor, no battle pass.
- More than one account or player. Single-user by design.
- A browsable history of past rotations, settings beyond first-run setup, or any UI surface
  beyond the status display and two pause controls in RF13–RF15. The notification stays the
  primary channel; the desktop app's own window is a thin status/control surface, not a dashboard.
- Running when the PC is unavailable. If the machine cannot be woken, that rotation is simply missed.

## User scenarios

1. **Given** the player's phone has the client installed and notifications allowed, **when** the
   card shop rotates and collection runs, **then** within a few minutes they get one notification
   carrying a screenshot of the current shop.
2. **Given** the PC is asleep, **when** a scheduled collection time arrives, **then** the PC wakes,
   collects, and goes back to sleep without the player touching it.
3. **Given** collection runs twice against an unchanged shop, **when** the second run finishes,
   **then** no notification is sent.
4. **Given** the player taps the notification, **when** the client opens, **then** they see the
   same screenshot the notification carried, not a stale or re-captured one.
5. **Given** the player reinstalls or clears the client, **when** they re-allow notifications,
   **then** they start receiving them again without any server-side intervention.
6. **Given** the user has just run the installer on their Windows PC, **when** setup finishes,
   **then** the collector is already scheduled and needs no further action to run its first
   inspection.
7. **Given** the user opens the collector's window, **when** they look at it, **then** they see
   when it last inspected the shop and when it will next do so, and can pause inspection or pause
   the automation that wakes the PC, each with one action.
8. **Given** a first-time visitor opens the client's web page on their phone, **when** they grant
   notification permission, **then** the page shows no desktop collector is linked yet, a short
   pairing code, and a link to download the Windows installer; **when** they install it on their
   PC and enter that code once on first run, **then** the same page (reloaded or polling) shows a
   desktop collector is now linked.

## Functional requirements

| ID | Requirement |
| --- | --- |
| RF01 | Wake the PC automatically via Wake-on-LAN at scheduled times. |
| RF02 | Launch the game if it isn't already running, bring its Shop → Cards screen into view (nothing reflects the live offer without it — feature `000`), and close the game again afterward if this run is what launched it. |
| RF03 | Capture a screenshot of the shop once it is in view. |
| RF04 | Detect whether the shop changed relative to the previously captured screenshot. |
| RF05 | Send the captured screenshot onward only when it changed. |
| RF06 | Store the current screenshot and the set of notification subscriptions. |
| RF07 | Send a push notification to every subscribed device when a new screenshot arrives. |
| RF08 | Let the player subscribe to notifications from the client. |
| RF09 | Show the captured screenshot itself in the notification and in the client. |
| RF10 | Return the PC to sleep when collection finishes — but only if this run's own wake woke it; never sleep a PC the player is actively using for something else. |
| RF11 | Install the collector on Windows from a single installer, with no separate runtime or manual setup required beyond it. |
| RF12 | Keep running the collector's own schedule across reboots, with no WSL, terminal, or Claude Code session involved. |
| RF13 | Show, in the collector's own window, when it last inspected the shop and when it will next do so. |
| RF14 | Let the player pause and resume shop inspection from the collector's window. |
| RF15 | Let the player pause and resume the automation that wakes the PC, independently of pausing inspection. |
| RF16 | Show, on the client, whether a desktop collector is currently linked to this player's notification subscription. |
| RF17 | Let the player download the Windows installer directly from the client. |
| RF18 | Link the installed collector to the player's existing notification subscription automatically, with no code or manual step on either side, so RF16 reflects it. |
| RF19 | Update the installed collector to a newer version automatically, without the player re-downloading or re-running the installer by hand. |

## Non-functional requirements

| ID | Constraint | Why |
| --- | --- | --- |
| NF01 | No recurring cost. Free hosting tier; collection on the player's own PC. | Article 3. Cloud GPU instances to interpret a screenshot would have cost hundreds of BRL a month — the reason nothing in the pipeline interprets it at all. |
| NF02 | Nothing in the collector, the Worker, or the client decodes, crops-and-classifies, or otherwise interprets the screenshot's pixels — it is relayed exactly as captured. | Article 2, revised after feature `000`. |
| NF08 | The push payload itself carries only a small reference to the screenshot (a URL), never the image bytes; the notification still shows the image inline, with no tap required to see it. | Web Push payloads are size-capped (~4 KB) and are not where the image travels; the Notification API's own `image` option fetches and renders a URL inline — RF09 needs the player to see it without an extra step, and this is how that holds without hitting the payload cap. |
| NF03 | The notification path stays up even when the PC is off. | The player's phone must not depend on their desktop being awake. |
| NF04 | In production, the collector runs as an installed native Windows application — never from WSL, a terminal, or Claude Code. WSL is the development and experimentation environment only. | The shipped product runs unattended on the player's own PC long after this repo stops being touched; that is not the environment it was built in. |
| NF05 | The game's files and install are never modified. | Article 4. |
| NF06 | A failed collection run is visible after the fact without a live terminal. | Runs happen while nobody is watching; silent failure is indistinguishable from "the shop did not change". |
| NF07 | The collector's background footprint is negligible between scheduled inspections. | Article 7's "minimal maintenance" extends to the player's machine — an always-running app has to be cheap to leave on. |

## Acceptance criteria

- **RF01** — Given the PC is asleep and Wake-on-LAN is configured, when the scheduled time arrives,
  then the machine is awake and collection has started within 2 minutes.
- **RF02** — Given the game is not running, when an inspection starts, then the collector launches
  it and waits for it to load before driving it; given it is running, then it is driven as-is.
  Either way, the Shop → Cards screen ends up visibly on screen and fully loaded (no spinner, no
  error), confirmed the same way a person would confirm it — by what is on screen, not by a file.
  When the run finishes (success or failure), a game this run launched is closed again; a game the
  player already had open is left alone. Corrected 2026-10-15 by the user: the scope was always
  "wake the PC, get the info, put it back" — the earlier "given the game is launched" wording
  silently made the unattended case impossible, since nothing is running after a wake from sleep.
- **RF03** — Given the shop is in view, when the collector captures it, then the result is an image
  of that screen (or the relevant region of it), timestamped, with no text or card identity decoded
  out of it anywhere in the pipeline.
- **RF04** — Given a stored previous screenshot, when a new one is captured, then a visual
  difference between the two produces exactly one change event; an identical capture (down to
  cosmetic noise the comparison is tolerant of) produces none.
- **RF05** — Given no change was detected, when the run finishes, then nothing was sent onward, and
  the run exits 0 with a log line saying so.
- **RF06** — Given a screenshot is accepted, when it is stored, then a later read returns the same
  image unchanged, and subscriptions survive redeployment.
- **RF07** — Given at least one stored subscription, when a changed screenshot arrives, then each
  subscription receives one notification within 60 s, and a subscription answering 404 or 410 is
  deleted rather than retried forever.
- **RF08** — Given a first-time visitor who grants permission, when they subscribe, then their
  subscription is stored and a test notification reaches the device.
- **RF09** — Given a notification for a captured shop, when the player opens it, then the
  screenshot itself is visible — full enough to judge the offer at a glance — with no caption
  claiming to name cards or costs that were never decoded.
- **RF10** — Given collection has finished and this run's own wake trigger is what woke the PC,
  when 1 minute has passed, then the PC is asleep; given collection finished but the PC was already
  awake before this run started (the player using it for something else), then the PC is left
  awake. Either way, this step can be disabled by configuration for debugging (Article 7).
- **RF11** — Given a Windows PC with no prior Snaptritor component installed, when the installer is
  run once and any first-run setup (e.g. pairing with the notification subscription) is completed,
  then the collector is present and will run its next scheduled inspection unassisted.
- **RF12** — Given the collector was installed and the PC is later rebooted, when the next scheduled
  time arrives, then inspection runs with no WSL, terminal, or Claude Code involved.
- **RF13** — Given the collector has run at least one inspection, when the player opens its window,
  then it shows the timestamp of the last inspection and of the next scheduled one.
- **RF14** — Given inspection is paused, when a scheduled time arrives, then no inspection runs and
  the "next inspection" display reflects the pause rather than showing a time that will not happen.
- **RF15** — Given wake automation is paused and a scheduled time arrives while the PC is asleep,
  then the PC is not woken; resuming it restores the normal schedule without reinstalling.
- **RF16** — Given no collector has ever linked itself, when the client page loads, then it shows
  "no desktop linked"; given one has, then it shows linked (reasonably current — polling or a
  reload is enough, no live-socket requirement).
- **RF17** — Given the client page, when the player looks for it, then a download link for the
  Windows installer is present and works, with no separate site or account needed to reach it.
- **RF18** — Given a pairing code shown on the client (RF16), when the player enters it once in the
  collector on first run, then the client's "linked" status reflects it; given an expired or
  already-used code, then the collector reports that clearly rather than silently failing or
  claiming a stale link.
- **RF19** — Given a newer version of the collector is published, when the installed collector next
  checks, then it downloads and applies the update without the player visiting the client page or
  running an installer again; a check that finds no newer version changes nothing and reports no
  error. Added 2026-10-15, after a worker-URL fix required a manual reinstall to actually reach a
  running install — exactly the friction this closes.

## Open questions

| ID | Question | Blocks | Owner |
| --- | --- | --- | --- |
| Q01 | ~~What must happen for the state file to refresh?~~ Resolved by feature `000`: nothing makes it refresh under normal play; the collector must bring the Shop → Cards screen into view itself, every run, by simulated input (RF02). | — | resolved |
| Q02 | ~~How often should collection run, and at which offsets from the 8-hour reset?~~ Resolved by the user (2026-10-15): the daily reset is 19:00 UTC (16:00 BRT), with featured/spotlight rotating every 8h from that same anchor — boundaries at 16:00/00:00/08:00 BRT. Collection runs 10 minutes after each, fixed 3×/day — no need to learn the boundary dynamically. | RF01's schedule | resolved |
| Q07 | ~~How should the collector reliably get from "game launched" to "Shop → Cards is visibly loaded"?~~ Approach chosen in `plan.md`: simulated clicks proportional to the game window's own rect (not absolute screen coordinates), confirmed loaded by polling a visual landmark with a timeout rather than a fixed delay. Exact landmark and click coordinates are tuned during `/implement` against the real game, not decided here. | RF02 | resolved — tuning at `/implement` |
| Q08 | ~~How is the screenshot compared for RF04?~~ Approach chosen in `plan.md`: a perceptual hash with a tunable Hamming-distance threshold, stored in `CollectorState` so it can be adjusted without reinstalling. The actual threshold is tuned during `/implement` against real captures. | RF04 | resolved — tuning at `/implement` |
| Q09 | ~~Does the notification carry the image directly, or a link to it?~~ Resolved: the push payload carries a URL; the notification's `image` option fetches and renders it inline (standard, long-supported platform behaviour — not a real unknown). Still open for `plan.md`: where that URL is hosted — Cloudflare R2 alongside KV/D1 is the obvious free-tier fit, but worth confirming against a real screenshot's file size. | RF07, RF09, NF08 | resolved; hosting choice at plan time |
| Q03 | ~~Does the motherboard/firmware support RTC wake timers, and are they enabled in BIOS?~~ Resolved by the user (2026-10-15): confirmed live on the real machine (ASUS TUF Gaming B550M-PLUS, UEFI 2.20.1271) under Advanced → APM Configuration — "Power On By RTC" is `Enabled` and "ErP Ready" is `Disabled` (ErP compliance mode disables deep-wake features when left enabled, so this specifically had to be checked, not assumed). The BIOS's own RTC Alarm Date/Hour/Minute/Second fields are a separate, unrelated fixed-wake-time feature — not needed here, since Windows' own Task Scheduler programs its wake timer dynamically (already confirmed live in T011: `WakeToRun: true` on the registered task). | RF01 | resolved |
| Q04 | ~~Can Web Push with VAPID be sent from the chosen host's runtime?~~ Resolved: Cloudflare Workers implement the same `SubtleCrypto` Web Crypto API browsers do, which covers VAPID's ECDSA signing and the Web Push encryption (AES-GCM, HKDF) with no extra service. (doc item T05) | RF07 | resolved |
| Q05 | ~~Where do card display names come from?~~ Moot — RF09 now shows the raw screenshot, not decoded names. | — | resolved |
| Q06 | ~~Should PC wake use OS self-wake instead of an externally-sent Wake-on-LAN packet?~~ Resolved in `plan.md`: self-wake, via the Scheduled Task's own "wake this computer" flag. Removes the undefined "who sends the packet" problem entirely; RF15's pause toggle disables that flag directly. | RF01, RF15 | resolved |
| Q10 | ~~How does RF18's "linking" actually work, mechanically?~~ Resolved by the user: a short pairing code. The client requests one after the player subscribes (RF08) and displays it alongside "not linked yet"; the installer/collector asks for it once on first run and sends it to the Worker to claim. Guards against a leaked download link silently claiming someone else's subscription — the code expires after a short window. | RF16, RF18 | resolved |

## Dependencies

- Feature `000` is concluded (`specs/000-shopstate-write-trigger/findings.md`). Its outcome is
  folded into this spec directly — RF02 is now mandatory UI automation, not conditional, and
  RF03/RF04/RF09 are rewritten around a screenshot rather than parsed card data. `plan.md` for this
  feature can be written without re-opening the question.
- Packaging and UI framework for the Windows installer (RF11–RF15), the UI-automation mechanism
  (Q07), the comparison tolerance (Q08), and image delivery (Q09) are all plan-level decisions —
  `plan.md` names the technology once written; this spec states only the observable behaviour.
