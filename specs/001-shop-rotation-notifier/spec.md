# Spec: Shop rotation notifier

- **ID:** `001-shop-rotation-notifier`
- **Status:** draft — blocked on feature `000`'s verdict for RF02 and RF10
- **Source:** the shared doc [Notificador de Loja do Marvel Snap](https://claude.ai/code/artifact/8f3c8a0e-8be1-4cd6-804b-536abe9155b2),
  requirements RF01–RF10. Requirement IDs are kept identical to the doc's so the two stay comparable.

## Problem

Marvel Snap's card shop rotates every 8 hours. To know what is on offer the player has to open a
heavy app, wait for it to load, and navigate to the shop — three times a day, mostly to find nothing
worth their Collector's Tokens. The cost is attention, not money: the rotation is missed because
checking it is tedious, and a card worth buying sits unbought for eight hours.

## Goals

- The player learns the card shop changed without opening the game.
- The notification says which cards are now on offer and what they cost, so no follow-up check is
  needed to decide whether to care.
- The whole system runs on hardware and services the player already pays for — no monthly bill.
- A rotation is reported at most once. Re-running collection must not re-notify.

## Non-goals

- Buying, freezing or reserving cards. Snaptritor reads; the player acts.
- Tracking anything but the card shop: no bundles, no daily offers, no gold vendor, no battle pass.
- More than one account or player. Single-user by design.
- A browsable history or UI. The notification is the product; there is no dashboard in v1.
- Running when the PC is unavailable. If the machine cannot be woken, that rotation is simply missed.

## User scenarios

1. **Given** the player's phone has the client installed and notifications allowed, **when** the
   card shop rotates and collection runs, **then** within a few minutes they get one notification
   naming the cards now on offer and their token costs.
2. **Given** the PC is asleep, **when** a scheduled collection time arrives, **then** the PC wakes,
   collects, and goes back to sleep without the player touching it.
3. **Given** collection runs twice against an unchanged shop, **when** the second run finishes,
   **then** no notification is sent.
4. **Given** the player taps the notification, **when** the client opens, **then** they see the
   current offer — the same data the notification carried, not a stale cache.
5. **Given** the player reinstalls or clears the client, **when** they re-allow notifications,
   **then** they start receiving them again without any server-side intervention.

## Functional requirements

| ID | Requirement |
| --- | --- |
| RF01 | Wake the PC automatically via Wake-on-LAN at scheduled times. |
| RF02 | Bring the game's shop state up to date before reading it — by whatever minimum action feature `000` proves is necessary. |
| RF03 | Read the game's local state file and extract the cards currently on offer in the card shop. |
| RF04 | Detect whether the shop changed relative to the previously collected state. |
| RF05 | Send the collected offer onward only when it changed. |
| RF06 | Store the current offer and the set of notification subscriptions. |
| RF07 | Send a push notification to every subscribed device when a new offer arrives. |
| RF08 | Let the player subscribe to notifications from the client. |
| RF09 | Show the offer — cards and costs — in the notification and in the client. |
| RF10 | Return the PC to sleep when collection finishes. |

## Non-functional requirements

| ID | Constraint | Why |
| --- | --- | --- |
| NF01 | No recurring cost. Free hosting tier; collection on the player's own PC. | Article 3. Cloud GPU instances for vision-based reading would have cost hundreds of BRL a month — the reason the JSON path was chosen. |
| NF02 | Reading must survive game UI changes. | Article 2. The data comes from state files, not the screen. |
| NF03 | The notification path stays up even when the PC is off. | The player's phone must not depend on their desktop being awake. |
| NF04 | Collection runs under WSL, reading the Windows filesystem through `/mnt/`. | The development and runtime environment. |
| NF05 | The game's files and install are never modified. | Article 4. |
| NF06 | A failed collection run is visible after the fact without a live terminal. | Runs happen while nobody is watching; silent failure is indistinguishable from "the shop did not change". |

## Acceptance criteria

- **RF01** — Given the PC is asleep and Wake-on-LAN is configured, when the scheduled time arrives,
  then the machine is awake and collection has started within 2 minutes.
- **RF02** — Given the state file is stale, when collection runs, then after RF02's step the file's
  internal `TimeUpdated` is newer than the start of the run. *(Exact mechanism — none, launch-only,
  or UI automation — is set by feature `000`.)*
- **RF03** — Given a readable state file, when it is parsed, then the result is the current card-shop
  offer as `{ cardDefId, artVariantDefId?, currencyTypeId, currencyCost, purchased, nextRefresh }[]`
  plus the module's `nextRefresh`, and an already-purchased item (which carries no reward data) is
  reported as purchased rather than failing the parse.
- **RF04** — Given a stored previous offer, when a new parse differs in the set of
  `cardDefId` + `artVariantDefId` keys, then exactly one change event is produced; an identical parse
  produces none.
- **RF05** — Given no change was detected, when the run finishes, then nothing was sent onward, and
  the run exits 0 with a log line saying so.
- **RF06** — Given an offer is accepted, when it is stored, then a later read returns it unchanged,
  and subscriptions survive redeployment.
- **RF07** — Given at least one stored subscription, when a changed offer arrives, then each
  subscription receives one notification within 60 s, and a subscription answering 404 or 410 is
  deleted rather than retried forever.
- **RF08** — Given a first-time visitor who grants permission, when they subscribe, then their
  subscription is stored and a test notification reaches the device.
- **RF09** — Given a notification for an offer, when the player reads it, then it names each card by
  its display name — not its internal `cardDefId` — with its token cost.
- **RF10** — Given collection has finished, when 1 minute has passed, then the PC is asleep, and this
  step can be disabled by configuration for debugging (Article 7).

## Open questions

| ID | Question | Blocks | Owner |
| --- | --- | --- | --- |
| Q01 | What must happen for the state file to refresh? | RF02's mechanism, RF10's timing, and whether a game launch is needed at all | feature `000` |
| Q02 | How often should collection run, and at which offsets from the 8-hour reset? The module's `NextRefresh` is in the file, so the schedule can be derived rather than fixed — is that wanted, or is a fixed 3×/day schedule enough? | RF01's schedule | user |
| Q03 | Does the motherboard and NIC support Wake-on-LAN, and is it enabled in BIOS? (doc item T06) | RF01 | user |
| Q04 | Can Web Push with VAPID be sent from the chosen host's runtime, which has no built-in push service? (doc item T05) | RF07 | me, at plan time |
| Q05 | Where do card display names come from — the game's own definition data, or a maintained mapping? `data-patch.json` is the likely source but has not been confirmed to carry localised names. | RF09 | me, at plan time |

## Dependencies

- Feature `000` must reach a verdict before this feature's `plan.md` is written. RF02 may be reduced
  or dropped entirely depending on it.
