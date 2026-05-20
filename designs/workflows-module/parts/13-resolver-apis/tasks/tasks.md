# Implementation Tasks — Part 13: `makeWorkflowApis` resolver

## Overview

Ship the build-time resolver that emits per-action `update-action-{action_type}` Lowdefy Apis for form / task actions, plus inline-routine-derived hook Apis and group `on_complete` Apis with `auth.roles` synthesized from `action.access.roles`. Tracker actions emit nothing.

Derived from `designs/workflows-module/parts/13-resolver-apis/design.md`.

## Tasks

Status legend: `✅ done` · `🚧 in progress` · `⏸ blocked` · empty = not started.

| #   | File                          | Summary                                                                                                                                                                                                                                                              | Depends On               | Status              |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------- |
| 1   | `01-inline-hook-schema.md`    | Flip `hooks.{interaction}.{pre\|post}` and `action_groups[].on_complete` from string Api id to inline routine object. Update the action-authoring spec, the worked example, and `makeWorkflowsConfig` to validate the new shape and reject the legacy string form. | —                        | ✅ done             |
| 2   | `02-make-workflow-apis.md`    | Write `resolvers/makeWorkflowApis.js` — one `update-action-{action_type}` Api per form/task action, plus resolver-emitted hook Apis (`update-action-{action_type}-{interaction}-{pre\|post}`) and group `on_complete` Apis, with a self-contained Jest spec.        | 1                        | ✅ done             |
| 3   | `03-manifest-wiring.md`       | Register the resolver in `modules/workflows/module.lowdefy.yaml` under part 2's dynamic-API-export channel.                                                                                                                                                          | 2; **blocked on part 2** | ⏸ blocked on part 2 |

## Ordering Rationale

Three tasks, near-linear dependency chain (matches part 12's shape).

- **Task 1 first — schema precondition.** Design.md:41 calls this out explicitly: the resolver cannot be written against the new model until the YAML grammar for hooks flips from "string pointing at an external Api" to "object carrying the routine inline." Doing the validator update and the worked-example fold-in first means task 2 has a stable input contract to test against. Task 1 also extends `action_groups[].on_complete` the same way so the resolver only has one shape to consume.
- **Task 2 builds on task 1.** Single cohesive resolver — emitting the `update-action-{type}` endpoint and the derived hook / `on_complete` Apis is one walk over the same action / workflow tree; splitting them creates artificial seams. Tests run via `node --test` against `node:assert` (same convention as `makeActionPages.test.js`).
- **Task 3 is blocked on part 2** (Wave 0, upstream `@lowdefy/build`). Part 2 ships the resolver-emit channel for dynamic exports; depending on its open-question resolution, that channel either also accepts Apis (single channel) or part 13 needs a parallel `exports.api` channel. Until that lands, there's no manifest shape to write against. Tasks 1–2 produce a usable, testable resolver without the manifest wiring.

### Deferred to later parts

- **Runtime hook invocation, three-layer status / event / form merge, `hook_error` handling** — part 9.
- **Group `on_complete` fan-out at submit time** — part 11 (consumes the emitted Api ids).
- **Page templates that call the emitted endpoints with `interaction:` values** — part 16.
- **End-to-end coverage** — part 22 (workflows-e2e-suite). Part 13's tests are unit-level against the resolver's output shape; integration smoke is a one-shot demo-app build assertion in task 2.
- **Part 11 / part 9 fold-ins** to reflect "Part 13 emits hook Apis with synthesized auth" (rather than "validates" or "needs a gate") — flagged in `review/consistency-1.md` as cross-part drift, addressed when those parts enter their own review cycles.

## Scope

**Source:** `designs/workflows-module/parts/13-resolver-apis/design.md`
**Context files considered:** parent design.md, parts/02-dynamic-module-pages/design.md (upstream channel), parts/_completed/04-workflow-config-schema/design.md + `tasks/02-make-workflows-config.md` (validator extension point + raw-YAML-input contract), parts/_completed/06-submit-action-writes/design.md (handler payload contract), parts/_completed/15-resolver-form-builder/ (sibling resolver patterns), parts/12-resolver-pages/design.md + tasks (sibling resolver to mirror conventions), parts/08-side-effect-dispatch/design.md (event-override four-tuple shape), parts/09-hook-invocation/design.md (consumer of the emitted hook ids), parts/11-group-on-complete-fanout/design.md (consumer of emitted `on_complete` Api ids), workflows-module-concept/action-authoring/spec.md, workflows-module-concept/submit-pipeline/spec.md, implementation-plan.md.
**Review files skipped:** review/review-1.md, review/consistency-1.md.
