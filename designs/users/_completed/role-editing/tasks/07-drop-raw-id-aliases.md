# Task 7: Drop the `roles_arr` / `role_ids` raw-id aliases

## Context

The module publishes the member's app-role ids under three names (D-alias):
`roles_arr` (from `members_base.yaml` / `invitations_base.yaml`), `role_ids` (a
duplicate id array in `get_user_detail.yaml` and `invitations_base.yaml`), and
`roles` (the same ids resolved against the catalog into objects). `roles_arr` and
`role_ids` are the identical raw id array under two names — two paths to one value,
which `close_row.yaml`'s rule 2 forbids in its own words.

Both raw-id aliases are dropped. `roles` — now carrying `id` per entry (task 1) — is
the single roles surface. This reverses org-authority Decision 11 on new evidence:
no consumer binds the raw ids (consumers bind their own custom attributes; roles
display through the resolved `roles` column on the table and export), and no
internal reader needs them once `roles` carries `id`.

**Both internal readers of `role_ids` must already be moved** before this task drops
the alias:

- `get_user_detail.yaml`'s `role_ids` and the access-modal seed — done in task 2.
- The Invitations-list Resend button's `row.role_ids` — done in task 6.
  `roles_arr` has no internal reader.

The export (`get_users_excel_data.yaml`) computes its own `roles` string directly
from `$appRoles` before `close_row` runs, so it does **not** read `roles_arr` — this
change is safe for the export.

## Task

### `modules/user-admin/requests/stages/members_base.yaml`

- **Remove the `roles_arr` `$addFields`** (the `$ifNull: ["$appRoles", []]` block,
  ~lines 73–76). Update the header comment: the display shape no longer lists
  `roles_arr`; the `$ifNull` "keys exist even when source doesn't" note drops its
  `roles_arr` mention (keep it for `picture`/`created`/`updated`). No journey framing.

### `modules/user-admin/requests/stages/invitations_base.yaml`

- **Remove both the `roles_arr` and `role_ids` `$addFields`** (~lines 31–39).
- **Fix the header comment** — drop the "`roles_arr` / `role_ids` — the two
  published wire names … the list's Resend button reads `role_ids`" lines. The
  invitation's app roles ride only `appRoles` (unset in `close_row`) and surface
  resolved as `roles` where the export needs them. State the current shape.

### `modules/user-admin/requests/stages/close_row.yaml`

- **Reduce rule 2's alias list** to the single roles path: `appRoles → roles`
  (drop `roles_arr (ids)` and any `role_ids` mention). The `$unset` list is
  **unchanged** — it already strips `appRoles`, and neither alias needs unsetting
  once it is never added.
- **Correct the `role` framing** in rule 3 / the header: `role` is BetterAuth's
  owner/admin/member tier, unrelated to the app roles `roles` carries; drop the
  `roles_arr and roles` phrasing (now just `roles`). Note `role` IS published on the
  detail read under `org_role` — do not frame it as never-published.

## Acceptance Criteria

- `grep -rn "roles_arr\|role_ids" modules/user-admin/` returns **no** matches in
  config (only, at most, this design's own docs handled in task 10).
- `members_base`, `invitations_base`, `get_user_detail` (task 2) emit only `roles`
  for app roles; `close_row` rule 2 lists `appRoles → roles`.
- `pnpm ldf:b` succeeds; the built `pages/user-admin/view.json` and
  `pages/user-admin/all.json` rows carry neither `roles_arr` nor `role_ids`.

## Notes

Confirm the export still builds and its `roles` string column is unaffected —
`get_users_excel_data.yaml` builds `roles` from `$appRoles` in its own `$addFields`,
independent of the dropped aliases.
