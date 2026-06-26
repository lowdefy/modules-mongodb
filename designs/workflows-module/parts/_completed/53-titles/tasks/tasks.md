# Implementation Tasks — Titles strategy (Part 53)

## Overview

These tasks implement the workflows module's titles strategy: a `humanizeSlug` helper, build-time materialization of derived-or-overridden `title` for workflows/actions/groups, runtime denormalization of titles onto persisted docs, a per-signal verb map for event messages, and the supporting var/manifest/docs/demo changes. Derived from `designs/workflows-module/parts/53-titles/design.md`.

## Tasks

| #   | File                                 | Summary                                                                                       | Depends On |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-humanize-slug-helper.md`         | New pure `humanizeSlug` helper + base acronym set + unit tests                                | —          |
| 2   | `02-materialize-titles-config.md`    | Resolve+default `title` for workflow/action/group in `makeWorkflowsConfig`                    | 1          |
| 3   | `03-action-page-title-default.md`    | Default `page_config.title` to the resolved action title in `makeActionPages`                 | 1          |
| 4   | `04-title-acronyms-var-wiring.md`    | Declare `title_acronyms` var, wire it into both resolver `_ref`s, note action `title`         | 2, 3       |
| 5   | `05-denormalize-titles-onto-docs.md` | Stamp `title` onto the action doc (`planActionTransition`) and workflow doc (`StartWorkflow`) | 2          |
| 6   | `06-signal-verb-event-map.md`        | Replace `action-event` catch-all with `DEFAULT_SIGNAL_TITLES` in `planEventDispatch`          | 5          |
| 7   | `07-demo-config-titles.md`           | Drop redundant titles in demo configs; keep overrides only where the slug humanizes wrong     | 2, 4       |
| 8   | `08-document-titles-convention.md`   | Document the derive-or-override rule, acronym dictionary, and signal verb map                 | 1, 2, 6    |

## Ordering Rationale

The work splits into a **build/module side** (tasks 1–4, 7–8) and a **plugin/runtime side** (tasks 5–6), joined by the fact that the materialized config (task 2) feeds both the runtime denormalization (task 5) and the action-page generation (task 3).

- **Task 1 is the foundation.** `humanizeSlug` is a pure helper consumed by every build-time defaulter; nothing derives a good title without it. It's independently testable, so it lands first.
- **Tasks 2 and 3 both depend on task 1** and are otherwise independent of each other — task 2 materializes titles onto the runtime `workflowsConfig`; task 3 defaults action-page titles. They could run in parallel. Both read `vars.title_acronyms` (defaulting to `[]`), so they don't strictly need the wiring to compile or unit-test.
- **Task 4 wires the `title_acronyms` var** into the manifest and both resolver `_ref` sites, so the resolvers from tasks 2 and 3 actually receive the merged acronym set at build. It depends on 2 and 3 because it threads the var those resolvers now consume.
- **Task 5 (denormalize) depends on task 2** because it stamps `actionConfig.title` / `workflowConfig.title` — fields that only exist once task 2 materializes them.
- **Task 6 (event verb map) depends on task 5** because the new templates reference `{{ action.title }}` / `{{ workflow.title }}`, which only become present on the planned docs once task 5 stamps them.
- **Task 7 (demo) depends on 2 and 4** — the build must accept the action `title` field and the `title_acronyms` var before demo configs are edited to exercise the override path.
- **Task 8 (docs) depends on 1, 2, and 6** — it documents the humanizer rule, the acronym dictionary, and the final signal verb map, so it lands after those are settled.

Tasks 2/3 are parallelizable; tasks 5/6 form a short chain; the build side (1→2→4) and the runtime side (2→5→6) reconverge only through the shared config field.

## Scope

**Source:** `designs/workflows-module/parts/53-titles/design.md`
**Context files considered:** none — the design folder contains only `design.md` (plus the skipped review). No `docs/Overview.md` exists in this repo; `docs/idioms.md` was consulted for the documentation task.
**Review files skipped:** `designs/workflows-module/parts/53-titles/review/review-1.md`
