# Implementation Tasks — Part 33: Comment Rendering

## Overview

Make the workflow submit comment a first-class part of the standard event: the engine folds the comment's HTML into `display.{app_name}.description` (rendered by the standard `EventsTimeline`), the event-display merge deep-merges under the app key so engine title + author overrides + comment coexist, the bespoke comments card is deleted, and the shared `events-timeline` component is added to the workflow action pages (check view page + all four form-kind templates). Derived from `designs/workflows-module/parts/33-comment-rendering/design.md`.

## Tasks

| #   | File                                 | Summary                                                                                            | Depends On |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-fold-comment-helper.md`          | New pure helper `foldCommentIntoEvent` + unit tests                                                 | —          |
| 2   | `02-deep-merge-event-display.md`     | `mergeEventOverrides` deep-merges `display` under the app key via `deepMerge`; migrate stale tests  | —          |
| 3   | `03-plan-event-dispatch-comment.md`  | `planEventDispatch` takes `comment`, calls the fold after `renderEventDisplay` (merge → render → fold) | 1, 2       |
| 4   | `04-thread-comment-plan-submit.md`   | `planSubmit` step 7 threads `comment: params.comment` into the planner call                         | 3          |
| 5   | `05-check-view-timeline-swap.md`    | Delete the bespoke comments card on the check view page; add the shared `events-timeline`          | —          |
| 6   | `06-form-template-timelines.md`      | Add the action-filtered `events-timeline` to all four form-kind templates                          | —          |
| 7   | `07-tighten-comment-validate.md`     | Tighten the `request_changes` comment validate to the fold-gate condition on both review surfaces  | —          |

## Ordering Rationale

Two independent streams:

- **Engine stream (1 → 3 → 4, with 2 feeding 3):** Task 1 (the fold helper) and task 2 (the deep-merge in `mergeEventOverrides`) are independent of each other and can run in parallel. Task 3 wires both into `planEventDispatch` — the fold must run *after* `renderEventDisplay` (raw comment HTML must never pass through the Nunjucks compile), and the deep-merge must be in place first or the comment-coexists-with-author-title tests can't pass. Task 4 is the one-line threading in `planSubmit` plus an end-to-end planner assertion; it's last because it exercises the full path.
- **Surface stream (5, 6, 7):** Pure module-YAML work, independent of the engine stream and of each other. They can land before or after the engine tasks — the timeline renders whatever `display.{display_key}.description` exists. Landing the engine stream first means a demo submit-with-comment shows up immediately when the surfaces land. Task 7 tightens the `request_changes` comment validate to mirror the engine's fold gate (text non-empty or fileList non-empty) so a type-then-deleted mandatory comment fails at the input instead of silently storing nothing.

The boundary between 3 and 4 keeps the planner's unit-level behaviour (fold, precedence, no `metadata.comment`) reviewable separately from the submit-pipeline integration test, which lives in a different test file with its own fixtures.

**Naming note for tasks 5–7:** Part 38 task 18 (`18-display-surface-renames.md`) has landed — the pages are `pages/workflow-action-{view,review,edit}.yaml`, matching the design's names.

## Scope

**Source:** `designs/workflows-module/parts/33-comment-rendering/design.md`
**Context files considered:** `design.md` only (the design folder contains no other non-review files). Codebase state verified directly: `planEventDispatch.js`, `mergeEventOverrides.js`, `planSubmit.js`, `deepMerge.js`, `renderEventDisplay.js`, `buildHookPayload.js`, `makeWorkflowApis.js`, `pages/workflow-action-view.yaml`, `templates/{view,edit,review,error}.yaml.njk`, `modules/events/components/events-timeline.yaml`, Part 38 tasks tracker.
**Review files skipped:** `review/` (2 files).

## Out of scope (per design)

Comment editing/deletion, threading/replies, standalone comments, email/notification rendering, full-text search, backfill of legacy `metadata.comment`, folding `status_history` into the timeline. Concept-spec amendments are already applied. Integration verification in the demo app rides Part 45 (demo rebuild); E2E coverage rides Part 22.
