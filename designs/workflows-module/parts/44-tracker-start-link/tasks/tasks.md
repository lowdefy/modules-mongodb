# Implementation Tasks — Tracker `start_link`

## Overview

Implements the optional `tracker.start_link` field: an author-declared navigation target for pre-child tracker actions (`action-required`, `child_workflow_id: null`), emitted by the engine as the action's `edit`-verb link with `action_id` / `entity_id` URL-query sentinels substituted. Derives from `designs/workflows-module/parts/44-tracker-start-link/design.md`.

## Tasks

| #   | File                                    | Summary                                                                                               | Depends On |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-start-link-config-validation.md`    | Validate `tracker.start_link` shape in `makeWorkflowsConfig` (proposed change 5) + tests              | —          |
| 2   | `02-compute-engine-links-start-arm.md`  | Second tracker arm in `computeEngineLinks`: emit `links.edit = start_link` with sentinels substituted | —          |
| 3   | `03-planner-tracker-refresh.md`         | `planActionTransition` refreshes `doc.tracker` (incl. `start_link`) on every plan; widen typedef      | 2          |
| 4   | `04-resolve-action-link-tracker-test.md`| Tracker-row case in `resolve_action_link` read-side tests (creates the test file — none exists yet)   | 2          |
| 5   | `05-docs-start-link.md`                 | Document `start_link` in `modules/workflows/README.md` + action-authoring concept docs (Decision 5)   | 1, 2, 3    |

## Ordering Rationale

- **Task 1 (config validation)** pins the authored contract — `{ pageId: string, urlQuery?: object }`, sentinel keys, rejected shapes — before anything consumes it. It has no code dependency on the engine side and can run in parallel with task 2.
- **Task 2 (engine emission)** is the heart of the part: a pure-function change to `computeEngineLinks` with its own unit tests. It needs nothing else — its input (`action.tracker.start_link` off the composed doc) is specified by the design, and its tests construct action docs directly.
- **Task 3 (planner denormalisation)** wires the data through: the persisted `tracker` field is currently narrowed to `{ workflow_type }` on insert and never refreshed on update, so without this task `computeEngineLinks` never sees `start_link` at runtime. It depends on task 2 so its end-to-end assertion (unblock into `action-required` persists `{slug}.links.edit`) exercises the new arm.
- **Task 4 (read-side test)** is Part 44's only read-side contribution per the design — a tracker-row case in `resolve_action_link`'s tests. The shipped Part 42 stage has **no test file on disk**, so this task creates one (resolved-MQL pattern, mirroring `visible_verbs_filter.test.js`). It depends on task 2 only for the emitted link shape; it can run in parallel with task 3.
- **Task 5 (docs)** documents the shipped behaviour and the D6 division of labour (app page owns creation → `start_link`; inline form owns creation → paired trigger + tracker), so it lands last.

Parallelism: tasks 1 and 2 are independent; tasks 3 and 4 can run in parallel once 2 lands.

No demo-app task: the design explicitly defers demo coverage to Part 45 (`track-company-setup` exercises `start_link` with both sentinels), and the read APIs need no change — Part 42's shared `resolve_action_link.yaml` is already adopted by all three read APIs and generically surfaces `links.edit`.

## Scope

**Source:** `designs/workflows-module/parts/44-tracker-start-link/design.md`
**Context files considered:** none besides `design.md` (the design folder contains no other supporting files); grounding came from the referenced source files (`computeEngineLinks.js`, `planActionTransition.js`, `types.js`, `makeWorkflowsConfig.js`, `resolve_action_link.yaml`, `substituteActionIdSentinel.js`) and the action-authoring concept docs.
**Review files skipped:** `review/` folder (1 file).
