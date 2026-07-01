# Implementation Tasks — Part 64: Action `description` rework

## Overview

These tasks implement Part 64 (`designs/workflows-module/parts/64-action-description/design.md`): delete the per-instance, end-user-editable universal-field `description` everywhere, and in its place revive `description` as a **workflow-author-authored** markdown config field that is rendered read-only (with `{{ var }}` nunjucks templating, at read time) to whoever works the action. Universal fields shrink from `[assignees, due_date, description]` to `[assignees, due_date]`. The work spans the engine plugin (read path + write path + types), the build-time resolvers, the module components/templates, and two concept specs.

## Tasks

| #   | File                                       | Summary                                                                                                       | Depends On |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-resolver-config-and-universal.md`      | Add authored `description` to runtime config; shrink `universal_fields` to two; validate `description` string | —          |
| 2   | `02-getworkflowaction-read-render.md`      | Source the envelope `description` from `actionConfig.description`, rendered at read time via `parseNunjucks`  | 1          |
| 3   | `03-drop-description-write-path.md`        | Remove `description` from the universal-fields write path, the action-doc seed, and the `Action` typedef      | —          |
| 4   | `04-action-description-component.md`       | New shared `components/action-description.yaml` leaf — plain `Markdown` render, content via var               | —          |
| 5   | `05-shrink-universal-fields-components.md` | Drop the `description` input/branch from the universal-fields components; defaults shrink to two              | —          |
| 6   | `06-rework-check-surfaces.md`              | Check page: content-card layout + `action-description` lead-in; modal cleanup only (render deferred)          | 4          |
| 7   | `07-rework-form-templates.md`              | Form pages: `action-description` inside the card + closed banner; remove dead seeds; delete callout component | 4, 6       |
| 8   | `08-concept-spec-amendments.md`            | Amend `action-authoring/spec.md` + `engine/spec.md` for the authored field + disambiguation                   | —          |

## Ordering Rationale

Two dependency chains drive the order:

- **Config → read path.** Task 1 adds `description` to `ACTION_FIELDS` in `makeWorkflowsConfig`, so `actionConfig.description` reaches the runtime engine config. Task 2 (GetWorkflowAction) reads and renders that field — without Task 1 it would always resolve to `null`. So Task 2 depends on Task 1.
- **New component → ref swaps → delete old component.** Task 4 creates `action-description.yaml`. Tasks 6 and 7 swap the callout `_ref` for it on the check and form surfaces respectively. The deleted `universal-fields-callout.yaml` has consumers on both surface families, so it can only be deleted once the _last_ consumer is swapped — that deletion lives in Task 7, which therefore depends on Task 6 (and both on Task 4).

Everything else is independent:

- **Task 3** (write-path removal) touches only plugin planners/types and their tests — no overlap with the read path, so it can run in parallel with Task 2.
- **Task 5** (universal-fields component shrink) is safe in any order relative to Tasks 6/7: an unused `description` var passed into the component is inert, and a removed display branch simply renders nothing.
- **Task 8** (specs) is documentation-only and can land any time, though it reads most naturally last.

Parallelizable groups: {1}, then {2, 3, 4, 5} can proceed concurrently; then {6}; then {7}. {8} any time.

## Scope

**Source:** `designs/workflows-module/parts/64-action-description/design.md`
**Context files considered:** `review/review-1.md` and `review/review-2.md` (both fully resolved into the design); the design's "Middle-column layout model" and modal-deferral decisions are reflected in Tasks 6 and 7.
**Review files:** `review-1.md`, `review-2.md` — findings folded into `design.md`; tasks reconciled to the current design via `consistency-1.md`.
