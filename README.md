# Snaptritor

> **Snap** (Marvel Snap) + **Nitritor** — dominating since 2023.

The Marvel Snap card shop rotates every 8 hours. Opening the app to check it is slow and easy to
forget, so Snaptritor does the checking: it reads the rotation out of the game's own local state
file on the PC and pushes a notification to your phone when the cards change.

## How it works

```
PC (WSL)                       Cloudflare                  Android
┌──────────────────┐           ┌──────────────┐            ┌──────────────┐
│ collector        │  changed  │ worker       │  Web Push   │ TWA client   │
│ read ShopState   │ ────────► │ store + push │ ──────────► │ notification │
│ parse → diff     │   offer   │ KV / D1      │   (VAPID)   │              │
└──────────────────┘           └──────────────┘            └──────────────┘
   woken by Wake-on-LAN,          always on,                  installed PWA
   suspends when done             free tier
```

No screen reading and no AI in the data path — the shop is read from JSON, which costs nothing to
run and does not break when the game's UI changes.

## Status

Early. The repo currently holds the spec-driven scaffold and the first two features' specs. Nothing
is deployed yet, and one design question is still open — whether the game refreshes its shop state
file without the Shop screen being opened (`specs/000-shopstate-write-trigger/`).

## Working in this repo

Development is spec-driven: specs are the source of truth and code follows them, never the reverse.

1. `.specify/memory/constitution.md` — the eight non-negotiable articles.
2. `specs/NNN-slug/{spec,plan,tasks}.md` — one directory per feature, in that order.
3. `/specify` → `/plan` → `/tasks` → `/implement` — the Claude Code commands that drive the loop.

See `CLAUDE.md` for the validated environment facts and the game-state layout.

## Requirements

- Node 24+, pnpm 11+
- WSL2 with the Windows drive mounted at `/mnt/c`
- Marvel Snap installed on the same Windows host
- A Cloudflare account (free tier) for the Worker
