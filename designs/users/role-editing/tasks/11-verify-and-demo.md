# Task 11: Verify the corrections and wire the demo verification path

## Context

Final task — exercise the feature. The autonomous parts are the build check and
inspecting the built artifacts (this is how the stale gap notes were caught in the
first place). The behavioural parts (index `explain`, resend downgrade re-test,
orphan behaviour) need a live DB / the auth-testing rig and are **not** part of an
autonomous build gate — call them out and hand them off.

Depends on tasks 1–10 being complete.

## Task

### Autonomous (build + artifact inspection)

1. **`pnpm ldf:b`** from `apps/demo` (or `pnpm --filter @lowdefy/modules-demo ldf:b`).
   Config must compile.
2. **Inspect the built artifacts:**
   - `apps/demo/.lowdefy/server/build/pages/user-admin/view.json` — the access
     modal's options are the catalog map concatenated with the orphan map; the
     resolved role entries carry `id` + `description`; the roles field has **no**
     `required`.
   - `apps/demo/.lowdefy/server/build/pages/user-admin/all.json` — the Role
     filter's options carry the two-line label + `tag`; the members rows carry
     neither `roles_arr` nor `role_ids`.
   - Confirm `grep -rn "roles_arr\|role_ids" modules/user-admin/` is empty.
3. **`pnpm docs:check`** passes (indexes page + llms.txt from task 9; row-contract
   from task 10).

### Demo consumer / verification path

The design's Files-changed table lists `apps/demo/` as "a worked example /
verification path for an orphan-holding member." An orphan is a **data state** (a
member holding a role id that the demo `auth.roles` catalog no longer declares), not
config — so the demo's role is to give the rig a reproducible target. Provide
whatever demo-side setup is needed to exercise an orphan against the demo catalog
(e.g. a documented seed member holding a since-removed role id), without mutating
any real data. **Do not run any data-mutating script or write to a database** — if
the verification needs seeded data, describe the exact seed and hand it to the user
(per CLAUDE.md: writes require an explicit request).

### Non-autonomous (hand off — live DB / auth-testing rig)

Record these as outstanding checks for the user / the auth-testing campaign
(`designs/users/auth-testing/`):

- **Index (D7).** Run `explain` on the filtered members read against real data and
  confirm the compound `{ organizationId: 1, appRoles: 1 }` index serves it (not a
  `COLLSCAN` or an `appRoles`-only index). Record the result in the design. **If it
  does not coalesce, put `organizationId` back into the pre-join `$match` stage in
  `get_all_members.yaml`.** Also exercise the filter set and unset (unset = match-all;
  set = same rows as before).
- **Resend downgrade (D-resend).** Resend a pending `admin`/`owner` invitation from
  **both** callers — the Invitations table button and the invite page's pending
  panel — with each payload field omitted in turn, and read the invitation's
  `role` / `appRoles` / `attributes` back **unchanged** each time.
- **Orphan behaviour (against a member holding a role removed from the demo
  catalog):** the tile shows a flagged `⚑ <id>` chip and an ordinary chip shows its
  description on hover; the picker shows `<id> (no longer configured)`, closable,
  **with text** (not blank); saving with it selected **succeeds** and reads back
  still held; adding an unrelated role while it is selected saves both with **no
  `null`** in `appRoles`; removing it and saving succeeds and it is then absent from
  the picker's options; attributes save in every case; typing a description word
  finds the role in the picker and the filter.

## Acceptance Criteria

- `pnpm ldf:b` and `pnpm docs:check` pass.
- Built `view.json` / `all.json` show the concatenated orphan options, resolved
  `id` + `description`, rich filter options with `tag`, no `required` on the role
  arrays, and no `roles_arr` / `role_ids` on any row.
- `grep` for the raw-id aliases in `modules/user-admin/` is empty.
- The non-autonomous checks are written up as outstanding hand-off items (with the
  index `explain` fallback noted), not silently skipped.

## Notes

Per CLAUDE.md, a build check is not a smoke test and the rig/live-DB steps are a
human or `/r:dev-test` concern. A clean build + artifact inspection + a written
hand-off of the behavioural checks is a complete deliverable for this task.
