# Tasks: <feature name>

- **Spec:** `./spec.md` · **Plan:** `./plan.md`

Executed in order unless marked `[parallel-safe]`. A task is checked off only when its
verification step has actually been run and passed — not when the code looks right.

## Coverage check

Every requirement maps to at least one task, and every task to a requirement (Article 6).

| Requirement | Tasks |
| --- | --- |
| RF01 | T001 |

## Tasks

### T001 — <short imperative title>

- **Serves:** RF01
- **Files:** `packages/x/src/y.ts` (new)
- **Do:** what to build, in enough detail that it can be executed without re-deriving the plan.
- **Verify:** the exact command to run and the output that means success.
- **Status:** `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (say why)
