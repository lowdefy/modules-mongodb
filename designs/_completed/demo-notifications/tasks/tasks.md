# Implementation Tasks — Demo Notifications

## Overview

These tasks implement `designs/demo-notifications/design.md`: rewrite the demo app's notifications `send_routine` to insert production-shaped notification docs for three event types (quote approval + the two user-invite mocks), and wire the missing `global.enums.event_types` global the inbox surfaces depend on.

## Tasks

| #   | File                                | Summary                                                                                   | Depends On |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-enums-event-types.md`           | Wire `global.enums.event_types` in the demo app and add the `action-approve` enum entry   | —          |
| 2   | `02-send-routine-quote-approved.md` | Rewrite `send-routine.yaml` with the quote-approved branch; enable the `send_routine` var | —          |
| 3   | `03-send-routine-invite-mock.md`    | Add the invite/resend mock-email branch to the routine                                    | 2          |

## Ordering Rationale

- **Task 1 is independent** of the routine work (different files) and could run in parallel with task 2. It comes first because tasks 2 and 3's acceptance criteria (inbox type chip renders, filter dropdown populated) need the global wired to be fully verifiable.
- **Task 2 before task 3:** both edit the same file (`send-routine.yaml`). Task 2 establishes the routine skeleton and all shared mechanics (uuid `_id` via `$function`, `key`, change-stamp `created`, `$literal` projection gotchas, `$merge` terminator) with the first branch; task 3 adds the second branch reusing those mechanics. Splitting per branch keeps each task verifiable end-to-end on its own (approve flow vs. invite flow).
- The two design-doc stub changes in the design's "Files changed" table (`parts/45-demo-rebuild/tasks/06-notifications-send-routine.md` reduced to a stub, `parts/45-demo-rebuild/design.md` item 9 annotated) are **already applied in the working tree** — no task generated for them.

## Scope

**Source:** `designs/demo-notifications/design.md`
**Context files considered:** none besides `design.md` (the design folder contains no supporting files). Code context verified directly: `apps/demo/modules/notifications/{vars,send-routine}.yaml`, `apps/demo/lowdefy.yaml`, `apps/demo/modules/events/{vars,event_types}.yaml`, `modules/events/module.lowdefy.yaml`, `modules/shared/enums/event_types.yaml`, `modules/notifications/{module.lowdefy.yaml, api/send-notification.yaml, pages/link.yaml, requests/get-notification-for-link.yaml, actions/set-types.yaml, connections/notifications-collection.yaml}`, `modules/user-admin/api/invite-user.yaml`, `modules/workflows/connections/*.yaml`, `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js`.
**Review files skipped:** none present.
**Design correction applied before task generation:** the design previously instructed adding all three enum entries app-side, claiming `modules/user-admin/enums/event_types.yaml` was orphaned. Verified false — `modules/shared/enums/event_types.yaml` (composed into the events module's `event_types` component) already refs it, so `invite-user`/`resend-user-invite` entries already exist; only `action-approve` is added. Design updated accordingly.
