# Implementation Tasks — Part 12: `makeActionPages` resolver

## Overview

Ship the build-time resolver that emits per-action page YAML for form actions: one shell per (workflow_type, action_type, verb), gated by `access.{app_name}`, with template-context vars carrying everything the page needs to render. Tracker and task actions skip the resolver entirely. Also ships the four placeholder templates the resolver references — part 16 replaces their bodies later without changing paths.

Derived from `designs/workflows-module/parts/12-resolver-pages/design.md`.

## Tasks

Status legend: `✅ done` · `🚧 in progress` · `⏸ blocked` · empty = not started.

| #   | File                          | Summary                                                                                                                                                                                                       | Depends On               | Status              |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------- |
| 1   | `01-placeholder-templates.md` | Ship four `.yaml.njk` placeholder templates at `templates/{edit,view,review,error}.yaml.njk` so the resolver's emitted `_ref` paths resolve from day one (Lowdefy fails the build on missing `_ref` targets). | —                        | ✅ done             |
| 2   | `02-make-action-pages.md`     | Write `resolvers/makeActionPages.js` — verb-gating, page-shell emission, build-time validation, plus a self-contained `node:test` spec exercising the worked-example fixture.                                 | 1                        | ✅ done             |
| 3   | `03-manifest-wiring.md`       | Register the resolver in `modules/workflows/module.lowdefy.yaml` under the dynamic-pages resolver channel from part 2.                                                                                        | 2; **blocked on part 2** | ⏸ blocked on part 2 |

## Ordering Rationale

Three tasks, near-linear dependency chain.

- **Task 1 first.** Placeholder templates are pure file creation, no JS. Once task 3 wires the resolver into the manifest, Lowdefy's build fails loudly if the `_ref` paths the resolver emits don't resolve — so the four stubs need to exist before the first end-to-end build. They're also useful in isolation as a visible "where pages will land" marker.
- **Task 2 builds on task 1.** The resolver is small (~150 LOC expected) and the unit tests are tightly coupled to the resolver's shape, so splitting them across tasks creates artificial gaps. Tests run via `node --test` against `node:assert` — no new test framework dependency. The worked-example fixture lives alongside the spec, not as a separate task.
- **Task 3 is blocked on part 2** (Wave 0, upstream `@lowdefy/build`). Part 2 ships the resolver-emit channel for `exports.pages`; without it, there's nowhere to plug `makeActionPages.js` into. If part 2 isn't ready when tasks 1–2 land, task 3 ships separately later. Tasks 1–2 produce a usable, testable resolver without needing the manifest wiring.

### Deferred to later parts

- **Template bodies** — placeholders only here; part 16 fills them in.
- **Form body composition** — part 15 (`makeActionsForm`) renders inside the templates, not the page shells.
- **`update-action-{action_type}` endpoints** — part 13.
- **End-to-end coverage** — part 22 (workflows-e2e-suite) runs the full demo flow. Part 12's tests are unit-level against the resolver's output shape.

## Scope

**Source:** `designs/workflows-module/parts/12-resolver-pages/design.md`
**Context files considered:** parent design.md, parts/04-workflow-config-schema/design.md (input contract), parts/04-workflow-config-schema/tasks/02-make-workflows-config.md (narrowing pattern reference), parts/16-page-templates/design.md (template contract), parts/21-entity-type-to-collection/design.md (entity-identity contract), workflows-module-concept/ui/spec.md, workflows-module-concept/action-authoring/spec.md, implementation-plan.md.
**Review files skipped:** review/review-1.md, review/consistency-1.md.
