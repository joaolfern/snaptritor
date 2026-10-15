# Snaptritor

> **Snap** (Marvel Snap) + **Nitritor** — dominating since 2023.

The Marvel Snap card shop rotates every 8 hours. Opening the app to check it is slow and easy to
forget, so Snaptritor does the checking: it brings the shop on screen, captures it, and pushes that
picture to your phone when it changes.

## How it works

```
PC (installed .exe)            Cloudflare                  Android
┌──────────────────┐           ┌──────────────┐            ┌──────────────┐
│ collector        │  changed  │ worker       │  Web Push   │ TWA client   │
│ open Shop→Cards   │ ────────► │ store + push │ ──────────► │ notification │
│ screenshot → diff │   screen- │ KV / D1 + R2 │   (VAPID)   │ shows image  │
│ last/next, pause  │   shot    │              │             │              │
└──────────────────┘           └──────────────┘            └──────────────┘
   wakes & schedules itself,      always on,                  installed PWA
   sleeps when done               free tier
```

No OCR, no computer vision, no LLM anywhere in the pipeline. The collector doesn't read the game's
files for the shop at all — a spike found they don't reflect the live offer
(`specs/000-shopstate-write-trigger/`) — so it captures what is actually on screen and relays that
image exactly as captured, costing nothing to run and breaking only if the screen layout moves.

The collector ships as a single Windows installer. Once installed it runs unattended on its own
schedule — no WSL, no terminal — and its small window shows the last and next inspection time, with
independent controls to pause inspection and to pause the automation that wakes the PC. WSL is
where this repo is developed and where feature `000`'s experiments run, not where the shipped
collector lives.

## Status

Early. The repo currently holds the spec-driven scaffold and the first two features' specs. Nothing
is deployed yet. Feature `000`'s spike concluded: the game's local shop state never reflects what
is actually on offer, so the project reads a screenshot instead of parsing JSON
(`specs/000-shopstate-write-trigger/findings.md`).

## Working in this repo

Development is spec-driven: specs are the source of truth and code follows them, never the reverse.

1. `.specify/memory/constitution.md` — the eight non-negotiable articles.
2. `specs/NNN-slug/{spec,plan,tasks}.md` — one directory per feature, in that order.
3. `/specify` → `/plan` → `/tasks` → `/implement` — the Claude Code commands that drive the loop.

See `CLAUDE.md` for the validated environment facts and the game-state layout.

## Requirements

To develop: Node 24+, pnpm 11+, WSL2 with the Windows drive mounted at `/mnt/c`.

To run: a Windows PC with Marvel Snap installed, and a Cloudflare account (free tier) for the
Worker. No WSL is needed to run the installed collector — only to build it.
