# Implementation Tasks — Part 33: Comment Rendering

## Overview

Make the workflow submit comment a first-class part of the standard event: the engine folds the comment's HTML into `display.{app_name}.description` (rendered by the standard `EventsTimeline`), the event-display merge deep-merges under the app key so engine title + author **title** overrides + comment coexist (the description slot is **comment-only** — authored descriptions are rejected at build, pre-hook descriptions stripped at merge), the bespoke comments card is deleted, and the standard events module `events-timeline` component is added to the workflow action pages (check view page + all four form-kind templates). Derived from `designs/workflows-module/parts/33-comment-rendering/design.md`.

> **Re-baselined 2026-06** against shipped Parts 38/40/42/46/48/53 (see design.md's revision note). Engine stream (tasks 1–4, 8) is unchanged and accurate: `planEventDispatch` already takes a `comment` param (un-folded) and already never writes `metadata.comment`, and Part 24's `UpdateActionFields` handler route is already landed — so this part only adds the fold + the deep-merge + the `planSubmit` threading + the comment-only description enforcement (merge-strip in task 2, build-reject in task 8). Surface stream (tasks 5–7) was rewritten: the action view page is now a Part 40 thin container (delete the page-level `comments_card` below the `check-action-surface` `_ref`); `get_action` is renamed `get_workflow_action` returning a single object (no `.0`); the timeline to add is the events module's **events-only** generic `events-timeline` (action-card enrichment moved to the workflows-owned `workflows-events-timeline` in Part 46, and is unneeded on a single-action page); and the mandatory `request_changes` comment now lives in `change_request_comment` (form review template) and, on the check surface, the modal input at `check-action-surface.yaml:626` — which today shares the id `current_action.comment` with the optional surface input, so task 7 splits it onto its own `current_action.change_request_comment` path before tightening its validate.

## Tasks

| #   | File                                 | Summary                                                                                            | Depends On |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-fold-comment-helper.md`          | New pure helper `foldCommentIntoEvent` + unit tests                                                 | —          |
| 2   | `02-deep-merge-event-display.md`     | `mergeEventOverrides` deep-merges `display` under the app key via `deepMerge` and strips non-comment `description`; migrate stale tests | —          |
| 3   | `03-plan-event-dispatch-comment.md`  | `planEventDispatch` takes `comment`, calls the fold after `renderEventDisplay` (merge → render → fold) | 1, 2       |
| 4   | `04-thread-comment-plan-submit.md`   | `planSubmit` step 7 threads `comment: params.comment` into the planner call                         | 3          |
| 5   | `05-check-view-timeline-swap.md`    | Delete the page-level comments card on the check view page; add the events-only `events-timeline`   | —          |
| 6   | `06-form-template-timelines.md`      | Add the action-filtered `events-timeline` to all four form-kind templates                          | —          |
| 7   | `07-tighten-comment-validate.md`     | Tighten the mandatory `request_changes` comment validate (form `change_request_comment` + check `current_action.change_request_comment`, split from the shared `current_action.comment`) to the fold-gate condition | —          |
| 8   | `08-reject-authored-event-description.md` | `makeWorkflowsConfig` rejects an authored event/lifecycle `display.{app}.description` at build (comment-only, D4) | —          |

## Ordering Rationale

Two independent streams:

- **Engine stream (1 → 3 → 4, with 2 feeding 3; 8 independent):** Task 1 (the fold helper) and task 2 (the deep-merge + description-strip in `mergeEventOverrides`) are independent of each other and can run in parallel. Task 3 wires both into `planEventDispatch` — the fold must run *after* `renderEventDisplay` (raw comment HTML must never pass through the Nunjucks compile), and the deep-merge must be in place first or the comment-coexists-with-author-title tests can't pass. Task 4 is the one-line threading in `planSubmit` plus an end-to-end planner assertion; it's last because it exercises the full path. Task 8 (build-time reject of an authored `display` `description`, in `makeWorkflowsConfig`) is independent module-resolver work that pairs with task 2's runtime strip — same comment-only decision (D4), different enforcement layer.
- **Surface stream (5, 6, 7):** Pure module-YAML work, independent of the engine stream and of each other. They can land before or after the engine tasks — the timeline renders whatever `display.{display_key}.description` exists. Landing the engine stream first means a demo submit-with-comment shows up immediately when the surfaces land. Task 7 tightens the `request_changes` comment validate to mirror the engine's fold gate (text non-empty or fileList non-empty) so a type-then-deleted mandatory comment fails at the input instead of silently storing nothing.

The boundary between 3 and 4 keeps the planner's unit-level behaviour (fold, precedence, no `metadata.comment`) reviewable separately from the submit-pipeline integration test, which lives in a different test file with its own fixtures.

**Baseline note for tasks 5–7 (shipped Parts 40/46):** the action view page (`pages/workflow-action-view.yaml`) is a Part 40 thin container that `_ref`s `components/check-action-surface.yaml` and renders the bespoke `comments_card` as page-level chrome below it; the form templates and the view page load the action via `get_workflow_action` (a **single object**, no `.0`) into `_state` (`_state.action` on templates, `_state.current_action` on the surface). The mandatory `request_changes` comment is `change_request_comment` on the form review template and, on the check surface, the modal input at `check-action-surface.yaml:626` (today sharing the id `current_action.comment` with the optional surface input; task 7 splits it onto `current_action.change_request_comment`).

## Scope

**Source:** `designs/workflows-module/parts/33-comment-rendering/design.md`
**Context files considered:** `design.md` only (the design folder contains no other non-review files). Codebase state verified directly: `planEventDispatch.js`, `mergeEventOverrides.js`, `planSubmit.js`, `deepMerge.js`, `renderEventDisplay.js`, `buildHookPayload.js`, `makeWorkflowApis.js`, `pages/workflow-action-view.yaml`, `templates/{view,edit,review,error}.yaml.njk`, `modules/events/components/events-timeline.yaml`, Part 38 tasks tracker.
**Review files skipped:** `review/` (4 files). Tasks were subsequently revised to carry the review-3/review-4 decisions (empty-comment fold gate, the check-surface `current_action.change_request_comment` split, D4's comment-only description with build-reject + merge-strip).

## Out of scope (per design)

Comment editing/deletion, threading/replies, standalone comments, email/notification rendering, full-text search, backfill of legacy `metadata.comment`, folding `status_history` into the timeline. Concept-spec amendments were applied at first draft — re-verify their line refs against the Part 48/53 spec rewrites before trusting offsets (design.md § Concept-spec amendments). Integration verification in the demo app rides Part 45 (demo rebuild); E2E coverage rides Part 22.
