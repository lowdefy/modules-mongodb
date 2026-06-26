# Implementation Tasks — Part 20b (Resolver-emitted manifest surface + demo wiring)

## Overview

Decomposition of `designs/workflows-module/parts/20b-module-manifest-dynamic/design.md`. The dynamic-surface manifest entries already shipped via commit `574960a`; this part replaces the tracker-only `onboarding` demo from part 20a with the four-kind worked example, fixes the broken per-status `message` / `link` projection in three operational APIs, exports a new `entity-workflows-refetch` component, and rebuilds the lead-view start-onboarding flow as a device-keyed modal.

## Tasks

| #   | File                                               | Summary                                                                       | Depends On    |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------- | ------------- |
| 1   | `01-fix-per-status-projection.md`                  | Replace broken `_string.concat` projection in three operational APIs          | —             |
| 2   | `02-entity-workflows-refetch-component.md`         | Author refetch component + register under module manifest                     | —             |
| 3   | `03-author-qualify-action.md`                      | New `qualify.yaml` + `hooks/qualify-pre-submit.yaml`                          | —             |
| 4   | `04-author-send-quote-action.md`                   | New `send-quote.yaml` + two hook routines + `form_review`                     | —             |
| 5   | `05-author-schedule-followup-action.md`            | New `schedule-followup.yaml` (kind: task)                                     | —             |
| 6   | `06-author-proof-of-installation-action.md`        | New `proof-of-installation.yaml` (instanced via `key: $device_serial`)        | —             |
| 7   | `07-author-track-installation-action.md`           | New `track-installation.yaml` (tracker on `installation` child workflow)      | —             |
| 8   | `08-restructure-onboarding-and-delete-trackers.md` | Restructure `onboarding.yaml`; delete `track-step-*`; author `g1-on-complete` | 3, 4, 5, 6, 7 |
| 9   | `09-lead-view-start-onboarding-modal.md`           | Replace lead-view button with modal that constructs `actions:` payload        | 2, 6, 8       |
| 10  | `10-readme-update.md`                              | Drop part-20b pointer; document refetch component + worked example            | 2, 8          |

## Ordering Rationale

**Module-side foundations first (tasks 1 + 2).** Both are independent of the demo work and stand alone. Task 1 unblocks per-status link rendering for any action whose `status_map` carries `link:` (existing and new). Task 2 exports the new component lead-view will consume.

**Action authoring is parallel (tasks 3–7).** Each new action file is self-contained — its only references are to module exports (`_module.pageId`, the shared `task-edit` page, the `installation` child workflow type) that already exist on disk per part 20a + the resolver wiring already on `main`. The files can land independently; they aren't "live" until task 8 wires them into `onboarding.yaml`'s `actions:` array.

**Workflow restructure is the wiring step (task 8).** Replaces the three trackers in `onboarding.yaml`'s `actions[]` with the five new actions, restructures `action_groups`, `starting_actions`, and `blocked_by`, deletes the three tracker-step files, and authors the `g1.on_complete` routine file. Depends on every action file existing first so the `_ref`s resolve at build time.

**UI work after wiring (task 9).** The lead-view modal references both the new action types (via the `actions:` payload it constructs) and the `entity-workflows-refetch` component. Depends on task 2 (component exists) and task 8 (workflow surfaces actions correctly). Task 6 specifically must land first because the modal's submit payload constructs `proof-of-installation` instances by `key`.

**README last (task 10).** Documents what the rest of the work shipped. Depends on the new component existing (task 2) and the resolver-emitted page/endpoint ids being verifiable (task 8 — once the workflow is wired the resolver actually emits them).

**Parallelizable.** Tasks 1, 2, and 3–7 can all run in parallel (no shared files). Task 8 serializes the action authoring. Tasks 9 and 10 can run in parallel after task 8.

## Scope

**Source:** `designs/workflows-module/parts/20b-module-manifest-dynamic/design.md`
**Context files considered:** none beyond design.md (no supporting files in this design folder).
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` — already incorporated into design.md.
