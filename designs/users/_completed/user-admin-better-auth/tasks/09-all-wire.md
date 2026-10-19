# Task 9: `all` screen — wire (reads, export, invitation actions)

## Context

Final phase for the `all` page: resolve every `TODO(request-substitute)` marker
(task 8) into real `connections:` / `requests:` / operators / state / events. No
bespoke skill — consume the markers directly, using the `lowdefy-docs` MCP (or
`/lowdefy-config`) for request/operator/connection schemas and the aggregation
pipelines (`connections/mongodb`, `MongoDBAggregation`). The read connections
were declared in task 1; the invitation row-action routines were built in task 5.

Design sections: Decisions 1 and 2 (reads, org scoping, search, sort, status
derivation, export merge).

## Task

Wire the two tabs and the export as native aggregations (all reads stay native —
`$lookup` joins by `userId`/`contactId`, no adapter helpers):

**Members read** — root on `user-members`, `$match` on
`user-members.organizationId` using the server-side `_organization` operator
(`_organization: id` — the resolved pinned org; there is no `org` var).
`$lookup` → `users` and `user-contacts`. Columns: name (contact), email
(`user.email`), roles (**`$split` the CSV `member.role`** — nothing reads a role
array from the DB), status, dates (created/updated from the `contact`
change-stamp; signed-up from `member.createdAt`). Status derivation: member row +
`user.banned` not true → **Active**; member row + `user.banned: true` →
**Suspended**.

**Filters/sort** — search is plain `$match` **regex/text** over contact name /
emails / `user.email` (no Atlas `$search` — it can't run post-`$lookup`). The
**role filter matches exact elements of the split array** (`$in`/equality against
the post-`$split` array), never substring/regex over the raw CSV. Status
segmented filters on the derived status. Sort is server-side `$sort` **after the
joins** (orders the whole result set across pages); the direction toggle flips
`sort.order` between `-1`/`1` and re-runs. The `request_stages.filter_match` slot
appends plain `$match` clauses; `request_stages.get_all_users` appends list/export
stages.

**Invitations read** — root on `user-invitations`, `$match organizationId`
(`_organization: id`) and `status: "pending"` (excludes accepted/rejected/canceled).
Split **Invited** (`expiresAt` ≥ now) vs **Expired** (`expiresAt` < now) — there
is no `expired` status in BetterAuth, it's derived. `$lookup` the inviter for the
"Invited by" column. Pending-count badge from this read.

**Invitation row actions** — Resend → `resend-invitation`; Cancel → `cancel-invitation`
(task 5); Re-invite (expired) → the invite flow (the `invite` routine self-reconciles
the stale expired `pending` row via cancel-then-invite — task 5; no duplicate is
created). Refetch the tab after each.

**Pagination** — each tab is server-side paginated with its **own independent
state** (page + page size). Bind that state into the read pipeline as `$skip` /
`$limit` applied **after** the `$sort` (so paging walks the fully-ordered result
set, per Decision 2). Return the total in the same aggregation via a `$facet`
splitting the post-sort pipeline into `rows` (`$skip` + `$limit`) and `total`
(`$count`) — one round-trip feeds both the Pagination block and the row/pending
counts. Drive `pageSize` / page from the tab's pagination state through the
request `_payload`. The Invitations pending-count badge and the Members result
count read the `total` from their respective `$facet` (not `rows.length`). See the
`lowdefy-docs` MCP `input-blocks/pagination` doc for the block ↔ request wiring.
The export pipeline is **not** paginated (it emits the full set).

**Export** (behind the `download` var) — one merged sheet with a `status` column
(Active / Suspended / Invited / Expired): the union of members + invitations lives
**only** in the export pipeline. Uses the xlsx plugin and `download_columns` slot.

## Acceptance Criteria

- Members and invitations tables load from native `$lookup` aggregations scoped
  by `_organization: id`; no Atlas `$search`; roles come from `$split`.
- Role filter matches exact split-array elements (a filter for `admin` does not
  match `super-admin`).
- Sort is a post-join `$sort` ordering the full result set; the toggle re-runs
  the query.
- Each tab paginates server-side with independent state: `$skip`/`$limit` after
  the `$sort`, and a `$facet`/`$count` stage supplies the total driving the
  Pagination block and the result/pending counts (not `rows.length`). The export
  pipeline is not paginated.
- Invitations show only `pending` rows, split into Invited/Expired on `expiresAt`;
  the pending-count badge is correct; Resend/Cancel/Re-invite call the task-5
  routines and refetch.
- The export (when `download` is true) produces one sheet merging both with a
  `status` column; excluded entirely when `download` is false.
- Every `TODO(request-substitute)` marker from task 8 is resolved; `pnpm ldf:b`
  compiles.

## Files

- `modules/user-admin/pages/all.yaml` — add `requests:` / state / events; resolve markers
- `modules/user-admin/requests/*.yaml` — create list, invitations, and export pipelines (extract stages to `requests/stages/`)
- `modules/user-admin/components/*.yaml` — wire filter/table/action blocks

## Notes

- All reads depend on the same-database co-location precondition (Decision 1): a
  cross-DB `$lookup` silently returns empty — surfaces as blank contact data in
  dev/test.
- Last-active is deliberately **not** a list column (would force a sessions
  `$lookup` + max-reduce per row) — session detail lives on `view`.
- Sizing target is low-thousands of members; a post-join `$match` is a linear
  scan, acceptable at that scale (Decision 2).
