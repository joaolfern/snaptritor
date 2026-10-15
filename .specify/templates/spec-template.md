# Spec: <feature name>

- **ID:** `NNN-slug`
- **Status:** draft | ready | implemented | superseded
- **Source:** <where the requirements came from — the shared doc, a conversation, an incident>

> Describe WHAT and WHY only. Technology names, libraries, file layouts and APIs belong in
> `plan.md`. If a sentence here could not be understood by someone who has never seen the code,
> it is in the wrong file.

## Problem

One paragraph: who is affected, what it costs them today.

## Goals

- The outcomes this feature commits to, each observable from outside the system.

## Non-goals

- What this feature deliberately does not do, so scope stays honest later.

## User scenarios

Numbered, in Given/When/Then form, from the user's point of view.

1. **Given** <starting state>, **when** <the user or the clock acts>, **then** <what they observe>.

## Functional requirements

| ID | Requirement |
| --- | --- |
| RF01 | <a single testable statement> |

## Non-functional requirements

| ID | Constraint | Why |
| --- | --- | --- |
| NF01 | <cost, reliability, maintenance, environment> | <the article or need behind it> |

## Acceptance criteria

Per requirement ID, the observable condition that proves it. This is what `/tasks` turns into
verification steps, so write it as something that can be checked, not as an intention.

- **RF01** — Given …, when …, then ….

## Open questions

Unknowns that affect the design. Each gets an ID, an owner and what decision it blocks. Never
guess here — an unanswered question is better than an invented requirement.

| ID | Question | Blocks | Owner |
| --- | --- | --- | --- |
| Q01 | <question> | <which requirement or plan decision> | <user / me> |
