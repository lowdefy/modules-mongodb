# Task 9: Document the role-filter index

## Context

The migration shipped the performance change — `get_all_members.yaml` emits the
roles clause as a pre-join `$match` ahead of the `$lookup`s — but the compound index
it depends on, `user-members { organizationId: 1, appRoles: 1 }`, is documented
nowhere in the `user-admin` module's docs. `docs/user-admin/` has no `indexes.md`,
and `docs/user-admin/index.md` does not mention it. A host app has no way to know it
should create the index, so the "most expensive read" falls back to a full scan,
silently, in production (D7).

The sibling modules (`user-account`, `workflows`, `contacts`, `activities`,
`companies`) each have a `docs/{module}/reference/indexes.md`. Use their framing:
_"The module does not create indexes — index creation is a host-app concern."_

## Task

1. **Create `docs/user-admin/reference/indexes.md`** with the required front-matter
   (`title`, `module: user-admin`, `type: reference`, and a `concepts:` list —
   include `indexes`, `mongodb`, `roles`, `org-slug`). Follow the sibling pages'
   structure. Document the one module-owned index:

   ```
   db["user-members"].createIndex({ organizationId: 1, appRoles: 1 })
   ```

   State:
   - **Host-app-creates** framing — the module documents the contract, the app owns
     creating it.
   - It serves the **members list role filter** — the pre-join `$match`
     `{ appRoles: { $in: … } }` on the member root, coalesced with the base's
     adjacent `$match: { organizationId }` so the compound index serves the pair.
   - `appRoles` is a native array, so the index is **multikey**, **not unique**.
   - **The field names are the physical, adapter-derived columns.** They are
     `organizationId` / `appRoles` (camelCase) **today**. The upstream
     snake-case-data-fields rename has **not** landed; when it does, this page is
     regenerated with the snake-case names (`organization_id` / `app_roles`). An
     index on camelCase keys against snake_case columns is never used — the same
     silent full scan the index exists to prevent.
   - This is a **performance** requirement, not a correctness one: the filter works
     without the index; the index is what keeps the most expensive read off a
     full scan.

2. **Link the new page from `docs/user-admin/index.md`** — add it to the
   `## Reference` list (beside `row-contract.md`, `co-location.md`, `migration.md`).

3. **Regenerate the docs index:** run `pnpm docs:gen`, which regenerates
   `docs/llms.txt` (a new page changes it) and lints front-matter. `pnpm docs:check`
   fails CI on drift, so this must be committed.

## Acceptance Criteria

- `docs/user-admin/reference/indexes.md` exists, documents
  `{ organizationId: 1, appRoles: 1 }` on `user-members`, host-app-creates framing,
  multikey/not-unique, physical camelCase names with the snake-case caveat.
- `docs/user-admin/index.md` links it from the Reference section.
- `pnpm docs:gen` run; `docs/llms.txt` updated; `pnpm docs:check` passes.

## Notes

`docs/user-account/reference/indexes.md` **already** carries a `user-members
{ organizationId: 1, appRoles: 1 }` section (it documents indexes for the auth
flows broadly). The design (D7) still calls for the index in the `user-admin`
module's own reference, since that is the module that owns the filter — follow the
design. Align the wording with the user-account page where they describe the same
index (multikey, host-creates) so the two do not contradict, but do not remove or
alter the user-account page; that is out of scope.

The `explain`-plan confirmation D7 also asks for (does the pre-join `$match`
actually use the compound index, not a `COLLSCAN` or `appRoles`-only index) is a
live-DB check — it lands in task 11. If that plan shows the index is not used, the
follow-up is to put `organizationId` back into the pre-join stage in
`get_all_members.yaml`; note that possibility but do not pre-emptively change the
stage here.
