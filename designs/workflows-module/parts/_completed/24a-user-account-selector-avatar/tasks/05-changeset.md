# Task 5: Write the changeset for Part 24a

## Context

This repo uses **changesets** (the `.changeset/` folder) rather than hand-edited `CHANGELOG.md`
files. The changesets config (`/.changeset/config.json`) version-fixes all packages together:
`"fixed": [["@lowdefy/modules-mongodb-*"]]` — so a single changeset entry bumps `user-account`,
`user-admin`, and the other modules in lockstep.

The design requires recording, **as a breaking change under a minor bump** (pre-1.0 semver: breaking
changes ride minor, not major), that `user-admin` loses the `user-selector` export and any downstream
app that `_ref`'d `_ref: { module: user-admin, component: user-selector }` must switch to
`_ref: { module: user-account, component: user-selector }`. The repo is pre-stable, so this is an
acceptable break.

This task depends on Tasks 1–3 being complete (the relocation and the two new components).

## Task

Create a new changeset file under `.changeset/` (e.g.
`.changeset/workflows-part-24a-user-account-selector-avatar.md`), following the existing format (see
`.changeset/workflows-part-32-drop-static-overrides.md`):

```markdown
---
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
---

Workflows Part 24a — relocate `user-selector` to user-account; add `user-multi-selector` and `user-avatar`.

The shared user picker moves from user-admin to user-account, the module every app ships. Two new user-account component exports support assignee workflows: a multi-select picker and a doc-shaped avatar chip.

- `user-account`: gains three component exports — `user-selector` (relocated, single-select), `user-multi-selector` (multi-select, writes an array of user ids), and `user-avatar` (inline avatar + name rendered from a user-contacts doc). The `get_users_for_selector` request moved here and serves both selectors.
- `user-admin`: **breaking** — drops the `user-selector` component export. No in-repo consumer relied on it, but any downstream app that `_ref`'d `{ module: user-admin, component: user-selector }` must switch to `{ module: user-account, component: user-selector }`. user-admin's `dependencies:` is unchanged.
```

Adjust the package keys to whatever the actual published names are if they differ from the above
(confirm against the `name` fields in each module's `package.json`). Because packages are fixed,
listing both at `minor` is sufficient; the changeset tool will bump the rest of the family with them.

## Acceptance Criteria

- A new `.changeset/*.md` file exists with valid front-matter (package name → `minor`).
- The body names: the relocation of `user-selector` + its request to user-account, the two new
  exports (`user-multi-selector`, `user-avatar`), and the **breaking** drop of `user-selector` from
  user-admin with the migration instruction.
- The package keys match the real package names in the module `package.json` files.

## Files

- `.changeset/workflows-part-24a-user-account-selector-avatar.md` — create

## Notes

- Confirm package names: `cat modules/user-account/package.json modules/user-admin/package.json | grep '"name"'`.
- Do not edit `CHANGELOG.md` directly — the changeset tool generates those at version time.
