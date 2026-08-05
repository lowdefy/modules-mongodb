# Task 10: Update the members row contract for the dropped aliases

## Context

`docs/user-admin/reference/row-contract.md` documents the row keys a
`components.table_columns` `field:` or `components.download_columns` `value:` may
bind. It currently publishes `roles_arr` as a contract field and describes the two
role keys (`roles_arr` + `roles`), plus a "Breaking change" callout telling
consumers to bind `roles_arr` for the ids. After task 7 drops both raw-id aliases
from the wire, the doc must match: `roles` is the single roles binding, now carrying
`id` + `description` (D-alias, D4).

Depends on task 7 (the aliases are actually gone from the reads) so the doc
describes the shipped wire, not a plan.

## Task

Edit `docs/user-admin/reference/row-contract.md`:

1. **Remove `roles_arr` from the keys table** (the `| roles_arr | string[] | … |`
   row). Update the `roles` row's type from `{label, orphan}[]` to
   `{ id, label, description, orphan }[]`, resolved against the app's role catalog.
2. **Rewrite the "The two role keys, and the organization tier" section** to
   describe a single app-role key:
   - `roles` is the member's app roles resolved against the catalog into
     `{ id, label, description, orphan }` objects (`id` = the stored id,
     `description` = catalog description or `null`, `orphan: true` = held but no
     longer in the catalog). It is the one roles binding.
   - Drop the `roles_arr` bullet and the "raw ids as stored, nothing reads it" text.
   - Keep the `member.role` / `org_role` paragraph unchanged (the tier is still not
     on the members/invitations row; the detail read alone publishes `org_role`).
3. **Replace the "Breaking change" callout.** It currently says a `field: role`
   blanks and tells consumers to bind `roles_arr` for the ids. Now both a raw-id
   binding (`roles_arr` / `role_ids`) **and** `role` blank; the ids are available
   per-entry on `roles` (`roles[].id`). State that `roles_arr` and `role_ids` are
   removed and `roles` is the single roles binding.
4. **Update the Export divergences section** — the `roles` export bullet currently
   says "`roles_arr` still carries the array itself on both branches." Drop that;
   the export's `roles` column is the stored ids joined by `", "` and there is no
   `roles_arr`. Remove the invitation-row `role_ids` mention in the
   "Binding something outside the contract" / invitation-keys paragraph.
5. **Record the org-authority Decision 11 reversal** — a short note that the module
   previously kept `roles_arr` as a published contract field (org-authority
   Decision 11) on the premise a consumer binds `table_columns` /
   `download_columns` to the raw ids; that premise does not hold for this module
   (consumers bind their own custom attributes; roles display through resolved
   `roles`), so both raw-id aliases are dropped and `roles` is the single surface.

Do not change the front-matter `title` / `module` / `type` / `concepts` (so no
`llms.txt` regen is required for this edit — `docs:gen` in task 9 covers the new
page).

## Acceptance Criteria

- No `roles_arr` and no `role_ids` in `row-contract.md` except where explicitly
  recording their removal / the Decision 11 reversal.
- The `roles` key is documented as `{ id, label, description, orphan }[]` and named
  the single roles binding.
- The breaking-change callout reflects both raw-id names removed.
- `pnpm docs:check` passes (front-matter unchanged; body edits do not affect
  `llms.txt`).

## Notes

`docs/user-admin/how-to/migration.md` (line ~206) also references `roles_arr` as a
bind target. If time permits, align that mention with the reversal; if the design's
Files-changed table does not list `migration.md`, treat it as out of strict scope
but flag the residual reference for a follow-up rather than leaving it silently
contradicting the contract.
