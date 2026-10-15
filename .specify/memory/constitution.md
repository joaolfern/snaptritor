# Snaptritor Constitution

These articles outrank any spec, plan, task or convenience. A plan that violates one is
rejected at review, not negotiated. Amending an article is a deliberate act: edit this file
in its own commit, with the reason in the commit message.

## Article 1 — Spec before code

No source file is written for a feature that has no `spec.md`. Behaviour changes start in the
spec, then the plan, then the tasks, then the code. A bug fix that changes documented behaviour
is a spec change; a bug fix that restores documented behaviour is not.

## Article 2 — JSON is the only source of truth

The shop rotation is read from the game's local state files. No screen capture, no OCR, no
computer vision, no LLM anywhere in the data path. This was chosen deliberately over
vision-based reading: it costs nothing to run and does not break when the game's UI changes.

## Article 3 — Zero recurring cost

Cloudflare's free tier only. No paid push provider, queue, database or compute. Collection runs
on hardware already owned and already powered. Any proposal that carries a monthly bill is
rejected at plan review, however small the bill.

## Article 4 — The collector never writes to game files

Game state is opened read-only and copied before parsing. The game's install directory is never
modified, no code is injected into the game process, and no file under
`AppData/LocalLow/Second Dinner` is created, moved or deleted. If a step appears to need a write,
the step is wrong.

## Article 5 — Contract first

The shop payload exists once, as a schema in `packages/shared`, imported by both the collector
and the Worker. Neither side hand-rolls its own shape of the same data, and neither parses the
other's JSON without validating it against that schema. The contract changes in one place or
not at all.

## Article 6 — Traceability

Every task cites the requirement ID it serves (`RF01`…`RF10`, or the spike ID for experiments).
Every requirement has at least one task. An orphan on either side — a task serving nothing, a
requirement nobody implements — fails review.

## Article 7 — Runnable without waiting on the house

The collector's core logic runs end-to-end on demand — from the CLI during development, from its
own window once installed — against a fixture or the live file. Waking the PC, the scheduler and the
suspend-at-end step are outer layers that can each be switched off. Debugging never requires waiting
eight hours for a shop rotation, and never requires the PC to be asleep first.

## Article 8 — Secrets never land in the repo

VAPID keys, push subscriptions and any game account token live in `wrangler secret` or in
`.dev.vars`, which is git-ignored. Raw game-state snapshots are personal data: they stay out of
version control (see `.gitignore`) and out of commit messages, issues and the shared doc.
