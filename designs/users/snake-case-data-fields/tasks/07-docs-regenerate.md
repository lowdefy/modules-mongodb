# Task 7: Regenerate docs for the snake_case rename

## Context

The rename tasks (1–6) changed the documented physical column names, the row contract, and
one manifest var description. `docs/` is the source of truth for consumer-observable behaviour
and several files are **generated** (`vars.md` from the manifests, gated by `pnpm docs:check`).
This task updates the hand-authored doc pages, edits the one manifest var description that
names a physical column, then regenerates the generated files.

Nothing has shipped — write the field-name change **without breaking-change framing**.

## Task

**Hand-authored doc edits:**

- `docs/user-admin/reference/indexes.md` and `docs/user-account/reference/indexes.md` — flip
  index field names to snake_case in **both** files: `user-admin`'s
  `{ organizationId: 1, appRoles: 1 } → { organization_id: 1, app_roles: 1 }`; `user-account`'s
  `{ userId: 1 }` on `user-two-factors → { user_id: 1 }`. Index **provisioning** stays a
  host-app concern — only the documented requirement changes. **Only `user-admin` carries the
  "the rename has not landed" caveat paragraph** the repo pre-staged for this moment — **drop
  it there**; `user-account` has no such paragraph, so don't add or remove one.
- `docs/user-admin/reference/row-contract.md` — the `userId`/`organizationId` row keys become
  `user_id`/`organization_id`; the "stored fields shipped under an alias" list
  (`appRoles`, `createdAt`, `expiresAt`) updates to the snake source names
  (`app_roles`, `created_at`, `expires_at`).
- `docs/user-admin/how-to/migration.md` and `docs/user-account/how-to/migration.md` — add the
  field-name change where they enumerate the physical column names, **no breaking-change
  framing** (nothing shipped).

**Manifest var description (drives generated `vars.md`):**

- `modules/user-admin/module.lowdefy.yaml` — the `org_slug` var `description:` references the
  physical `organizationId` match; reword to `organization_id`. (The events deep-link default
  at `module.lowdefy.yaml:69` is already `?user_id={id}` — **no change**, now consistent with
  the readers.)

**Regenerate and verify:**

- Run `pnpm docs:gen` to regenerate `docs/{user-admin,user-account}/reference/vars.md` and
  `docs/llms.txt`. Do **not** hand-edit `vars.md`.
- Run `pnpm docs:check` — must pass (no drift, front-matter valid).

## Acceptance Criteria

- Both `indexes.md` files show snake_case index fields; the "not landed" caveat paragraph is
  removed from `user-admin`'s and `user-account`'s is untouched.
- `row-contract.md` row keys and alias list are snake_case.
- Both `migration.md` files document the field-name change without breaking-change framing.
- `user-admin` `org_slug` var description reads `organization_id`; `vars.md` regenerated to
  match.
- `pnpm docs:check` passes.

## Files

- `docs/user-admin/reference/indexes.md` — modify
- `docs/user-account/reference/indexes.md` — modify
- `docs/user-admin/reference/row-contract.md` — modify
- `docs/user-admin/how-to/migration.md` — modify
- `docs/user-account/how-to/migration.md` — modify
- `modules/user-admin/module.lowdefy.yaml` — modify (`org_slug` var description)
- `docs/user-admin/reference/vars.md` — regenerated (do not hand-edit)
- `docs/user-account/reference/vars.md` — regenerated (do not hand-edit)
- `docs/llms.txt` — regenerated (do not hand-edit)

## Notes

- `pnpm docs:gen` regenerates both `vars.md` files and `llms.txt`; `pnpm docs:check` runs the
  same generators in `--check` mode and fails on drift or invalid front-matter — run `gen`
  first, then `check`.
