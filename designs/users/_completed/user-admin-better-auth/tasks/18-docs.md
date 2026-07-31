# Task 18: Docs — module reference, generated vars, precondition, migration guide

## Context

Consumer-facing documentation lives in `docs/`. The rebuilt module changes its
entire surface (vars, pages, connections, dependencies, behaviour), so the
`docs/user-admin/` tree and the generated `vars.md` must be updated. `docs/` is
the source of truth for consumer-observable behaviour. The manifest is the source
of truth for var schema — `vars.md` is **generated** from it, never hand-edited.

Design sections: Module surface, Decisions 1–8, "Retired vs today". Consider
`.claude/skills/r:design-docs` conventions.

## Task

- **`docs/user-admin/index.md`** — rewrite the module landing page: the reframe
  (operator console for one pinned org's access lifecycle), the Members/Invitations
  list, the single user detail page, the email-first invite flow, the new vars
  (`impersonation`, `suspension`, `download`, admin-roles var; renamed `fields.*`),
  dropped `notifications` dependency, and the retired surface (`edit`/`check`
  pages, `app_name`/`roles`/`app_domain` vars, Atlas `$search`).
- **Same-database co-location precondition** (Decision 1) — document it as a hard
  consumer precondition (auth adapter DB + `user-contacts` + read connections must
  resolve to one MongoDB database; the failure mode is silent blank contact data).
  Add to the module docs and, if a shared idiom page fits, `docs/shared/`.
- **Regenerate `docs/user-admin/reference/vars.md`** via `pnpm docs:gen` (do not
  hand-edit). Ensure every manifest var carries `description`/`type`/`default`/
  `required`/`enum` as applicable so generation is clean.
- **Consumer migration guide** (v0.x vars/slots/pages → the new surface) — the
  design flags this as an implementation task written once the design is
  finalised. Cover the var renames/removals, page renames, the dropped
  `notifications` dependency, the role catalog replacing the `roles` var, and the
  co-location precondition.
- **Shared idioms** — if `write-profile` / `create-or-link-contact` warrant a
  `docs/shared/` note, add it (they are shared files `_ref`'d by relative path,
  not module exports).
- Update `docs/index.md`'s user-admin one-liner and dependency graph (drop the
  `user-admin --> notifications` edge).

## Acceptance Criteria

- `docs/user-admin/index.md` reflects the rebuilt surface and behaviour; the
  co-location precondition is documented.
- `docs/user-admin/reference/vars.md` is regenerated from the manifest (not
  hand-edited) and matches it.
- A migration guide exists for consumers upgrading from the v0.x surface.
- `docs/index.md` module table + dependency graph updated (no `user-admin →
notifications`).
- `pnpm docs:check` passes (front-matter valid, generated files not stale).

## Files

- `docs/user-admin/index.md` — rewrite
- `docs/user-admin/reference/vars.md` — regenerate (via `pnpm docs:gen`)
- `docs/user-admin/how-to/` or `concepts/` — migration guide + precondition page as fits
- `docs/shared/*.md` — shared-fragment note if warranted
- `docs/index.md` — module one-liner + dependency graph

## Notes

- Do not "fix" `docs/` to match a stale design — `docs/` wins on behaviour.
- Front-matter schema is required on every `docs/` file (see `docs/CONTRIBUTING.md`).
