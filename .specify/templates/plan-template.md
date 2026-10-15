# Plan: <feature name>

- **Spec:** `./spec.md` (status must be `ready`)
- **Status:** draft | approved | executed

## Chosen approach

Two or three paragraphs. Lead with the decision, then why it beats the alternatives for this
feature's constraints.

## Constitution check

Article by article. "N/A" is an acceptable answer; silence is not.

| Article | Holds? | Note |
| --- | --- | --- |
| 1 — Spec before code | | |
| 2 — JSON is the only source of truth | | |
| 3 — Zero recurring cost | | |
| 4 — Collector never writes to game files | | |
| 5 — Contract first | | |
| 6 — Traceability | | |
| 7 — Runnable without waiting on the house | | |
| 8 — Secrets never land in the repo | | |

## Components and data flow

Which packages exist or change, and what moves between them. A drawing or an ordered list of
hops — not prose describing a shape.

## Data contracts

The schemas crossing a boundary, written out. Where they live, who imports them, what happens
to a payload that fails validation.

## External dependencies

| Dependency | Version | Why this one | Cost |
| --- | --- | --- | --- |

## Risks and fallbacks

| Risk | Likelihood | If it happens |
| --- | --- | --- |

## Rejected alternatives

What else was considered and the specific reason it lost. Keeps the next session from
re-proposing it.
