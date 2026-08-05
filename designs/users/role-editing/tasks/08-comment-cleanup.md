# Task 8: Cut journey / stale-model comments in the API files

## Context

The migration left journey and task-number comments in three endpoint files that,
per the repo comment rule (CLAUDE.md), narrate history rather than describe the
current code. Independent of all other tasks — pure comment edits, no behaviour.

## Task

1. **`modules/user-admin/api/invite.yaml`** — cut the `task-5` journey reference in
   the header comment ("design Decision 7 + task-5 stale-expired …"). Keep the
   description of what the endpoint does (submit the invite form, reconcile a
   stale-expired pending row, create-or-link, InviteMember, audit) — just drop the
   task-number framing.
2. **`modules/user-admin/api/suspend.yaml`** — cut the `task 13` reference ("the UI
   surface is also excluded — task 13"). Keep the behavioural note (reject path,
   role-gated app-side) without the task number.
3. **`modules/user-admin/api/update-access.yaml`** — cut the stale "array-only …
   never a CSV" comment framed against the removed model. The role-write step
   property is `appRoles` (an array); describe the current contract if a comment is
   still warranted, but do not frame it against a model that no longer exists.

## Acceptance Criteria

- No `task-5`, `task 13`, or "never a CSV" / removed-model framing in the three
  files.
- Remaining comments describe the current code (no "used to", "no longer",
  task-numbers).
- `pnpm ldf:b` succeeds (comment-only changes; build should be unaffected).

## Notes

These are comment-only. Do not alter routine steps, payloads, or gating.
