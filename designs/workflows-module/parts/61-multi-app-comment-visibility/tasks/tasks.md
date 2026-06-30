# Implementation Tasks — Part 61: Multi-app comment visibility (shared vs internal)

## Overview

These tasks implement Part 61: a workflow comment becomes visible to **all** of the workflow's apps by default (`shared`), with an opt-in **internal** option that keeps it in the submitting app's bucket only. The change is centred on the single `foldCommentIntoEvent` chokepoint (Part 33 D3) and threads a new `comment_visibility` choice from the comment surfaces through both write paths (submit + Part 24 update-fields) to the fold, gated server-side by a per-app `enable_internal_comments` connection flag. Derived from `designs/workflows-module/parts/61-multi-app-comment-visibility/design.md`.

The UI half also extracts a single shared comment-input fragment that is **text-only** on every surface (design D6): inline images are disabled on all comment inputs. This generalises [Part 62](designs/workflows-module/parts/_completed/62-changes-requested-callout/design.md)'s request-changes-only text-only change (its task 4) to every comment surface, and the fragment (tasks 7–8) supersedes Part 62's inline text-only edits once it lands.

## Tasks

| #   | File                                   | Summary                                                                                         | Depends On |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-fold-comment-fanout.md`            | Add `visibility` + `enableInternalComments` args to `foldCommentIntoEvent`; fan out `shared`    | —          |
| 2   | `02-schema-connection-flag.md`         | Add the optional `enable_internal_comments` connection property to `WorkflowAPI/schema.js`      | —          |
| 3   | `03-plan-event-dispatch-thread.md`     | Thread `comment_visibility` + `connection.enable_internal_comments` through `planEventDispatch` | 1, 2       |
| 4   | `04-thread-caller-planners.md`         | Thread `comment_visibility` through `planSubmit`, `planFieldsUpdate`, `UpdateActionFields`      | 3          |
| 5   | `05-endpoint-payload-mapping.md`       | Map `comment_visibility` from payload on both endpoints in `makeWorkflowApis.js`                | 4          |
| 6   | `06-module-var-and-connection-wire.md` | Add `enable_internal_comments` module var + wire it onto `connections/workflow-api.yaml`        | 2          |
| 7   | `07-shared-visibility-fragment.md`     | Extract the single shared comment-input + visibility-control fragment                           | 6          |
| 8   | `08-apply-fragment-at-surfaces.md`     | Drop the fragment at every comment-input site; reset toggle on close; wire universal-fields     | 5, 7       |

## Ordering Rationale

The work splits into a **plugin/engine half** (tasks 1–5) and a **module/UI half** (tasks 6–8), with the engine accepting and enforcing the choice before the UI starts sending it.

- **Task 1** is the heart of the change — the `foldCommentIntoEvent` fan-out — and depends on nothing. **Task 2** (the connection schema property) is an independent config-contract change that can land in parallel with task 1.
- **Task 3** wires the choice into `planEventDispatch`, which both reads the new connection flag (task 2) and calls the new fold signature (task 1), so it depends on both.
- **Task 4** threads the param through the three callers that reach `planEventDispatch` (`planSubmit` directly; `UpdateActionFields` → `planFieldsUpdate`). It depends on task 3 because that defines the param `planEventDispatch` now consumes.
- **Task 5** maps `comment_visibility` off the request payload onto the two endpoints; it depends on task 4 so the handler actually consumes the key.
- **Task 6** defines the host-facing `enable_internal_comments` module var and wires it onto the connection — it depends on task 2 (the connection property must exist to wire into). **Task 7** extracts the shared comment-input + visibility-control fragment, which reads that module var at build time, so it depends on task 6.
- **Task 8** drops the fragment at every comment site and completes the Part 24 payload wiring; it depends on both the fragment (task 7) and the endpoint mapping (task 5) for an end-to-end shared/internal flow.

Tasks 1 and 2 can run in parallel. Tasks 6 (and its dependent 7) can proceed in parallel with the engine chain 3→4→5 once 2 is done. The two halves converge at task 8.

## Scope

**Source:** `designs/workflows-module/parts/61-multi-app-comment-visibility/design.md`
**Context files considered:** `designs/workflows-module/parts/62-changes-requested-callout/design.md` (+ its `tasks/04-text-only-comment-input.md`) — Part 62 is in implementation and makes the request-changes comment inputs text-only; D6 generalises that here and tasks 7–8 supersede those inline edits.
**Review files skipped:** `review/` (entire subfolder).
