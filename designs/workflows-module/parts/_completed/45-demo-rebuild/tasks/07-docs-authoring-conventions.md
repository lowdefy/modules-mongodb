# Task 7: Document the `starting_actions` convention and the conditional-`blocked_by` rule

## Context

Design D1 and D2 are **conventions enforced by example and documentation, not engine changes** — the old demo config dead-ended after group 1 because its `starting_actions` listed only `qualify` and nothing spawned the rest; the engine was working as designed, used incorrectly. The new demo config (task 3) is the canonical example; this task states the conventions normatively in the workflows README and the action-authoring concept doc.

The two conventions:

1. **D1 — `starting_actions` lists the full standard scope.** List every standard action that makes up the workflow: entry actions at `action-required`, everything downstream at `blocked` — so the user sees the workflow's full scope the moment it starts. These are also the only two **legal seed statuses** — `starting_actions[].status` is restricted to `action-required` | `blocked` at build time, and `StartWorkflow` enforces the same rule on the payload `actions:` override at runtime (Part 38 task 17). _Conditional actions_ (existence depends on user input) are **not** listed; hooks spawn them with `{ type, signal: activate, upsert: true }`. An action neither listed nor hook-spawned never exists.
2. **D2 — Conditional actions are never `blocked_by` targets.** Verified engine semantics: `planAutoUnblock` resolves a `blocked_by` entry naming an action type via `terminalByType.get(entry) === true` (`planAutoUnblock.js:86-88`) — a type with **zero docs** returns `undefined`, i.e. _unsatisfied_; a standard action blocked by a never-spawned conditional type blocks forever. Conditional actions may _be_ blocked, but must never _appear in_ another action's `blocked_by`. The conditional-safe gate is a **group target**: a `blocked_by` entry naming a group id resolves as "group status is done", and group status derives from whatever member docs exist — a never-spawned conditional simply isn't counted. Relatedly: group-level `blocked_by` keys are dead config — the engine reads `blocked_by` only on actions; groups are targets, never carriers.

## Task

1. **`modules/workflows/README.md`** — in the "Authoring actions" area (alongside the existing "Transition model (signals)" subsection — or as a sibling subsection under the workflow-level authoring docs where `starting_actions` is described), add the two conventions:
   - The `starting_actions` rule, with a short example contrasting listed standard actions (entry `action-required`, downstream `blocked`) vs an excluded conditional spawned by a pre-submit hook with `upsert: true`. The demo's `onboarding` config can be referenced as the worked example.
   - The hard rule that conditional types never appear in `blocked_by`, **why** (zero-doc types resolve unsatisfied forever), and the group-target pattern as the conditional-safe gate. Include the note that `blocked_by` lives on actions only — a `blocked_by` key on a group is ignored.

2. **`designs/workflows-module-concept/action-authoring/design.md`** — state the same two conventions normatively where the authoring grammar is specified (near the `starting_actions` / `blocked_by` grammar, or as a new Decision following the existing numbered-decision style of that doc). Keep the concept doc the _normative_ statement; the README is the consumer-facing restatement.

## Acceptance Criteria

- README documents both conventions with the rationale (full-scope render at start; zero-doc `blocked_by` entries never satisfy) and the group-target pattern, in the module's existing voice and section structure.
- The action-authoring concept doc carries the normative statement; the two documents agree.
- The demo config (task 3) conforms to what the docs say — if writing the docs surfaces a mismatch, the design is the source of truth: flag it rather than silently adjusting either side.
- No engine-change language anywhere — both docs present these as authoring conventions over unchanged engine semantics.

## Files

- `modules/workflows/README.md` — modify — D1 convention + D2 rule in the authoring docs
- `designs/workflows-module-concept/action-authoring/design.md` — modify — normative statement of both conventions

## Notes

- Part 44 separately documents `start_link` in these same files (its own files-changed table); if Part 44's doc edits have landed, place these conventions consistently with them, but do not re-document `start_link` here.
- Don't expand scope into documenting the seeding mechanism internals (Start planner seeds drafts directly at declared statuses; legal seeds `action-required`/`blocked`) beyond what authors need: `starting_actions` entries are `{ type, status }` validated at build time.
