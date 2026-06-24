# Implementation Tasks — Part 33: Comment Rendering

## Overview

Make the workflow submit comment a first-class part of the standard event: the engine folds the comment's HTML into `display.{app_name}.description` (rendered by the standard `EventsTimeline`), the event-display merge deep-merges under the app key so engine title + author overrides + comment coexist, the bespoke comments card is deleted, and the standard events module `events-timeline` component is added to the workflow action pages (check view page + all four form-kind templates). Derived from `designs/workflows-module/parts/33-comment-rendering/design.md`.

> **Re-baselined 2026-06** against shipped Parts 38/40/42/46/48/53 (see design.md's revision note). Engine stream (tasks 1–4) is unchanged and accurate: `planEventDispatch` already takes a `comment` param (un-folded) and already never writes `metadata.comment`, and Part 24's `UpdateActionFields` handler route is already landed — so this part only adds the fold + the deep-merge + the `planSubmit` threading. Surface stream (tasks 5–7) was rewritten: the action view page is now a Part 40 thin container (delete the page-level `comments_card` below the `check-action-surface` `_ref`); `get_action` is renamed `get_workflow_action` returning a single object (no `.0`); the timeline to add is the events module's **events-only** generic `events-timeline` (action-card enrichment moved to the workflows-owned `workflows-events-timeline` in Part 46, and is unneeded on a single-action page); and the mandatory `request_changes` comment now lives in `change_request_comment` (form review template) and `current_action.comment` (check surface), not a single `comment` input.

## Tasks

| #   | File                                 | Summary                                                                                            | Depends On |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-fold-comment-helper.md`          | New pure helper `foldCommentIntoEvent` + unit tests                                                 | —          |
| 2   | `02-deep-merge-event-display.md`     | `mergeEventOverrides` deep-merges `display` under the app key via `deepMerge`; migrate stale tests  | —          |
| 3   | `03-plan-event-dispatch-comment.md`  | `planEventDispatch` takes `comment`, calls the fold after `renderEventDisplay` (merge → render → fold) | 1, 2       |
| 4   | `04-thread-comment-plan-submit.md`   | `planSubmit` step 7 threads `comment: params.comment` into the planner call                         | 3          |
| 5   | `05-check-view-timeline-swap.md`    | Delete the page-level comments card on the check view page; add the events-only `events-timeline`   | —          |
| 6   | `06-form-template-timelines.md`      | Add the action-filtered `events-timeline` to all four form-kind templates                          | —          |
| 7   | `07-tighten-comment-validate.md`     | Tighten the mandatory `request_changes` comment validate (form `change_request_comment` + check `current_action.comment`) to the fold-gate condition | —          |

## Ordering Rationale

Two independent streams:

- **Engine stream (1 → 3 → 4, with 2 feeding 3):** Task 1 (the fold helper) and task 2 (the deep-merge in `mergeEventOverrides`) are independent of each other and can run in parallel. Task 3 wires both into `planEventDispatch` — the fold must run *after* `renderEventDisplay` (raw comment HTML must never pass through the Nunjucks compile), and the deep-merge must be in place first or the comment-coexists-with-author-title tests can't pass. Task 4 is the one-line threading in `planSubmit` plus an end-to-end planner assertion; it's last because it exercises the full path.
- **Surface stream (5, 6, 7):** Pure module-YAML work, independent of the engine stream and of each other. They can land before or after the engine tasks — the timeline renders whatever `display.{display_key}.description` exists. Landing the engine stream first means a demo submit-with-comment shows up immediately when the surfaces land. Task 7 tightens the `request_changes` comment validate to mirror the engine's fold gate (text non-empty or fileList non-empty) so a type-then-deleted mandatory comment fails at the input instead of silently storing nothing.

The boundary between 3 and 4 keeps the planner's unit-level behaviour (fold, precedence, no `metadata.comment`) reviewable separately from the submit-pipeline integration test, which lives in a different test file with its own fixtures.

**Baseline note for tasks 5–7 (shipped Parts 40/46):** the action view page (`pages/workflow-action-view.yaml`) is a Part 40 thin container that `_ref`s `components/check-action-surface.yaml` and renders the bespoke `comments_card` as page-level chrome below it; the form templates and the view page load the action via `get_workflow_action` (a **single object**, no `.0`) into `_state` (`_state.action` on templates, `_state.current_action` on the surface). The mandatory `request_changes` comment is `change_request_comment` on the form review template and `current_action.comment` on the check surface.

## Scope

**Source:** `designs/workflows-module/parts/33-comment-rendering/design.md`
**Context files considered:** `design.md` only (the design folder contains no other non-review files). Codebase state verified directly: `planEventDispatch.js`, `mergeEventOverrides.js`, `planSubmit.js`, `deepMerge.js`, `renderEventDisplay.js`, `buildHookPayload.js`, `makeWorkflowApis.js`, `pages/workflow-action-view.yaml`, `templates/{view,edit,review,error}.yaml.njk`, `modules/events/components/events-timeline.yaml`, Part 38 tasks tracker.
**Review files skipped:** `review/` (2 files).

## Out of scope (per design)

Comment editing/deletion, threading/replies, standalone comments, email/notification rendering, full-text search, backfill of legacy `metadata.comment`, folding `status_history` into the timeline. Concept-spec amendments were applied at first draft — re-verify their line refs against the Part 48/53 spec rewrites before trusting offsets (design.md § Concept-spec amendments). Integration verification in the demo app rides Part 45 (demo rebuild); E2E coverage rides Part 22.
